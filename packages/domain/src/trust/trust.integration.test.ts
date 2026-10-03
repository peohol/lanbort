import { randomUUID } from "node:crypto";
import type { ReturnOutcome } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { changeEnvironmentType } from "../environment/type-change-commands";
import { leaveEnvironment } from "../environment/membership-commands";
import { approveLoanRequest } from "../loans/approval";
import { cancelLoan } from "../loans/cancellation";
import { reportHandover } from "../loans/handover";
import { reportReturn } from "../loans/return";
import { publishObject } from "../publications/commands";
import { submitLoanReview, respondToLoanReview } from "../reviews/commands";
import { blockUser, removeFriend } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { readTrustProfile } from "./queries";

/**
 * WP-51: contextual trust (PS-TRUST-006–012). A person's trust is derived
 * from the published reviews about them, per role, without the scores a
 * reopened loan put in doubt; the reviews themselves follow the reader's
 * current access to the person and to the context the loan came from.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const { run, tick, user, published, ask, environmentOrigin, dated, friends } =
  kit;

const notFound = { code: "not_found" };
const oneDay = 24 * 60 * 60 * 1000;

const lenderDimensions = [
  "pickup_on_time",
  "return_on_time",
  "condition_at_return",
  "communication",
];
const borrowerDimensions = [
  "available_at_handover",
  "available_for_return",
  "matches_description",
  "communication",
];

const scoring = (dimensions: readonly string[], score = 5) =>
  dimensions.map((dimension) => ({ dimension, score }));

const profileOf = (
  reader: UserActor,
  subject: UserActor,
  input: { role?: string; cursor?: string } = {},
) =>
  executeQuery(tick(), readTrustProfile, {
    actor: reader,
    input: { userId: subject.userId, ...input },
  });

const say = (actor: UserActor, loanId: string, outcome: ReturnOutcome) =>
  run(reportReturn, actor, {
    loanId,
    agreementVersion: 1,
    outcome,
    immediately: true,
  });

/**
 * A loan in the environment between `owner` and `borrower`, handed over
 * today and returned at once.
 */
async function returnedLoan(setup: {
  environmentId: string;
  objectId: string;
  owner: UserActor;
  borrower: UserActor;
}) {
  const { requestId } = await ask(
    setup.borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dated(0, 0),
  );
  const { loanId } = await run(approveLoanRequest, setup.owner, { requestId });
  await run(reportHandover, setup.owner, {
    loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });
  await say(setup.owner, loanId, "received");

  return loanId;
}

/** Both review each other at once, so both are published. */
async function reviewEachOther(
  loanId: string,
  owner: UserActor,
  borrower: UserActor,
  scores: { aboutBorrower: number; aboutLender: number },
  text: { aboutBorrower?: string; aboutLender?: string } = {},
) {
  await run(submitLoanReview, owner, {
    loanId,
    scores: scoring(lenderDimensions, scores.aboutBorrower),
    text: text.aboutBorrower ?? null,
  });
  await run(submitLoanReview, borrower, {
    loanId,
    scores: scoring(borrowerDimensions, scores.aboutLender),
    text: text.aboutLender ?? null,
  });
}

const emptyDimension = (dimension: string) => ({
  dimension,
  count: 0,
  mean: null,
  distribution: [0, 0, 0, 0, 0],
  setAside: 0,
});

describe("trust per role (PS-TRUST-006/012)", () => {
  it("keeps the person's experience as borrower and as lender apart", async () => {
    const setup = await published();
    const { owner, borrower } = setup;
    const loanId = await returnedLoan(setup);
    await reviewEachOther(
      loanId,
      owner,
      borrower,
      { aboutBorrower: 4, aboutLender: 2 },
      { aboutLender: "Kom en time for sent." },
    );

    const profile = await profileOf(borrower, borrower);

    expect(profile.asBorrower).toEqual({
      reviews: 1,
      dimensions: lenderDimensions.map((dimension) => ({
        dimension,
        count: 1,
        mean: 4,
        distribution: [0, 0, 0, 1, 0],
        setAside: 0,
      })),
    });
    expect(profile.asLender).toEqual({
      reviews: 0,
      dimensions: borrowerDimensions.map(emptyDimension),
    });
    expect(profile.reviews).toEqual([
      {
        id: expect.any(String),
        subjectRole: "borrower",
        basis: "returned",
        author: { userId: owner.userId, realName: "Test Testesen" },
        environment: { id: setup.environmentId, name: "Borettslaget" },
        scores: lenderDimensions.map((dimension) => ({
          dimension,
          score: 4,
          contested: false,
        })),
        text: null,
        publishedAt: expect.any(String),
        loanReopenedAt: null,
        response: null,
      },
    ]);

    // The lender's profile has the borrower's review of them as lender.
    const lender = await profileOf(owner, owner);
    expect(lender.asLender.dimensions.map(({ mean }) => mean)).toEqual([
      2, 2, 2, 2,
    ]);
    expect(lender.asBorrower.reviews).toBe(0);
    expect(lender.reviews[0]).toMatchObject({
      subjectRole: "lender",
      text: "Kom en time for sent.",
    });
  });

  it("counts only the dimensions the ending let reviewers assess", async () => {
    const setup = await published();
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(2, 3),
    );
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId,
    });
    await run(cancelLoan, setup.owner, { loanId });
    await run(submitLoanReview, setup.borrower, {
      loanId,
      scores: scoring(["communication"], 1),
      text: "Avlyste kvelden før.",
    });
    await run(submitLoanReview, setup.owner, {
      loanId,
      scores: scoring(["communication"], 5),
    });

    const { asLender, reviews } = await profileOf(setup.owner, setup.owner);
    expect(asLender.reviews).toBe(1);
    expect(asLender.dimensions).toEqual([
      emptyDimension("available_at_handover"),
      emptyDimension("available_for_return"),
      emptyDimension("matches_description"),
      {
        dimension: "communication",
        count: 1,
        mean: 1,
        distribution: [1, 0, 0, 0, 0],
        setAside: 0,
      },
    ]);
    expect(reviews[0]).toMatchObject({ basis: "cancelled" });
  });

  it("leaves hidden reviews out until both have reviewed or the deadline passed", async () => {
    const setup = await published();
    const { owner, borrower } = setup;
    const loanId = await returnedLoan(setup);
    await run(submitLoanReview, owner, {
      loanId,
      scores: scoring(lenderDimensions, 3),
    });

    const hidden = await profileOf(borrower, borrower);
    expect(hidden.asBorrower.reviews).toBe(0);
    expect(hidden.reviews).toEqual([]);

    // From the deadline on it counts, before the job has recorded it.
    kit.advance(15 * oneDay);
    const due = await profileOf(borrower, borrower);
    expect(due.asBorrower.reviews).toBe(1);
    expect(due.asBorrower.dimensions[0]).toMatchObject({ count: 1, mean: 3 });
    expect(due.reviews).toHaveLength(1);
  });
});

describe("who reads a trust profile (PS-TRUST-007, PS-USR-006)", () => {
  it("lets friends and fellow members read it, and nobody else", async () => {
    const setup = await published();
    const loanId = await returnedLoan(setup);
    await reviewEachOther(loanId, setup.owner, setup.borrower, {
      aboutBorrower: 5,
      aboutLender: 5,
    });
    const friend = await user();
    await friends(friend, setup.borrower);
    const stranger = await user();

    for (const reader of [friend, setup.admin, setup.owner]) {
      expect((await profileOf(reader, setup.borrower)).reviews).toHaveLength(1);
    }

    await expect(profileOf(stranger, setup.borrower)).rejects.toMatchObject(
      notFound,
    );
    await expect(
      executeQuery(tick(), readTrustProfile, {
        actor: friend,
        input: { userId: randomUUID() },
      }),
    ).rejects.toMatchObject(notFound);
  });

  it("follows current access: a friendship or membership that ended gives none", async () => {
    const setup = await published();
    const friend = await user();
    await friends(friend, setup.borrower);
    expect((await profileOf(friend, setup.borrower)).userId).toBe(
      setup.borrower.userId,
    );

    await run(removeFriend, friend, { userId: setup.borrower.userId });
    await expect(profileOf(friend, setup.borrower)).rejects.toMatchObject(
      notFound,
    );

    await run(leaveEnvironment, setup.borrower, {
      environmentId: setup.environmentId,
    });
    await expect(profileOf(setup.owner, setup.borrower)).rejects.toMatchObject(
      notFound,
    );
  });

  it("is not there across a block in either direction", async () => {
    const setup = await published();
    const other = await kit.member(setup.environmentId, setup.admin);

    await run(blockUser, setup.borrower, { userId: other.userId });

    await expect(profileOf(other, setup.borrower)).rejects.toMatchObject(
      notFound,
    );
    await expect(profileOf(setup.borrower, other)).rejects.toMatchObject(
      notFound,
    );
    // The person always reads their own.
    expect((await profileOf(setup.borrower, setup.borrower)).userId).toBe(
      setup.borrower.userId,
    );
  });

  it("does not list a review whose author and reader block each other, and counts it all the same (PS-TRUST-010)", async () => {
    const setup = await published();
    const loanId = await returnedLoan(setup);
    await reviewEachOther(
      loanId,
      setup.owner,
      setup.borrower,
      {
        aboutBorrower: 2,
        aboutLender: 5,
      },
      { aboutBorrower: "Ble levert skitten." },
    );
    const reader = await kit.member(setup.environmentId, setup.admin);
    const before = await profileOf(reader, setup.borrower);
    expect(before.reviews).toHaveLength(1);

    await run(blockUser, reader, { userId: setup.owner.userId });
    const after = await profileOf(reader, setup.borrower);

    expect(after.reviews).toEqual([]);
    expect(after.asBorrower).toEqual(before.asBorrower);
    // A block between the parties does not change the figures either.
    await run(blockUser, setup.borrower, { userId: setup.owner.userId });
    expect(
      (await profileOf(setup.borrower, setup.borrower)).asBorrower,
    ).toEqual(before.asBorrower);
  });
});

describe("reviews from a hidden environment (PS-TRUST-007, scenarios 22/54)", () => {
  it("keeps text, author and environment inside it while the figures count everywhere", async () => {
    const setup = await published({ type: "hidden", name: "Hemmelig klubb" });
    const loanId = await returnedLoan(setup);
    await reviewEachOther(
      loanId,
      setup.owner,
      setup.borrower,
      { aboutBorrower: 3, aboutLender: 5 },
      { aboutBorrower: "Greit nok." },
    );
    const friend = await user();
    await friends(friend, setup.borrower);
    const fellow = await kit.member(setup.environmentId, setup.admin);

    const outside = await profileOf(friend, setup.borrower);
    expect(outside.reviews).toEqual([]);
    expect(outside.asBorrower.reviews).toBe(1);
    expect(outside.asBorrower.dimensions[0]).toMatchObject({
      count: 1,
      mean: 3,
    });

    const inside = await profileOf(fellow, setup.borrower);
    expect(inside.reviews).toEqual([
      expect.objectContaining({
        text: "Greit nok.",
        author: { userId: setup.owner.userId, realName: "Test Testesen" },
        environment: { id: setup.environmentId, name: "Hemmelig klubb" },
      }),
    ]);
    expect(inside.asBorrower).toEqual(outside.asBorrower);

    // The person reads it; once they have left, without the environment.
    await run(leaveEnvironment, setup.borrower, {
      environmentId: setup.environmentId,
    });
    expect((await profileOf(setup.borrower, setup.borrower)).reviews).toEqual([
      expect.objectContaining({ text: "Greit nok.", environment: null }),
    ]);
  });

  it("applies the stricter rules from when an environment becomes hidden", async () => {
    const setup = await published();
    const loanId = await returnedLoan(setup);
    await reviewEachOther(
      loanId,
      setup.owner,
      setup.borrower,
      { aboutBorrower: 5, aboutLender: 5 },
      { aboutBorrower: "Alt i orden." },
    );
    const friend = await user();
    await friends(friend, setup.borrower);
    expect((await profileOf(friend, setup.borrower)).reviews).toHaveLength(1);

    await run(changeEnvironmentType, setup.admin, {
      environmentId: setup.environmentId,
      type: "hidden",
      expectedType: "open",
    });

    expect((await profileOf(friend, setup.borrower)).reviews).toEqual([]);
    expect((await profileOf(setup.owner, setup.borrower)).reviews).toHaveLength(
      1,
    );
  });
});

describe("a loan that reopens after publication (PS-TRUST-008)", () => {
  it("sets the contested scores aside without rewriting the review", async () => {
    const setup = await published();
    const { owner, borrower } = setup;
    const loanId = await returnedLoan(setup);
    await reviewEachOther(loanId, owner, borrower, {
      aboutBorrower: 5,
      aboutLender: 4,
    });

    kit.advance(oneDay);
    await say(borrower, loanId, "still_has");
    const reopenedAt = kit.now().toISOString();

    const { asBorrower, reviews } = await profileOf(borrower, borrower);
    expect(asBorrower.dimensions).toEqual([
      {
        dimension: "pickup_on_time",
        count: 1,
        mean: 5,
        distribution: [0, 0, 0, 0, 1],
        setAside: 0,
      },
      { ...emptyDimension("return_on_time"), setAside: 1 },
      { ...emptyDimension("condition_at_return"), setAside: 1 },
      {
        dimension: "communication",
        count: 1,
        mean: 5,
        distribution: [0, 0, 0, 0, 1],
        setAside: 0,
      },
    ]);
    expect(asBorrower.reviews).toBe(1);
    expect(reviews[0]).toMatchObject({
      loanReopenedAt: reopenedAt,
      scores: [
        { dimension: "pickup_on_time", score: 5, contested: false },
        { dimension: "return_on_time", score: 5, contested: true },
        { dimension: "condition_at_return", score: 5, contested: true },
        { dimension: "communication", score: 5, contested: false },
      ],
    });

    // Only the score resting on the return is in doubt for the lender.
    const lender = await profileOf(owner, owner);
    expect(
      lender.asLender.dimensions.map(({ count, setAside }) => [
        count,
        setAside,
      ]),
    ).toEqual([
      [1, 0],
      [0, 1],
      [1, 0],
      [1, 0],
    ]);
  });
});

describe("listing the reviews", () => {
  it("pages newest first and narrows to one role", async () => {
    const setup = await published();
    const { owner, borrower } = setup;

    for (const score of [1, 2, 3]) {
      // Another object each time, so every loan can be handed over today.
      const objectId = await kit.create(owner);
      await run(publishObject, owner, {
        objectId,
        environmentId: setup.environmentId,
      });
      const loanId = await returnedLoan({ ...setup, objectId });
      await reviewEachOther(
        loanId,
        owner,
        borrower,
        { aboutBorrower: 5, aboutLender: score },
        { aboutLender: `Lån ${score}` },
      );
    }

    const all = await profileOf(owner, owner);
    expect(all.reviews.map(({ text }) => text)).toEqual([
      "Lån 3",
      "Lån 2",
      "Lån 1",
    ]);
    expect(all.nextCursor).toBeNull();
    expect(all.asLender.dimensions[0]).toMatchObject({
      count: 3,
      mean: 2,
      distribution: [1, 1, 1, 0, 0],
    });

    const asBorrower = await profileOf(owner, borrower, { role: "borrower" });
    expect(asBorrower.reviews).toHaveLength(3);
    expect(
      asBorrower.reviews.every(({ subjectRole }) => subjectRole === "borrower"),
    ).toBe(true);
    expect(
      (await profileOf(owner, borrower, { role: "lender" })).reviews,
    ).toEqual([]);

    const second = await profileOf(owner, owner, {
      cursor: all.reviews[0]!.id,
    });
    expect(second.reviews.map(({ text }) => text)).toEqual(["Lån 2", "Lån 1"]);
  });

  it("shows the reviewed party's response with the review", async () => {
    const setup = await published();
    const loanId = await returnedLoan(setup);
    await reviewEachOther(
      loanId,
      setup.owner,
      setup.borrower,
      { aboutBorrower: 2, aboutLender: 5 },
      { aboutBorrower: "Ble levert sent." },
    );
    await run(respondToLoanReview, setup.borrower, {
      loanId,
      text: "Vi avtalte ny tid.",
    });

    expect(
      (await profileOf(setup.owner, setup.borrower)).reviews[0]?.response,
    ).toMatchObject({ text: "Vi avtalte ny tid." });
  });
});

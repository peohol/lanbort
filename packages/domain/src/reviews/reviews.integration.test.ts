import type { ReturnOutcome } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { cancelLoan } from "../loans/cancellation";
import { reportHandover } from "../loans/handover";
import {
  acceptResponsibilityTransfer,
  offerResponsibility,
} from "../loans/responsibility";
import { reportReturn } from "../loans/return";
import { approveLoanRequest } from "../loans/approval";
import { blockUser } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  publishDueLoanReviews,
  respondToLoanReview,
  submitLoanReview,
} from "./commands";
import { reviewDueAt } from "./model";
import { reviewPublicationProcess } from "./policies";
import { readLoanReviews } from "./queries";

/**
 * WP-50: review rights and double-blind publication (PS-TRUST-001–005, and
 * the reopening of PS-TRUST-008 as far as reviews are concerned): the ending
 * decides what can be reviewed, a review stays hidden until both have
 * reviewed or the 14 days are over, a published review is locked, the
 * reviewed party responds once, a block takes nothing away, and a loan that
 * reopens pauses its hidden reviews and marks its published ones.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  user,
  published,
  ask,
  environmentOrigin,
  dated,
  addCoOwner,
  reservedLoan,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const conflict = { code: "conflict" };
const invalid = (fields: string[]) => ({ code: "invalid_input", fields });
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

/** Every dimension scored `score`. */
const scoring = (dimensions: readonly string[], score = 5) =>
  dimensions.map((dimension) => ({ dimension, score }));

const submit = (
  actor: UserActor,
  loanId: string,
  scores: readonly object[],
  options: { text?: string | null; expectedVersion?: number } = {},
) => run(submitLoanReview, actor, { loanId, scores, ...options });

const respond = (actor: UserActor, loanId: string, text: string) =>
  run(respondToLoanReview, actor, { loanId, text });

const reviewsOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoanReviews, { actor, input: { loanId } });

const publishDue = () =>
  run(publishDueLoanReviews, systemActor(reviewPublicationProcess), {});

const handOver = (actor: UserActor, loanId: string) =>
  run(reportHandover, actor, {
    loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });

const sayNow = (actor: UserActor, loanId: string, outcome: ReturnOutcome) =>
  run(reportReturn, actor, {
    loanId,
    agreementVersion: 1,
    outcome,
    immediately: true,
  });

const window = (loanId: string) =>
  db
    .selectFrom("app.loan_review_periods")
    .selectAll()
    .where("loan_id", "=", loanId)
    .executeTakeFirst();

const storedReviews = (loanId: string) =>
  db
    .selectFrom("app.loan_reviews")
    .select(["id", "author_role", "status", "published_at", "version"])
    .where("loan_id", "=", loanId)
    .orderBy("submitted_at")
    .execute();

const reviewEvents = async (loanId: string) => {
  const reviews = await storedReviews(loanId);
  const events = await Promise.all(
    reviews.map((review) => eventsFor("loan_review", review.id)),
  );

  return events.flat().map((event) => ({
    type: event.event_type,
    payload: event.payload,
  }));
};

/** A loan for days 0–2 handed over today and returned at once. */
async function returnedLoan() {
  const loan = await reservedLoan(0, 2);
  await handOver(loan.owner, loan.loanId);
  await sayNow(loan.owner, loan.loanId, "received");
  return loan;
}

describe("review rights follow how the loan ended (PS-TRUST-001)", () => {
  it("opens a 14-day window with every dimension after a return", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    const stored = await window(loanId);

    expect(stored).toMatchObject({
      status: "open",
      basis: "returned",
      borrower_user_id: borrower.userId,
      lender_user_id: owner.userId,
    });
    expect(stored?.due_at).toEqual(reviewDueAt(stored!.opened_at));
    expect(await reviewsOf(borrower, loanId)).toEqual({
      loanId,
      role: "borrower",
      window: {
        status: "open",
        basis: "returned",
        dueAt: reviewDueAt(stored!.opened_at).toISOString(),
        dimensions: borrowerDimensions,
      },
      own: null,
      received: null,
    });
    expect((await reviewsOf(owner, loanId)).window?.dimensions).toEqual(
      lenderDimensions,
    );
  });

  it("leaves out what assumes the loan happened after a cancellation", async () => {
    const { borrower, owner, loanId } = await reservedLoan();
    await run(cancelLoan, owner, { loanId });

    for (const actor of [borrower, owner]) {
      expect((await reviewsOf(actor, loanId)).window).toMatchObject({
        basis: "cancelled",
        dimensions: ["communication"],
      });
    }

    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions)),
    ).rejects.toMatchObject(invalid(["scores"]));
    expect(
      await submit(borrower, loanId, scoring(["communication"], 4)),
    ).toMatchObject({ status: "hidden", version: 1 });
  });

  it("keeps the handover appointment, not the loan, when it was not completed", async () => {
    const { borrower, owner, loanId } = await reservedLoan(0, 1);
    kit.advance(oneDay);
    for (const actor of [borrower, owner]) {
      await run(reportHandover, actor, {
        loanId,
        agreementVersion: 1,
        outcome: "not_handed_over",
      });
    }

    expect((await reviewsOf(borrower, loanId)).window).toMatchObject({
      basis: "not_completed",
      dimensions: ["available_at_handover", "communication"],
    });
    expect((await reviewsOf(owner, loanId)).window).toMatchObject({
      basis: "not_completed",
      dimensions: ["pickup_on_time", "communication"],
    });
  });

  it("has no window before the loan ends, and only for its parties", async () => {
    const { borrower, owner, admin, loanId } = await reservedLoan();
    const stranger = await user();

    expect(await reviewsOf(owner, loanId)).toEqual({
      loanId,
      role: "lender",
      window: null,
      own: null,
      received: null,
    });
    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions)),
    ).rejects.toMatchObject(conflict);

    await run(cancelLoan, borrower, { loanId });
    for (const actor of [stranger, admin]) {
      await expect(reviewsOf(actor, loanId)).rejects.toMatchObject(notFound);
      await expect(
        submit(actor, loanId, scoring(["communication"])),
      ).rejects.toMatchObject(notFound);
      await expect(respond(actor, loanId, "Takk")).rejects.toMatchObject(
        notFound,
      );
    }
  });

  it("lets a co-owner who is not the lender see nothing", async () => {
    const setup = await published();
    const coOwner = await user();
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(2, 4),
    );
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId,
    });
    await run(cancelLoan, setup.owner, { loanId });

    await expect(reviewsOf(coOwner, loanId)).rejects.toMatchObject(notFound);
    await expect(
      submit(coOwner, loanId, scoring(["communication"])),
    ).rejects.toMatchObject(notFound);
  });
});

describe("scores and explanations (PS-TRUST-002)", () => {
  it("scores every dimension of the side once, 1–5", async () => {
    const { borrower, loanId } = await returnedLoan();

    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions.slice(1))),
    ).rejects.toMatchObject(invalid(["scores"]));
    await expect(
      submit(borrower, loanId, scoring(lenderDimensions)),
    ).rejects.toMatchObject(invalid(["scores"]));
    await expect(
      submit(borrower, loanId, [
        ...scoring(borrowerDimensions),
        { dimension: "communication", score: 4 },
      ]),
    ).rejects.toMatchObject(invalid(["scores"]));
    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions, 6)),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await storedReviews(loanId)).toEqual([]);
  });

  it("needs one short explanation when any score is 1 or 2", async () => {
    const { borrower, loanId } = await returnedLoan();
    const scores = [
      ...scoring(borrowerDimensions.slice(0, 3), 5),
      { dimension: "communication", score: 2 },
    ];

    await expect(submit(borrower, loanId, scores)).rejects.toMatchObject(
      invalid(["text"]),
    );
    await expect(
      submit(borrower, loanId, scores, { text: "   " }),
    ).rejects.toMatchObject(invalid(["text"]));

    await submit(borrower, loanId, scores, {
      text: "  Svarte ikke på meldinger.  ",
    });
    expect((await reviewsOf(borrower, loanId)).own).toMatchObject({
      text: "Svarte ikke på meldinger.",
      scores: [
        { dimension: "available_at_handover", score: 5, contested: false },
        { dimension: "available_for_return", score: 5, contested: false },
        { dimension: "matches_description", score: 5, contested: false },
        { dimension: "communication", score: 2, contested: false },
      ],
    });
  });

  it("does not need an explanation for 3 and above", async () => {
    const { owner, loanId } = await returnedLoan();

    expect(
      await submit(owner, loanId, scoring(lenderDimensions, 3)),
    ).toMatchObject({ status: "hidden" });
  });
});

describe("double-blind publication (PS-TRUST-003–004)", () => {
  it("hides a review until both have reviewed, then publishes both at once", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    const first = await submit(
      borrower,
      loanId,
      scoring(borrowerDimensions, 4),
    );

    expect(first).toEqual({
      loanId,
      reviewId: expect.any(String),
      version: 1,
      status: "hidden",
    });
    // The lender learns nothing of it, not even that it exists.
    expect(await reviewsOf(owner, loanId)).toMatchObject({
      own: null,
      received: null,
    });
    expect((await reviewsOf(borrower, loanId)).own).toMatchObject({
      id: first.reviewId,
      status: "hidden",
      publishedAt: null,
    });

    const second = await submit(owner, loanId, scoring(lenderDimensions, 5));
    expect(second).toMatchObject({ status: "published", version: 1 });

    const reviews = await storedReviews(loanId);
    expect(reviews.map(({ status }) => status)).toEqual([
      "published",
      "published",
    ]);
    expect(reviews[0]?.published_at).toEqual(reviews[1]?.published_at);
    expect(await window(loanId)).toMatchObject({
      status: "closed",
      closed_as: "both_submitted",
    });

    const borrowerView = await reviewsOf(borrower, loanId);
    expect(borrowerView.window?.status).toBe("closed");
    expect(borrowerView.received).toMatchObject({
      id: second.reviewId,
      authorRole: "lender",
      status: "published",
      scores: scoring(lenderDimensions, 5).map((score) => ({
        ...score,
        contested: false,
      })),
      loanReopenedAt: null,
      response: null,
    });
    expect((await reviewsOf(owner, loanId)).received?.id).toBe(first.reviewId);

    expect(await reviewEvents(loanId)).toEqual([
      {
        type: "loan_review.submitted",
        payload: { loanId, authorRole: "borrower" },
      },
      {
        type: "loan_review.published",
        payload: { loanId, authorRole: "borrower", basis: "both_submitted" },
      },
      {
        type: "loan_review.submitted",
        payload: { loanId, authorRole: "lender" },
      },
      {
        type: "loan_review.published",
        payload: { loanId, authorRole: "lender", basis: "both_submitted" },
      },
    ]);
  });

  it("lets the author revise a hidden review, and locks it once published", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    const { reviewId } = await submit(
      borrower,
      loanId,
      scoring(borrowerDimensions, 3),
    );

    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions, 4)),
    ).rejects.toMatchObject({ code: "conflict", fields: ["expectedVersion"] });
    expect(
      await submit(borrower, loanId, scoring(borrowerDimensions, 4), {
        text: "Fint lån.",
        expectedVersion: 1,
      }),
    ).toEqual({ loanId, reviewId, version: 2, status: "hidden" });
    // The same content again changes nothing; a stale version is refused.
    expect(
      await submit(borrower, loanId, scoring(borrowerDimensions, 4), {
        text: "Fint lån.",
        expectedVersion: 2,
      }),
    ).toMatchObject({ version: 2 });
    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions, 5), {
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject(conflict);

    await submit(owner, loanId, scoring(lenderDimensions));
    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions, 1), {
        text: "Likevel ikke bra.",
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject(conflict);
    expect((await reviewsOf(owner, loanId)).received).toMatchObject({
      version: 2,
      text: "Fint lån.",
    });
    await expect(
      db
        .updateTable("app.loan_reviews")
        .set({ body: "Omskrevet" })
        .where("id", "=", reviewId)
        .execute(),
    ).rejects.toThrow(/cannot change/);
  });

  it("publishes a lone review when the 14 days are over, also before the job", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    const { reviewId } = await submit(
      owner,
      loanId,
      scoring(lenderDimensions, 4),
    );
    const due = (await window(loanId))!.due_at!;

    kit.advance(due.getTime() - kit.now().getTime() - 2);
    expect((await reviewsOf(borrower, loanId)).received).toBeNull();

    kit.advance(2);
    // Reads count it as published from the deadline on.
    expect((await reviewsOf(borrower, loanId)).received).toMatchObject({
      id: reviewId,
      status: "published",
      publishedAt: due.toISOString(),
    });
    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions)),
    ).rejects.toMatchObject(conflict);

    await publishDue();
    expect(await window(loanId)).toMatchObject({
      status: "closed",
      closed_as: "deadline",
      closed_at: due,
    });
    expect(await storedReviews(loanId)).toEqual([
      expect.objectContaining({ status: "published", published_at: due }),
    ]);
    expect((await reviewEvents(loanId)).at(-1)).toEqual({
      type: "loan_review.published",
      payload: { loanId, authorRole: "lender", basis: "deadline" },
    });

    // Running again publishes nothing more for this loan.
    await publishDue();
    expect(await reviewEvents(loanId)).toHaveLength(2);
  });

  it("closes a window with no review without counting the silence", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    kit.advance(15 * oneDay);
    await publishDue();

    expect(await window(loanId)).toMatchObject({ status: "closed" });
    for (const actor of [borrower, owner]) {
      expect(await reviewsOf(actor, loanId)).toMatchObject({
        own: null,
        received: null,
      });
    }
  });

  it("publishes once when both parties review at the same moment", async () => {
    const { borrower, owner, loanId } = await returnedLoan();

    const results = await Promise.all([
      submit(borrower, loanId, scoring(borrowerDimensions)),
      submit(owner, loanId, scoring(lenderDimensions)),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "hidden",
      "published",
    ]);
    expect((await storedReviews(loanId)).map(({ status }) => status)).toEqual([
      "published",
      "published",
    ]);
    expect(
      (await reviewEvents(loanId)).filter(
        ({ type }) => type === "loan_review.published",
      ),
    ).toHaveLength(2);
  });

  it("decides one way when a review and the deadline job meet", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    await submit(owner, loanId, scoring(lenderDimensions));
    kit.advance(14 * oneDay);

    const [late] = await Promise.allSettled([
      submit(borrower, loanId, scoring(borrowerDimensions)),
      publishDue(),
    ]);

    expect(late).toMatchObject({ status: "rejected", reason: conflict });
    // Whoever came first, the refused review closed nothing for good.
    await publishDue();
    expect(await storedReviews(loanId)).toEqual([
      expect.objectContaining({ author_role: "lender", status: "published" }),
    ]);
  });

  it("makes a due return confirmation first, which opens the window", async () => {
    const loan = await reservedLoan(0, 2);
    await handOver(loan.owner, loan.loanId);
    await run(reportReturn, loan.owner, {
      loanId: loan.loanId,
      agreementVersion: 1,
      outcome: "received",
    });
    expect(await window(loan.loanId)).toBeUndefined();

    kit.advance(31 * 1000);
    expect(
      await submit(loan.borrower, loan.loanId, scoring(borrowerDimensions)),
    ).toMatchObject({ status: "hidden" });
    expect(await window(loan.loanId)).toMatchObject({ basis: "returned" });
  });
});

describe("the one response (PS-TRUST-005)", () => {
  it("lets the reviewed party respond once to a published review", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    const { reviewId } = await submit(
      owner,
      loanId,
      [
        ...scoring(lenderDimensions.slice(0, 3), 4),
        { dimension: "communication", score: 1 },
      ],
      { text: "Vanskelig å få tak i." },
    );

    // Nothing to respond to while it is hidden.
    await expect(
      respond(borrower, loanId, "Jeg var bortreist."),
    ).rejects.toMatchObject(conflict);

    await submit(borrower, loanId, scoring(borrowerDimensions));
    const answer = await respond(borrower, loanId, "Jeg var bortreist.");
    expect(answer).toEqual({
      loanId,
      reviewId,
      respondedAt: expect.any(String),
    });
    // The same response again returns it; another one is refused.
    expect(await respond(borrower, loanId, "Jeg var bortreist.")).toEqual(
      answer,
    );
    await expect(
      respond(borrower, loanId, "Og en ting til."),
    ).rejects.toMatchObject(conflict);

    // The author sees it with their review and cannot answer it.
    expect((await reviewsOf(owner, loanId)).own?.response).toEqual({
      text: "Jeg var bortreist.",
      respondedAt: answer.respondedAt,
    });
    expect((await reviewsOf(borrower, loanId)).received?.response).toEqual({
      text: "Jeg var bortreist.",
      respondedAt: answer.respondedAt,
    });
    // The lender responds to the borrower's review, not to their own.
    await respond(owner, loanId, "Takk for lånet.");
    expect((await reviewsOf(borrower, loanId)).own?.response?.text).toBe(
      "Takk for lånet.",
    );
    // The response never changes the scores.
    expect((await reviewsOf(borrower, loanId)).received?.scores).toHaveLength(
      4,
    );
  });

  it("has nothing to respond to when the other party did not review", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    await submit(borrower, loanId, scoring(borrowerDimensions));
    kit.advance(15 * oneDay);

    await expect(respond(borrower, loanId, "Hei")).rejects.toMatchObject(
      conflict,
    );
    expect(await respond(owner, loanId, "Takk")).toMatchObject({ loanId });
  });
});

describe("a block takes nothing earned away (PS-TRUST-009)", () => {
  it("lets both review and respond after blocking each other", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    await run(blockUser, borrower, { userId: owner.userId });

    await submit(
      owner,
      loanId,
      [
        ...scoring(lenderDimensions.slice(0, 3)),
        { dimension: "communication", score: 2 },
      ],
      { text: "Ubehagelig tone." },
    );
    expect(
      await submit(borrower, loanId, scoring(borrowerDimensions)),
    ).toMatchObject({ status: "published" });
    expect(
      await respond(borrower, loanId, "Det er jeg uenig i."),
    ).toMatchObject({ loanId });
  });
});

describe("a loan that reopens (PS-TRUST-008)", () => {
  it("pauses a hidden review and opens a new window at the next ending", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    const { reviewId } = await submit(
      borrower,
      loanId,
      scoring(borrowerDimensions, 4),
    );

    kit.advance(oneDay);
    await sayNow(owner, loanId, "not_received");
    expect(await window(loanId)).toMatchObject({
      status: "paused",
      due_at: null,
    });
    expect((await reviewsOf(borrower, loanId)).window).toMatchObject({
      status: "paused",
      dueAt: null,
    });
    await expect(
      submit(owner, loanId, scoring(lenderDimensions)),
    ).rejects.toMatchObject(conflict);
    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions, 3), {
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject(conflict);

    // Nothing is published while it is paused, however long it lasts.
    kit.advance(20 * oneDay);
    await publishDue();
    expect((await storedReviews(loanId))[0]?.status).toBe("hidden");

    await sayNow(owner, loanId, "received");
    const reopened = (await window(loanId))!;
    expect(reopened).toMatchObject({ status: "open", basis: "returned" });
    expect(reopened.due_at).toEqual(reviewDueAt(reopened.opened_at));
    expect(reopened.opened_at.getTime()).toBeGreaterThan(
      kit.now().getTime() - 1000,
    );

    // The hidden review stands and can be adjusted to the new ending.
    expect(
      await submit(borrower, loanId, scoring(borrowerDimensions, 3), {
        expectedVersion: 1,
      }),
    ).toEqual({ loanId, reviewId, version: 2, status: "hidden" });
    expect(
      await submit(owner, loanId, scoring(lenderDimensions, 3)),
    ).toMatchObject({ status: "published" });
  });

  it("marks a published review and its contested scores, never rewriting it", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    await submit(borrower, loanId, scoring(borrowerDimensions, 5));
    await submit(owner, loanId, scoring(lenderDimensions, 5));

    kit.advance(oneDay);
    await sayNow(borrower, loanId, "still_has");
    const reopenedAt = kit.now().toISOString();

    const seen = await reviewsOf(borrower, loanId);
    expect(seen.window?.status).toBe("closed");
    expect(seen.received).toMatchObject({
      status: "published",
      loanReopenedAt: reopenedAt,
      scores: [
        { dimension: "pickup_on_time", score: 5, contested: false },
        { dimension: "return_on_time", score: 5, contested: true },
        { dimension: "condition_at_return", score: 5, contested: true },
        { dimension: "communication", score: 5, contested: false },
      ],
    });
    expect(
      (await reviewsOf(owner, loanId)).received?.scores.map(
        ({ contested }) => contested,
      ),
    ).toEqual([false, true, false, false]);

    // A new ending does not open the closed window again.
    await sayNow(owner, loanId, "received");
    expect(await window(loanId)).toMatchObject({ status: "closed" });
    await expect(
      submit(borrower, loanId, scoring(borrowerDimensions), {
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject(conflict);
  });

  it("publishes as of the deadline when the loan reopens after it", async () => {
    const { borrower, owner, loanId } = await returnedLoan();
    await submit(borrower, loanId, scoring(borrowerDimensions));
    const due = (await window(loanId))!.due_at!;

    kit.advance(15 * oneDay);
    await sayNow(owner, loanId, "not_received");
    const reopenedAt = kit.now().toISOString();

    expect(await window(loanId)).toMatchObject({
      status: "closed",
      closed_as: "deadline",
      closed_at: due,
    });
    expect((await reviewsOf(owner, loanId)).received).toMatchObject({
      status: "published",
      publishedAt: due.toISOString(),
      loanReopenedAt: reopenedAt,
    });
  });

  it("lapses a hidden review when the lender's role moved while it was reopened", async () => {
    const setup = await published();
    const coOwner = await user();
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(0, 2),
    );
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId,
    });
    await handOver(setup.owner, loanId);
    await sayNow(setup.owner, loanId, "received");
    const { reviewId } = await submit(
      setup.borrower,
      loanId,
      scoring(borrowerDimensions),
    );

    await sayNow(setup.borrower, loanId, "still_has");
    const { transferId } = await run(offerResponsibility, setup.owner, {
      loanId,
      toUserId: coOwner.userId,
    });
    await run(acceptResponsibilityTransfer, coOwner, { loanId, transferId });
    await sayNow(coOwner, loanId, "received");

    expect(await window(loanId)).toMatchObject({
      status: "open",
      lender_user_id: coOwner.userId,
    });
    expect(
      (await storedReviews(loanId)).find(({ id }) => id === reviewId)?.status,
    ).toBe("lapsed");
    await expect(reviewsOf(setup.owner, loanId)).rejects.toMatchObject(
      notFound,
    );
    expect((await reviewsOf(setup.borrower, loanId)).own).toBeNull();
    expect(
      await submit(setup.borrower, loanId, scoring(borrowerDimensions, 4)),
    ).toMatchObject({ version: 1, status: "hidden" });
    expect(
      await submit(coOwner, loanId, scoring(lenderDimensions, 4)),
    ).toMatchObject({ status: "published" });
  });
});

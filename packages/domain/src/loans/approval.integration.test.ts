import { randomUUID } from "node:crypto";
import { responsibilityDeclarationVersion } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { addDays, calendarDate } from "../objects/availability";
import { leaveObject } from "../objects/co-owners";
import { loadObjectState } from "../objects/state";
import { archiveObject, updateObject } from "../objects/commands";
import { consentToObjectDeletion } from "../objects/deletion";
import { setObjectRestriction } from "../objects/restrictions";
import { setObjectApproval } from "../publications/commands";
import { blockUser, removeFriend } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { approveLoanRequest } from "./approval";
import { acceptResponsibility, confirmLoanTerms } from "./commands";
import { listLoanRequests, readLoan, readLoanRequest } from "./queries";
import { reserveLoan } from "./reservations";
import { findLoanRequest, loadDerivedAvailability } from "./store";

/**
 * WP-31: approval and reservation (PS-LOAN-006–008, PS-NFR-004) and the
 * parts of quality gate B they cover.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  user,
  member,
  create,
  addCoOwner,
  friends,
  versionOf,
  published,
  environmentOrigin,
  ask,
  stored,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };

const today = () => calendarDate(kit.now());
/** The calendar date `n` days from today. */
const day = (n: number) => addDays(today(), n);
const dated = (from: number, to: number) => ({
  start: { kind: "date", date: day(from) },
  end: { kind: "date", date: day(to) },
});

const approve = (actor: UserActor, requestId: string, key?: string) =>
  run(approveLoanRequest, actor, { requestId }, key);

const loanOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoan, { actor, input: { loanId } });

const readRequest = (actor: UserActor, requestId: string) =>
  executeQuery(tick(), readLoanRequest, { actor, input: { requestId } });

async function lenderList(actor: UserActor) {
  const { requests } = await executeQuery(tick(), listLoanRequests, {
    actor,
    input: { role: "lender" },
  });

  return requests.map((request) => request.id);
}

const reservations = (objectId: string) =>
  db
    .selectFrom("app.loan_reservations")
    .select(["loan_id", (eb) => eb.cast<string>("period", "text").as("period")])
    .where("object_id", "=", objectId)
    .execute();

const loansFor = (requestId: string) =>
  db
    .selectFrom("app.loans")
    .selectAll()
    .where("request_id", "=", requestId)
    .execute();

/** Days from today on that are actually available for new loans. */
async function effective(objectId: string) {
  return (await loadDerivedAvailability(db, objectId, today())).effective;
}

const ended = (reason: string) => ({ status: "ended", end_reason: reason });

/** An object with two co-owners, published where the borrowers are members. */
async function coOwned() {
  const setup = await published();
  const coOwner = await member(setup.environmentId, setup.admin);
  await addCoOwner(setup.owner, setup.objectId, coOwner);

  return { ...setup, coOwner };
}

describe("approving a request (PS-LOAN-006)", () => {
  it("makes it a loan with its agreement, responsible lender and reservation", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
      dated(2, 4),
    );

    const approved = await approve(owner, requestId);
    expect(approved).toEqual({
      requestId,
      loanId: expect.any(String),
      status: "approved",
      period: { start: day(2), end: day(4) },
    });

    expect(await stored(requestId)).toMatchObject({ status: "approved" });
    const expectedLoan = {
      id: approved.loanId,
      requestId,
      objectId,
      borrowerUserId: borrower.userId,
      responsibleLenderId: owner.userId,
      status: "reserved",
      period: { start: day(2), end: day(4) },
      agreement: {
        version: 1,
        objectVersion: await versionOf(objectId),
        title: "Tilhenger",
        categoryId: "annet",
        description: "Liten tilhenger med presenning.",
        loanTerms: "Må vaskes etter bruk.",
        responsibilityDeclarationVersion: null,
      },
    };
    expect(await loanOf(owner, approved.loanId)).toMatchObject({
      ...expectedLoan,
      role: "lender",
    });
    expect(await loanOf(borrower, approved.loanId)).toMatchObject({
      ...expectedLoan,
      role: "borrower",
    });
    expect(await readRequest(borrower, requestId)).toMatchObject({
      status: "approved",
      loanId: approved.loanId,
    });

    // The period is reserved for the object, globally.
    expect(await reservations(objectId)).toEqual([
      { loan_id: approved.loanId, period: `[${day(2)},${day(5)})` },
    ]);
    expect(await effective(objectId)).toEqual([
      { from: today(), until: day(2) },
      { from: day(5), until: null },
    ]);

    // Events name ids only: no dates, terms or message.
    expect(await eventsFor("loan_request", requestId)).toEqual([
      expect.objectContaining({ event_type: "loan_request.created" }),
      {
        event_type: "loan_request.approved",
        payload: { objectId, loanId: approved.loanId },
      },
    ]);
    expect(await eventsFor("loan", approved.loanId)).toEqual([
      {
        event_type: "loan.reserved",
        payload: { objectId, requestId, agreementVersion: 1 },
      },
    ]);
  });

  it("fixes «as soon as possible» to the earliest period that fits whole", async () => {
    const { environmentId, owner, borrower, admin, objectId } =
      await published();
    const origin = environmentOrigin(environmentId);
    const soon = await ask(borrower, objectId, origin, {
      end: { kind: "duration", days: 3 },
    });
    const other = await member(environmentId, admin);
    const { requestId } = await ask(other, objectId, origin, dated(1, 2));

    await approve(owner, requestId);
    // Three days no longer fit from today, but they still do later.
    expect(await stored(soon.requestId)).toMatchObject({
      status: "requested",
    });

    expect(await approve(owner, soon.requestId)).toMatchObject({
      period: { start: day(3), end: day(5) },
    });
  });

  it("is retry-safe: the same key replays, another key returns the same loan", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    const key = randomUUID();

    const first = await approve(owner, requestId, key);
    expect(await approve(owner, requestId, key)).toEqual(first);
    expect(await approve(owner, requestId)).toEqual(first);

    expect(await loansFor(requestId)).toHaveLength(1);
    expect(await reservations(objectId)).toHaveLength(1);
    expect(
      (await eventsFor("loan_request", requestId)).filter(
        (event) => event.event_type === "loan_request.approved",
      ),
    ).toHaveLength(1);
  });

  it("is only for an owner who sees the request", async () => {
    const { environmentId, admin, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    await expect(approve(borrower, requestId)).rejects.toMatchObject(forbidden);
    await expect(approve(admin, requestId)).rejects.toMatchObject(notFound);
    await expect(approve(await user(), requestId)).rejects.toMatchObject(
      notFound,
    );
    expect(await loansFor(requestId)).toEqual([]);
  });

  it("refuses a request that has ended, waits for terms or is held", async () => {
    const { environmentId, owner, borrower, objectId } = await published();

    const archived = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    await run(archiveObject, owner, { objectId });
    expect(await stored(archived.requestId)).toMatchObject(
      ended("object_unavailable"),
    );
    await expect(approve(owner, archived.requestId)).rejects.toMatchObject(
      conflict,
    );

    const second = await published();
    const waiting = await ask(
      second.borrower,
      second.objectId,
      environmentOrigin(second.environmentId),
    );
    await run(updateObject, second.owner, {
      objectId: second.objectId,
      expectedVersion: await versionOf(second.objectId),
      loanTerms: "Nye vilkår.",
    });
    await expect(
      approve(second.owner, waiting.requestId),
    ).rejects.toMatchObject({ ...conflict, fields: ["termsVersion"] });

    // Once the borrower confirms the new terms, the agreement carries them.
    await run(confirmLoanTerms, second.borrower, {
      requestId: waiting.requestId,
      termsVersion: await versionOf(second.objectId),
    });
    const { loanId } = await approve(second.owner, waiting.requestId);
    expect((await loanOf(second.borrower, loanId)).agreement.loanTerms).toBe(
      "Nye vilkår.",
    );

    const third = await published();
    const held = await ask(
      third.borrower,
      third.objectId,
      environmentOrigin(third.environmentId),
    );
    await run(setObjectApproval, third.admin, {
      environmentId: third.environmentId,
      required: true,
    });
    await expect(approve(third.owner, held.requestId)).rejects.toMatchObject(
      conflict,
    );
    expect(await stored(held.requestId)).toMatchObject({
      status: "requested",
    });
  });

  it("refuses a period that is no longer available, leaving the request open", async () => {
    const { environmentId, owner, coOwner, borrower, objectId } =
      await coOwned();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
      dated(3, 5),
    );
    await run(setObjectRestriction, coOwner, {
      objectId,
      period: { start: day(4), end: day(4) },
    });

    await expect(approve(owner, requestId)).rejects.toMatchObject({
      ...conflict,
      fields: ["start"],
    });
    expect(await stored(requestId)).toMatchObject({ status: "requested" });
    expect(await reservations(objectId)).toEqual([]);
  });

  it("keeps the agreement as approved when the object changes later (Port B)", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    const { loanId } = await approve(owner, requestId);
    const before = await loanOf(borrower, loanId);

    await run(updateObject, owner, {
      objectId,
      expectedVersion: await versionOf(objectId),
      title: "Stor tilhenger",
      description: "Ny presenning.",
      loanTerms: "Andre vilkår.",
    });

    expect(await loanOf(borrower, loanId)).toEqual(before);
    expect(await stored(requestId)).toMatchObject({ status: "approved" });
    await expect(
      db
        .updateTable("app.loan_agreements")
        .set({ loan_terms: "Endret" })
        .where("loan_id", "=", loanId)
        .execute(),
    ).rejects.toMatchObject({ code: "23001" });
  });
});

describe("a direct friend loan and the declaration (PS-LOAN-003)", () => {
  it("needs the approving owner's own acceptance of the current declaration", async () => {
    const owner = await user();
    const coOwner = await user();
    const borrower = await user();
    const objectId = await create(owner, "Rengjøres etter bruk.");
    await addCoOwner(owner, objectId, coOwner);
    await friends(borrower, owner);
    await friends(borrower, coOwner);
    const { requestId } = await ask(borrower, objectId, { kind: "direct" });

    // The co-owner accepted, but the owner who approves has not.
    await run(acceptResponsibility, coOwner, {
      requestId,
      declarationVersion: responsibilityDeclarationVersion,
    });
    await expect(approve(owner, requestId)).rejects.toMatchObject({
      ...conflict,
      fields: ["responsibility"],
    });

    await run(acceptResponsibility, owner, {
      requestId,
      declarationVersion: responsibilityDeclarationVersion,
    });
    const { loanId } = await approve(owner, requestId);
    expect(await loanOf(borrower, loanId)).toMatchObject({
      responsibleLenderId: owner.userId,
      agreement: { responsibilityDeclarationVersion },
    });
  });

  it("is refused by the database without both acceptances", async () => {
    const owner = await user();
    const borrower = await user();
    const objectId = await create(owner);
    await friends(borrower, owner);
    const { requestId } = await ask(borrower, objectId, { kind: "direct" });
    const object = await loadObjectState(db, objectId);

    await expect(
      db.transaction().execute((tx) =>
        reserveLoan(tx, {
          requestId,
          object: object!,
          borrowerUserId: borrower.userId,
          lenderUserId: owner.userId,
          termsVersion: object!.version,
          responsibilityDeclarationVersion,
          period: { from: day(1), until: day(2) },
          now: kit.now(),
        }),
      ),
    ).rejects.toMatchObject({ code: "23001" });
    expect(await loansFor(requestId)).toEqual([]);
  });
});

describe("co-owners (PS-LOAN-008)", () => {
  it("makes the co-owner who approves the one responsible lender", async () => {
    const { environmentId, owner, coOwner, borrower, objectId } =
      await coOwned();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    const { loanId } = await approve(coOwner, requestId);
    expect(await loanOf(coOwner, loanId)).toMatchObject({
      responsibleLenderId: coOwner.userId,
      role: "lender",
    });
    // The other co-owner sees the request, not the loan's private side.
    expect(await lenderList(owner)).toContain(requestId);
    await expect(loanOf(owner, loanId)).rejects.toMatchObject(notFound);

    // The reservation is the responsible lender's commitment.
    await expect(run(leaveObject, coOwner, { objectId })).rejects.toMatchObject(
      conflict,
    );
    await expect(
      run(consentToObjectDeletion, owner, { objectId }),
    ).rejects.toMatchObject(conflict);
    await run(leaveObject, owner, { objectId });
    expect((await loanOf(coOwner, loanId)).status).toBe("reserved");
  });

  it("is not for a co-owner without the borrower's relation to the origin", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const outsider = await user();
    await addCoOwner(owner, objectId, outsider);
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    await expect(approve(outsider, requestId)).rejects.toMatchObject(notFound);
  });
});

describe("colliding requests (PS-LOAN-007)", () => {
  it("end neutrally when one is approved, while the others stay open", async () => {
    const { environmentId, admin, owner, borrower, objectId } =
      await published();
    const origin = environmentOrigin(environmentId);
    const asker = async () => member(environmentId, admin);
    const approved = await ask(borrower, objectId, origin, dated(3, 6));
    const outrun = await asker();
    const overlapping = await ask(outrun, objectId, origin, dated(5, 8));
    const touching = await ask(await asker(), objectId, origin, dated(7, 9));
    const before = await ask(await asker(), objectId, origin, dated(0, 2));
    // As soon as possible: four days still fit after the reservation.
    const later = await ask(await asker(), objectId, origin, {
      end: { kind: "duration", days: 4 },
    });
    // As soon as possible, but by day 5: no longer fits anywhere.
    const blocked = await ask(await asker(), objectId, origin, {
      end: { kind: "date", date: day(5) },
    });

    await approve(owner, approved.requestId);

    expect(await stored(overlapping.requestId)).toMatchObject(
      ended("period_unavailable"),
    );
    expect(await stored(blocked.requestId)).toMatchObject(
      ended("period_unavailable"),
    );
    for (const open of [touching, before, later]) {
      expect(await stored(open.requestId)).toMatchObject({
        status: "requested",
      });
    }
    expect(await eventsFor("loan_request", overlapping.requestId)).toEqual([
      expect.objectContaining({ event_type: "loan_request.created" }),
      {
        event_type: "loan_request.ended",
        payload: { objectId, reason: "period_unavailable" },
      },
    ]);

    // The ended request says nothing about whose request was approved.
    expect(await readRequest(outrun, overlapping.requestId)).toMatchObject({
      status: "ended",
      endReason: "period_unavailable",
      loanId: null,
    });
  });
});

describe("access at approval (PS-LOAN-002, Port B)", () => {
  it("stops the loan when access is gone before approval", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    await run(leaveEnvironment, borrower, { environmentId });

    await expect(approve(owner, requestId)).rejects.toMatchObject(conflict);
    expect(await stored(requestId)).toMatchObject(ended("access_lost"));

    const friendOwner = await user();
    const friend = await user();
    await friends(friend, friendOwner);
    const direct = await create(friendOwner);
    const asked = await ask(friend, direct, { kind: "direct" });
    await run(acceptResponsibility, friendOwner, {
      requestId: asked.requestId,
      declarationVersion: responsibilityDeclarationVersion,
    });
    await run(removeFriend, friendOwner, { userId: friend.userId });

    await expect(approve(friendOwner, asked.requestId)).rejects.toMatchObject(
      notFound,
    );
    expect(await loansFor(asked.requestId)).toEqual([]);
  });

  it("keeps the loan and what it needs when access is gone after approval", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    const { loanId } = await approve(owner, requestId);
    await run(leaveEnvironment, borrower, { environmentId });

    expect(await stored(requestId)).toMatchObject({ status: "approved" });
    expect((await loanOf(borrower, loanId)).status).toBe("reserved");
    expect((await loanOf(owner, loanId)).status).toBe("reserved");
    expect(await lenderList(owner)).toContain(requestId);

    const friendOwner = await user();
    const friend = await user();
    await friends(friend, friendOwner);
    const direct = await create(friendOwner);
    const asked = await ask(friend, direct, { kind: "direct" });
    await run(acceptResponsibility, friendOwner, {
      requestId: asked.requestId,
      declarationVersion: responsibilityDeclarationVersion,
    });
    const directLoan = await approve(friendOwner, asked.requestId);
    await run(blockUser, friendOwner, { userId: friend.userId });

    expect(await stored(asked.requestId)).toMatchObject({
      status: "approved",
    });
    expect((await loanOf(friend, directLoan.loanId)).status).toBe("reserved");
    expect(await lenderList(friendOwner)).toContain(asked.requestId);
    expect(await reservations(direct)).toHaveLength(1);
  });
});

describe("concurrent approvals (PS-NFR-004, Port B)", () => {
  it("never double-books: two co-owners approving overlapping requests at once", async () => {
    for (let round = 0; round < 5; round += 1) {
      const { environmentId, admin, owner, coOwner, borrower, objectId } =
        await coOwned();
      const origin = environmentOrigin(environmentId);
      const first = await ask(borrower, objectId, origin, dated(2, 5));
      const second = await ask(
        await member(environmentId, admin),
        objectId,
        origin,
        dated(4, 7),
      );

      const results = await Promise.allSettled([
        approve(owner, first.requestId),
        approve(coOwner, second.requestId),
      ]);

      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toEqual(
        expect.objectContaining({ reason: expect.objectContaining(conflict) }),
      );
      expect(await reservations(objectId)).toHaveLength(1);
      const statuses = [
        (await stored(first.requestId)).status,
        (await stored(second.requestId)).status,
      ].sort();
      expect(statuses).toEqual(["approved", "ended"]);
    }
  });

  it("makes one loan when the same request is approved twice at once", async () => {
    const { environmentId, owner, coOwner, borrower, objectId } =
      await coOwned();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    const [a, b] = await Promise.all([
      approve(owner, requestId),
      approve(coOwner, requestId),
    ]);
    expect(a.loanId).toBe(b.loanId);
    expect(await loansFor(requestId)).toHaveLength(1);
  });

  it("approves requests that do not overlap, also at the same time", async () => {
    const { environmentId, admin, owner, coOwner, borrower, objectId } =
      await coOwned();
    const origin = environmentOrigin(environmentId);
    const first = await ask(borrower, objectId, origin, dated(1, 3));
    const second = await ask(
      await member(environmentId, admin),
      objectId,
      origin,
      dated(4, 6),
    );

    await Promise.all([
      approve(owner, first.requestId),
      approve(coOwner, second.requestId),
    ]);
    expect(await reservations(objectId)).toHaveLength(2);
  });

  it("never approves on access or terms that are gone at the same moment", async () => {
    for (let round = 0; round < 3; round += 1) {
      const env = await published();
      const envRequest = await ask(
        env.borrower,
        env.objectId,
        environmentOrigin(env.environmentId),
      );
      await Promise.allSettled([
        approve(env.owner, envRequest.requestId),
        run(leaveEnvironment, env.borrower, {
          environmentId: env.environmentId,
        }),
      ]);

      const friendOwner = await user();
      const friend = await user();
      await friends(friend, friendOwner);
      const object = await create(friendOwner);
      const direct = await ask(friend, object, { kind: "direct" });
      await run(acceptResponsibility, friendOwner, {
        requestId: direct.requestId,
        declarationVersion: responsibilityDeclarationVersion,
      });
      await Promise.allSettled([
        approve(friendOwner, direct.requestId),
        run(blockUser, friendOwner, { userId: friend.userId }),
      ]);

      const terms = await published();
      const termsRequest = await ask(
        terms.borrower,
        terms.objectId,
        environmentOrigin(terms.environmentId),
      );
      const version = await versionOf(terms.objectId);
      await Promise.allSettled([
        approve(terms.owner, termsRequest.requestId),
        run(updateObject, terms.owner, {
          objectId: terms.objectId,
          expectedVersion: version,
          loanTerms: "Strengere vilkår.",
        }),
      ]);

      // Either the approval came first and the loan stands, or the loss
      // came first and there is no loan: never a loan for a request that
      // ended, and never an agreement on terms the borrower did not see.
      for (const requestId of [envRequest.requestId, direct.requestId]) {
        const { status } = await stored(requestId);
        const loans = await loansFor(requestId);
        expect(status === "approved").toBe(loans.length === 1);
        expect(["approved", "ended"]).toContain(status);
      }

      const { status } = await stored(termsRequest.requestId);
      const loans = await loansFor(termsRequest.requestId);
      expect(status === "approved").toBe(loans.length === 1);
      if (loans[0]) {
        expect(
          (await loanOf(terms.borrower, loans[0].id)).agreement.loanTerms,
        ).toBe("Må vaskes etter bruk.");
      } else {
        expect(status).toBe("awaiting_terms_confirmation");
      }
    }
  });

  it("is refused by the database even without the domain's lock", async () => {
    const { environmentId, admin, owner, borrower, objectId } =
      await published();
    const origin = environmentOrigin(environmentId);
    const first = await ask(borrower, objectId, origin, dated(2, 5));
    const otherBorrower = await member(environmentId, admin);
    const second = await ask(otherBorrower, objectId, origin, dated(3, 4));
    const object = (await loadObjectState(db, objectId))!;
    const reserve = (requestId: string, borrowerUserId: string, n: number) =>
      db.transaction().execute((tx) =>
        reserveLoan(tx, {
          requestId,
          object,
          borrowerUserId,
          lenderUserId: owner.userId,
          termsVersion: object.version,
          responsibilityDeclarationVersion: null,
          period: { from: day(n), until: day(n + 2) },
          now: kit.now(),
        }),
      );

    const results = await Promise.allSettled([
      reserve(first.requestId, borrower.userId, 2),
      reserve(second.requestId, otherBorrower.userId, 3),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toEqual(
      expect.objectContaining({
        reason: expect.objectContaining({ code: "23P01" }),
      }),
    );
    expect(await reservations(objectId)).toHaveLength(1);
    const approvedCount = (
      await Promise.all(
        [first, second].map((request) =>
          findLoanRequest(db, request.requestId),
        ),
      )
    ).filter((request) => request?.status === "approved").length;
    expect(approvedCount).toBe(1);
  });
});

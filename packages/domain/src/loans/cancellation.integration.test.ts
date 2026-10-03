import { randomUUID } from "node:crypto";
import { responsibilityDeclarationVersion } from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { calendarDate } from "../objects/availability";
import { leaveObject } from "../objects/co-owners";
import { consentToObjectDeletion } from "../objects/deletion";
import { blockUser, removeFriend } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { proposeLoanAmendment } from "./amendments";
import { approveLoanRequest } from "./approval";
import { cancelLoan } from "./cancellation";
import { acceptResponsibility } from "./commands";
import { listLoanRequests, readLoan, readLoanRequest } from "./queries";
import { loadDerivedAvailability } from "./store";

/**
 * WP-32: either party cancels a reserved loan before the handover
 * (PS-LOAN-011, scenarios 19, 28 and 47), and the parts of quality gate B it
 * covers.
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
  environmentOrigin,
  ask,
  day,
  dated,
  reservedLoan,
  stored,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const conflict = { code: "conflict" };
const oneDay = 24 * 60 * 60 * 1000;

const cancel = (actor: UserActor, loanId: string, key?: string) =>
  run(cancelLoan, actor, { loanId }, key);

const loanOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoan, { actor, input: { loanId } });

const reservations = (loanId: string) =>
  db
    .selectFrom("app.loan_reservations")
    .select("loan_id")
    .where("loan_id", "=", loanId)
    .execute();

const agreements = (loanId: string) =>
  db
    .selectFrom("app.loan_agreements")
    .select(["version", sql<string>`period::text`.as("period")])
    .where("loan_id", "=", loanId)
    .orderBy("version")
    .execute();

const effective = async (objectId: string) =>
  (await loadDerivedAvailability(db, objectId, calendarDate(kit.now())))
    .effective;

/** A reserved direct loan between friends, approved by the owner. */
async function directLoan() {
  const owner = await user();
  const borrower = await user();
  await friends(borrower, owner);
  const objectId = await create(owner);
  const { requestId } = await ask(
    borrower,
    objectId,
    { kind: "direct" },
    dated(2, 4),
  );
  await run(acceptResponsibility, owner, {
    requestId,
    declarationVersion: responsibilityDeclarationVersion,
  });
  const { loanId } = await run(approveLoanRequest, owner, { requestId });

  return { owner, borrower, objectId, requestId, loanId };
}

describe("cancelling a reserved loan (PS-LOAN-011)", () => {
  it("lets the borrower end it, releasing the reservation and keeping the history", async () => {
    const { owner, borrower, objectId, requestId, loanId } = await reservedLoan(
      2,
      4,
    );
    const agreed = await agreements(loanId);

    expect(await cancel(borrower, loanId)).toEqual({
      loanId,
      status: "ended",
      endReason: "cancelled",
      endedBy: "borrower",
    });
    const endedAt = kit.now().toISOString();

    // Both parties see that it ended, how, when and by whom.
    for (const party of [borrower, owner]) {
      expect(await loanOf(party, loanId)).toMatchObject({
        status: "ended",
        ending: {
          reason: "cancelled",
          endedBy: "borrower",
          endedAt,
        },
        period: { start: day(2), end: day(4) },
        agreement: { version: 1, loanTerms: "Må vaskes etter bruk." },
        amendment: null,
      });
    }

    // The period is free again; the agreement and the request stay.
    expect(await reservations(loanId)).toEqual([]);
    expect(await effective(objectId)).toEqual([
      { from: calendarDate(kit.now()), until: null },
    ]);
    expect(await agreements(loanId)).toEqual(agreed);
    expect(await stored(requestId)).toMatchObject({ status: "approved" });
    expect(await eventsFor("loan", loanId)).toEqual([
      expect.objectContaining({ event_type: "loan.reserved" }),
      { event_type: "loan.cancelled", payload: { objectId, role: "borrower" } },
    ]);
  });

  it("lets the responsible lender end it, and frees the period for others", async () => {
    const { admin, environmentId, owner, objectId, loanId } =
      await reservedLoan(2, 4);

    expect(await cancel(owner, loanId)).toMatchObject({ endedBy: "lender" });
    expect(await loanOf(owner, loanId)).toMatchObject({
      status: "ended",
      ending: { reason: "cancelled", endedBy: "lender" },
    });

    // Someone else can now borrow the same days.
    const other = await member(environmentId, admin);
    const { requestId } = await ask(
      other,
      objectId,
      environmentOrigin(environmentId),
      dated(2, 4),
    );
    await run(approveLoanRequest, owner, { requestId });
    expect(await stored(requestId)).toMatchObject({ status: "approved" });
  });

  it("is only for the parties, not other co-owners or anyone else", async () => {
    const setup = await reservedLoan(2, 4);
    const coOwner = await member(setup.environmentId, setup.admin);
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(6, 7),
    );
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId,
    });

    // The co-owner was an owner at approval and sees the request, but is
    // not a party of the loan.
    const { requests } = await executeQuery(tick(), listLoanRequests, {
      actor: coOwner,
      input: { role: "lender" },
    });
    expect(requests.map((request) => request.loanId)).toContain(loanId);

    for (const outsider of [coOwner, setup.admin, await user()]) {
      await expect(cancel(outsider, loanId)).rejects.toMatchObject(notFound);
    }
    expect((await loanOf(setup.borrower, loanId)).status).toBe("reserved");
    expect(await reservations(loanId)).toHaveLength(1);
  });

  it("is refused once the handover day is over, which is not a cancellation", async () => {
    const { owner, borrower, loanId } = await reservedLoan(1, 3);

    // The handover day itself still counts as before the handover.
    kit.advance(oneDay);
    kit.advance(oneDay);
    await expect(cancel(borrower, loanId)).rejects.toMatchObject({
      ...conflict,
      fields: ["handover"],
    });
    await expect(cancel(owner, loanId)).rejects.toMatchObject(conflict);
    expect((await loanOf(borrower, loanId)).status).toBe("reserved");
    expect(await reservations(loanId)).toHaveLength(1);
  });

  it("can still be done on the handover day", async () => {
    const { borrower, loanId } = await reservedLoan(1, 3);

    kit.advance(oneDay);
    expect(await cancel(borrower, loanId)).toMatchObject({
      status: "ended",
    });
  });

  it("lets an open proposal lapse with the loan", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const { amendmentId } = await run(proposeLoanAmendment, borrower, {
      loanId,
      agreementVersion: 1,
      period: { start: day(2), end: day(5) },
    });

    await cancel(owner, loanId);
    expect((await loanOf(borrower, loanId)).amendment).toBeNull();
    expect(
      await db
        .selectFrom("app.loan_amendments")
        .select(["status", "resolved_by_user_id"])
        .where("id", "=", amendmentId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "lapsed", resolved_by_user_id: null });
    expect(await agreements(loanId)).toHaveLength(1);
  });
});

describe("retries and both parties at once (PS-NFR-005)", () => {
  it("cancels once: the same key replays, another key gets the same answer", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const key = randomUUID();

    const first = await cancel(borrower, loanId, key);
    expect(await cancel(borrower, loanId, key)).toEqual(first);
    expect(await cancel(borrower, loanId)).toEqual(first);
    // The other party, too late, learns who was first.
    expect(await cancel(owner, loanId)).toEqual(first);

    expect(
      (await eventsFor("loan", loanId)).filter(
        (event) => event.event_type === "loan.cancelled",
      ),
    ).toHaveLength(1);
  });

  it("records one cancellation when both parties cancel at the same moment", async () => {
    for (let round = 0; round < 5; round += 1) {
      const { owner, borrower, loanId } = await reservedLoan(2, 4);

      const results = await Promise.all([
        cancel(borrower, loanId),
        cancel(owner, loanId),
      ]);

      expect(results[0]).toEqual(results[1]);
      const loan = await loanOf(borrower, loanId);
      expect(loan.ending?.endedBy).toBe(results[0]?.endedBy);
      expect(await reservations(loanId)).toEqual([]);
      expect(
        (await eventsFor("loan", loanId)).filter(
          (event) => event.event_type === "loan.cancelled",
        ),
      ).toHaveLength(1);
    }
  });
});

describe("access that is gone after approval (PS-LOAN-002, scenarios 28 and 47)", () => {
  it("never stops a party from cancelling: left environment", async () => {
    const { environmentId, owner, borrower, loanId } = await reservedLoan();
    await run(leaveEnvironment, borrower, { environmentId });

    expect(await cancel(owner, loanId)).toMatchObject({ endedBy: "lender" });
  });

  it("never stops a party from cancelling: ended friendship or a block", async () => {
    const unfriended = await directLoan();
    await run(removeFriend, unfriended.owner, {
      userId: unfriended.borrower.userId,
    });
    expect(await cancel(unfriended.borrower, unfriended.loanId)).toMatchObject({
      endedBy: "borrower",
    });

    // A block does not cancel the loan itself (scenario 28) ...
    const blocked = await directLoan();
    await run(blockUser, blocked.owner, { userId: blocked.borrower.userId });
    expect((await loanOf(blocked.borrower, blocked.loanId)).status).toBe(
      "reserved",
    );
    // ... and either party may still end it, the blocked one too.
    expect(await cancel(blocked.borrower, blocked.loanId)).toMatchObject({
      endedBy: "borrower",
    });

    const blocking = await directLoan();
    await run(blockUser, blocking.borrower, { userId: blocking.owner.userId });
    expect(await cancel(blocking.owner, blocking.loanId)).toMatchObject({
      endedBy: "lender",
    });
  });
});

describe("after cancellation (PS-OBJ-010/011)", () => {
  it("is no longer a commitment: the lender may leave and the object may be deleted", async () => {
    const setup = await reservedLoan(2, 4);
    const coOwner = await member(setup.environmentId, setup.admin);
    await addCoOwner(setup.owner, setup.objectId, coOwner);
    await expect(
      run(leaveObject, setup.owner, { objectId: setup.objectId }),
    ).rejects.toMatchObject(conflict);

    await cancel(setup.borrower, setup.loanId);
    await run(leaveObject, setup.owner, { objectId: setup.objectId });
  });

  it("keeps the loan and its request as history when the object is deleted", async () => {
    const { owner, borrower, objectId, requestId, loanId } = await reservedLoan(
      2,
      4,
    );
    await cancel(owner, loanId);

    expect(
      await run(consentToObjectDeletion, owner, { objectId }),
    ).toMatchObject({ deleted: true });

    for (const party of [borrower, owner]) {
      expect(await loanOf(party, loanId)).toMatchObject({
        objectId: null,
        status: "ended",
        agreement: { version: 1, title: "Tilhenger" },
      });
    }
    expect(
      await executeQuery(tick(), readLoanRequest, {
        actor: owner,
        input: { requestId },
      }),
    ).toMatchObject({ objectId: null, status: "approved", loanId });
  });

  it("is refused by the database without a party, or with the period still reserved", async () => {
    const { borrower, loanId } = await reservedLoan(2, 4);
    const end = (by: string | null) =>
      db
        .updateTable("app.loans")
        .set({
          status: "ended",
          end_reason: "cancelled",
          ended_at: kit.now(),
          ended_by_user_id: by,
        })
        .where("id", "=", loanId)
        .execute();

    await expect(end(null)).rejects.toMatchObject({ code: "23514" });
    await expect(end((await user()).userId)).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      db
        .deleteFrom("app.loan_reservations")
        .where("loan_id", "=", loanId)
        .execute(),
    ).rejects.toMatchObject({ code: "23001" });
    // Ending it while keeping the reservation fails at commit.
    await expect(end(borrower.userId)).rejects.toMatchObject({
      code: "23001",
    });

    await cancel(borrower, loanId);
    await expect(
      db
        .updateTable("app.loans")
        .set({ status: "reserved", end_reason: null, ended_at: null })
        .where("id", "=", loanId)
        .execute(),
    ).rejects.toMatchObject({ code: "23001" });
  });
});

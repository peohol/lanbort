import { randomUUID } from "node:crypto";
import {
  type ReturnOutcome,
  responsibilityDeclarationVersion,
} from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { calendarDate } from "../objects/availability";
import { setObjectRestriction } from "../objects/restrictions";
import { blockUser, removeFriend } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { acceptLoanAmendment, proposeLoanAmendment } from "./amendments";
import { approveLoanRequest } from "./approval";
import { cancelLoan } from "./cancellation";
import { acceptResponsibility } from "./commands";
import { reportHandover } from "./handover";
import { handoverProcess, returnProcess } from "./policies";
import { readLoan } from "./queries";
import { concludeReturns, reportReturn, undoReturn } from "./return";
import { loadDerivedAvailability } from "./store";

/**
 * WP-34: the return and early return (PS-LOAN-014–017, PS-LOAN-020,
 * scenarios 27, 58 and 81), and the parts of quality gate B they cover:
 * only the responsible lender's receipt ends a loan, the date alone never
 * makes it late, a confirmation can be undone for 30 seconds and is history
 * afterwards, a later problem reopens the loan without rewriting it, an
 * uncertain possession blocks new colliding loans without touching loans
 * already approved, and every transition holds under concurrency.
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
  showToFriends,
  environmentOrigin,
  ask,
  day,
  dated,
  reservedLoan,
  stored,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const oneSecond = 1000;
const undoBuffer = 30 * oneSecond;

const say = (
  actor: UserActor,
  loanId: string,
  outcome: ReturnOutcome,
  options: { version?: number; immediately?: boolean; key?: string } = {},
) =>
  run(
    reportReturn,
    actor,
    {
      loanId,
      agreementVersion: options.version ?? 1,
      outcome,
      ...(options.immediately === undefined
        ? {}
        : { immediately: options.immediately }),
    },
    options.key,
  );

/** A statement made at once, without the undo buffer. */
const sayNow = (
  actor: UserActor,
  loanId: string,
  outcome: ReturnOutcome,
  version = 1,
) => say(actor, loanId, outcome, { version, immediately: true });

const undo = (actor: UserActor, loanId: string) =>
  run(undoReturn, actor, { loanId });

const conclude = () => run(concludeReturns, systemActor(returnProcess), {});

const handOver = (actor: UserActor, loanId: string) =>
  run(reportHandover, actor, {
    loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });

const loanOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoan, { actor, input: { loanId } });

const statusOf = async (loanId: string) =>
  await db
    .selectFrom("app.loans")
    .select(["status", "end_reason", "ended_by_user_id"])
    .where("id", "=", loanId)
    .executeTakeFirstOrThrow();

const reservation = async (loanId: string) =>
  (
    await db
      .selectFrom("app.loan_reservations")
      .select(sql<string>`period::text`.as("period"))
      .where("loan_id", "=", loanId)
      .executeTakeFirst()
  )?.period ?? null;

const range = (from: number, to: number) => `[${day(from)},${day(to + 1)})`;

const effective = async (objectId: string) =>
  (await loadDerivedAvailability(db, objectId, calendarDate(kit.now())))
    .effective;

const statements = (loanId: string) =>
  db
    .selectFrom("app.loan_return_reports")
    .select(["reporter_role", "outcome", "agreement_version"])
    .where("loan_id", "=", loanId)
    .orderBy("position")
    .execute();

const confirmations = async (loanId: string) =>
  (
    await db
      .selectFrom("app.loan_return_confirmations")
      .select("status")
      .where("loan_id", "=", loanId)
      .orderBy("requested_at")
      .execute()
  ).map((row) => row.status);

const loanEvents = async (loanId: string) =>
  (await eventsFor("loan", loanId)).map((event) => event.event_type);

const propose = (actor: UserActor, loanId: string, from: number, to: number) =>
  run(proposeLoanAmendment, actor, {
    loanId,
    agreementVersion: 1,
    period: { start: day(from), end: day(to) },
  });

/** A loan for days `from`–`to` (from today on), handed over today. */
async function activeLoan(from = 0, to = 2) {
  const loan = await reservedLoan(from, to);
  await handOver(loan.owner, loan.loanId);
  return loan;
}

/** An active loan for days 0–2 whose return day is over. */
async function overdueLoan() {
  const loan = await activeLoan(0, 2);
  kit.advanceDays(3);
  return loan;
}

/** Another member's loan of the same object for days `from`–`to`, approved. */
async function laterLoan(
  setup: Awaited<ReturnType<typeof reservedLoan>>,
  from: number,
  to: number,
) {
  const borrower = await member(setup.environmentId, setup.admin);
  const { requestId } = await ask(
    borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dated(from, to),
  );
  const { loanId } = await run(approveLoanRequest, setup.owner, { requestId });
  return { borrower, requestId, loanId };
}

/** Another member's open request for days `from`–`to`. */
async function openRequest(
  setup: Awaited<ReturnType<typeof reservedLoan>>,
  dates: object = {},
) {
  const borrower = await member(setup.environmentId, setup.admin);
  const { requestId } = await ask(
    borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dates,
  );
  return requestId;
}

/** A direct loan between friends for days 0–2, handed over today. */
async function directLoan() {
  const owner = await user();
  const borrower = await user();
  await friends(borrower, owner);
  const objectId = await create(owner);
  await showToFriends(owner, objectId);
  const { requestId } = await ask(
    borrower,
    objectId,
    { kind: "direct" },
    dated(0, 2),
  );
  await run(acceptResponsibility, owner, {
    requestId,
    declarationVersion: responsibilityDeclarationVersion,
  });
  const { loanId } = await run(approveLoanRequest, owner, { requestId });
  await handOver(owner, loanId);

  return { owner, borrower, objectId, loanId };
}

describe("the return (PS-LOAN-014–015)", () => {
  it("ends the loan only with the responsible lender's receipt", async () => {
    const { owner, borrower, objectId, loanId } = await activeLoan(0, 4);

    // The borrower's word alone leaves it awaiting clarification.
    expect(await sayNow(borrower, loanId, "returned")).toEqual({
      loanId,
      status: "awaiting_return",
      agreementVersion: 1,
      pending: null,
    });
    expect(await loanOf(owner, loanId)).toMatchObject({
      status: "awaiting_return",
      ending: null,
      return: {
        borrower: { outcome: "returned" },
        lender: null,
        pending: null,
      },
    });
    expect(await reservation(loanId)).toBe(range(0, 4));
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.return_reported",
      payload: {
        objectId,
        role: "borrower",
        outcome: "returned",
        agreementVersion: 1,
        reportedAs: "party",
      },
    });

    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    expect(await statusOf(loanId)).toEqual({
      status: "ended",
      end_reason: "returned",
      ended_by_user_id: owner.userId,
    });
    expect(await reservation(loanId)).toBeNull();
    expect((await eventsFor("loan", loanId)).slice(-2)).toEqual([
      expect.objectContaining({ event_type: "loan.return_reported" }),
      { event_type: "loan.returned", payload: { objectId, early: true } },
    ]);
    expect(await loanOf(borrower, loanId)).toMatchObject({
      status: "ended",
      ending: { reason: "returned", endedBy: "lender" },
      return: {
        borrower: { outcome: "returned" },
        lender: { outcome: "received" },
      },
    });

    // Retry-safe; and nothing but a contradiction can be said afterwards.
    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    await expect(sayNow(borrower, loanId, "returned")).rejects.toMatchObject(
      conflict,
    );
    expect(await statements(loanId)).toHaveLength(2);
  });

  it("lets the lender confirm the receipt alone, on time, without the borrower", async () => {
    const { owner, objectId, loanId } = await activeLoan(0, 2);
    kit.advanceDays(2);

    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.returned",
      payload: { objectId, early: false },
    });
  });

  it("waits neutrally once the return day is over, and blocks new colliding loans", async () => {
    const setup = await activeLoan(0, 2);
    const { owner, borrower, objectId, loanId } = setup;
    const requestId = await openRequest(setup, dated(4, 5));

    expect((await loanOf(borrower, loanId)).status).toBe("active");
    kit.advanceDays(3);

    // Silence and the date alone never make it late (PS-LOAN-014).
    expect(await loanOf(borrower, loanId)).toMatchObject({
      status: "awaiting_return",
      return: { borrower: null, lender: null },
    });
    expect(await statusOf(loanId)).toMatchObject({ status: "active" });

    // Nobody knows the object is back: nothing is free from the return day
    // on, and the open request for days after it cannot be approved.
    expect(await effective(objectId)).toEqual([]);
    await expect(
      run(approveLoanRequest, owner, { requestId }),
    ).rejects.toMatchObject(conflict);
    expect(await stored(requestId)).toMatchObject({ status: "requested" });

    // The lender has not received it: still awaiting, still not late.
    expect((await sayNow(owner, loanId, "not_received")).status).toBe(
      "awaiting_return",
    );
    expect(await effective(objectId)).toEqual([]);

    // The receipt lifts the block.
    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    expect(await effective(objectId)).toEqual([{ from: day(0), until: null }]);
    expect(await run(approveLoanRequest, owner, { requestId })).toMatchObject({
      status: "approved",
    });
  });

  it("is late only when the borrower says they still have it after the return day", async () => {
    const { owner, borrower, loanId } = await activeLoan(0, 2);

    // Before the return day passes it is simply an active loan.
    for (const [actor, outcome] of [
      [borrower, "still_has"],
      [owner, "not_received"],
    ] as const) {
      await expect(sayNow(actor, loanId, outcome)).rejects.toMatchObject({
        ...conflict,
        fields: ["outcome"],
      });
    }

    kit.advanceDays(3);
    expect((await sayNow(borrower, loanId, "still_has")).status).toBe("late");
    expect(await loanOf(owner, loanId)).toMatchObject({
      status: "late",
      return: { borrower: { outcome: "still_has" }, lender: null },
    });

    // Bringing it back later: the borrower's word is not enough, the
    // lender's receipt is.
    expect((await sayNow(borrower, loanId, "returned")).status).toBe(
      "awaiting_return",
    );
    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    expect(await loanEvents(loanId)).toContain("loan.returned");
  });

  it("is disputed when the lender contradicts the borrower, without touching later loans (scenario 58)", async () => {
    const setup = await activeLoan(0, 4);
    const { owner, borrower, objectId, loanId } = setup;
    const kari = await laterLoan(setup, 7, 9);
    const requestId = await openRequest(setup, dated(12, 13));

    // The lender cannot say they have not received it before anyone says
    // it was returned or the return day is over.
    await expect(sayNow(owner, loanId, "not_received")).rejects.toMatchObject(
      conflict,
    );

    await sayNow(borrower, loanId, "returned");
    expect(await sayNow(owner, loanId, "not_received")).toMatchObject({
      status: "disputed",
    });
    expect(await statusOf(loanId)).toMatchObject({
      status: "return_disputed",
    });
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.return_disputed",
      payload: { objectId, reopened: false, otherLoanIds: [kari.loanId] },
    });

    // Nothing is free while possession is uncertain; Kari's loan stays.
    expect(await effective(objectId)).toEqual([]);
    await expect(
      run(approveLoanRequest, owner, { requestId }),
    ).rejects.toMatchObject(conflict);
    expect(await reservation(kari.loanId)).toBe(range(7, 9));
    expect((await loanOf(kari.borrower, kari.loanId)).status).toBe("reserved");
    await expect(run(cancelLoan, borrower, { loanId })).rejects.toMatchObject(
      conflict,
    );

    // The lender finds it after all.
    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    expect(await effective(objectId)).toEqual([
      { from: day(0), until: day(7) },
      { from: day(10), until: null },
    ]);
  });
});

describe("an agreed extension (PS-LOAN-010, PS-LOAN-014)", () => {
  it("makes a late loan active again on a new agreement, keeping the old statements as history", async () => {
    const { owner, borrower, loanId } = await overdueLoan();
    await sayNow(borrower, loanId, "still_has");

    // The start is the handover; it cannot move any more.
    await expect(propose(borrower, loanId, -2, 3)).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["period.start"],
    });
    // A return day in the past would make it overdue at once.
    await expect(propose(borrower, loanId, -3, -2)).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["period.end"],
    });

    const { amendmentId } = await propose(borrower, loanId, -3, 2);
    await run(acceptLoanAmendment, owner, { loanId, amendmentId });

    expect(await loanOf(owner, loanId)).toMatchObject({
      status: "active",
      agreement: { version: 2 },
      period: { start: day(-3), end: day(2) },
      // The handover still holds; the return starts over.
      handover: { lender: { outcome: "handed_over" } },
      return: { borrower: null, lender: null, pending: null },
    });
    expect(await statements(loanId)).toEqual([
      { reporter_role: "borrower", outcome: "still_has", agreement_version: 1 },
    ]);
    expect(await reservation(loanId)).toBe(range(-3, 2));

    // A statement on the old agreement is refused, on the new one it counts.
    await expect(sayNow(owner, loanId, "received")).rejects.toMatchObject({
      ...conflict,
      fields: ["agreementVersion"],
    });
    expect((await sayNow(owner, loanId, "received", 2)).status).toBe("ended");
  });

  it("may not grow into a loan already approved", async () => {
    const setup = await activeLoan(0, 2);
    const kari = await laterLoan(setup, 5, 6);
    kit.advanceDays(3);

    await expect(
      propose(setup.borrower, setup.loanId, -3, 2),
    ).rejects.toMatchObject({ ...conflict, fields: ["period"] });
    const { amendmentId } = await propose(setup.borrower, setup.loanId, -3, 1);
    await run(acceptLoanAmendment, setup.owner, {
      loanId: setup.loanId,
      amendmentId,
    });
    expect(await reservation(setup.loanId)).toBe(range(-3, 1));
    expect(await reservation(kari.loanId)).toBe(range(2, 3));
  });

  it("is refused once a party has said something about the return", async () => {
    const { owner, borrower, loanId } = await activeLoan(0, 4);
    await sayNow(borrower, loanId, "returned");

    await expect(propose(owner, loanId, 0, 6)).rejects.toMatchObject(conflict);
  });
});

describe("the undo buffer (PS-LOAN-016)", () => {
  it("keeps a confirmation private and undoable for 30 seconds", async () => {
    const { owner, borrower, loanId } = await activeLoan(0, 4);

    const sent = await say(borrower, loanId, "returned");
    const effectiveAt = new Date(kit.now().getTime() + undoBuffer);
    expect(sent).toEqual({
      loanId,
      status: "active",
      agreementVersion: 1,
      pending: { outcome: "returned", effectiveAt: effectiveAt.toISOString() },
    });

    // Only the borrower sees it; nothing has happened yet.
    expect((await loanOf(borrower, loanId)).return).toEqual({
      borrower: null,
      lender: null,
      pending: { outcome: "returned", effectiveAt: effectiveAt.toISOString() },
    });
    expect((await loanOf(owner, loanId)).return.pending).toBeNull();
    expect(await loanEvents(loanId)).not.toContain("loan.return_reported");

    // Sending it again keeps the same buffer.
    expect(await say(borrower, loanId, "returned")).toEqual(sent);

    // Undone, it was never sent; undoing again is harmless.
    expect(await undo(borrower, loanId)).toMatchObject({
      status: "active",
      pending: null,
    });
    expect(await undo(borrower, loanId)).toMatchObject({ pending: null });
    expect(await confirmations(loanId)).toEqual(["withdrawn"]);

    kit.advance(undoBuffer + oneSecond);
    await conclude();
    expect(await statements(loanId)).toEqual([]);
    expect(await loanOf(owner, loanId)).toMatchObject({
      status: "active",
      return: { borrower: null },
    });
    expect(await loanEvents(loanId)).not.toContain("loan.return_reported");
  });

  it("makes the confirmation once the buffer is over, and then it stays", async () => {
    const { owner, loanId } = await activeLoan(0, 4);

    await say(owner, loanId, "received");
    // Nothing else can be said by the same side while it waits.
    await expect(sayNow(owner, loanId, "not_received")).rejects.toMatchObject({
      ...conflict,
      fields: ["outcome"],
    });

    kit.advance(undoBuffer - 2 * oneSecond);
    await conclude();
    expect(await statusOf(loanId)).toMatchObject({ status: "active" });
    expect(await confirmations(loanId)).toEqual(["pending"]);

    kit.advance(2 * oneSecond);
    expect((await conclude()).made).toBeGreaterThanOrEqual(1);
    expect(await statusOf(loanId)).toEqual({
      status: "ended",
      end_reason: "returned",
      ended_by_user_id: owner.userId,
    });
    expect(await confirmations(loanId)).toEqual(["applied"]);

    // Too late to undo: a mistake is now corrected with a new statement.
    await expect(undo(owner, loanId)).rejects.toMatchObject(conflict);
    await conclude();
    expect(await statements(loanId)).toHaveLength(1);
  });

  it("records a confirmation as of when it took effect, however late the job comes", async () => {
    const { owner, borrower, objectId, loanId } = await activeLoan(0, 1);

    await say(owner, loanId, "received");
    const effectiveAt = new Date(kit.now().getTime() + undoBuffer);
    // The job only comes by after the loan's last day.
    kit.advanceDays(3);
    await conclude();

    expect(await loanOf(borrower, loanId)).toMatchObject({
      status: "ended",
      ending: { reason: "returned", endedAt: effectiveAt.toISOString() },
      return: { lender: { reportedAt: effectiveAt.toISOString() } },
    });
    // It was returned before the last day, so the return was early.
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.returned",
      payload: { objectId, early: true },
    });
  });

  it("counts a confirmation from when it took effect, before the job comes by", async () => {
    const { owner, borrower, loanId } = await activeLoan(0, 4);

    await say(borrower, loanId, "returned");
    kit.advance(undoBuffer);

    // The lender's answer comes after the borrower's statement took effect.
    expect((await sayNow(owner, loanId, "not_received")).status).toBe(
      "disputed",
    );
    expect(await statements(loanId)).toEqual([
      { reporter_role: "borrower", outcome: "returned", agreement_version: 1 },
      {
        reporter_role: "lender",
        outcome: "not_received",
        agreement_version: 1,
      },
    ]);
    expect(await confirmations(loanId)).toEqual(["applied"]);
  });

  it("makes it at once when the party asks for that, also while it waits", async () => {
    const first = await activeLoan(0, 4);
    expect(await sayNow(first.owner, first.loanId, "received")).toMatchObject({
      status: "ended",
      pending: null,
    });
    expect(await confirmations(first.loanId)).toEqual([]);

    const second = await activeLoan(0, 4);
    await say(second.owner, second.loanId, "received");
    expect(await sayNow(second.owner, second.loanId, "received")).toMatchObject(
      { status: "ended", pending: null },
    );
    expect(await confirmations(second.loanId)).toEqual(["applied"]);
  });

  it("lapses a waiting confirmation the other party's receipt made moot", async () => {
    const { owner, borrower, loanId } = await activeLoan(0, 4);

    await say(borrower, loanId, "returned");
    await sayNow(owner, loanId, "received");

    expect(await confirmations(loanId)).toEqual(["lapsed"]);
    expect((await loanOf(borrower, loanId)).return.pending).toBeNull();
    await expect(undo(borrower, loanId)).rejects.toMatchObject(conflict);
    kit.advance(undoBuffer);
    await conclude();
    expect(await statements(loanId)).toHaveLength(1);
  });

  it("refuses to undo when nothing is waiting", async () => {
    const { borrower, loanId } = await activeLoan(0, 4);

    await expect(undo(borrower, loanId)).rejects.toMatchObject(conflict);
  });
});

describe("early return (PS-LOAN-020, scenario 27)", () => {
  it("frees only the rest of the period that nothing else holds", async () => {
    const setup = await activeLoan(0, 9);
    const { owner, borrower, objectId, loanId } = setup;
    await run(setObjectRestriction, owner, {
      objectId,
      period: { start: day(6), end: day(7) },
    });
    const per = await laterLoan(setup, 12, 14);
    kit.advanceDays(2);

    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    const endedAt = kit.now().toISOString();

    // Days 0–3 and 6–9 (from today) are free again; the restriction and
    // Per's loan still hold theirs.
    expect(await reservation(loanId)).toBeNull();
    expect(await effective(objectId)).toEqual([
      { from: day(0), until: day(4) },
      { from: day(6), until: day(10) },
      { from: day(13), until: null },
    ]);
    expect(await reservation(per.loanId)).toBe(range(10, 12));

    // It ended when it was returned; the agreed period is what was agreed.
    const loan = await loanOf(borrower, loanId);
    expect(loan).toMatchObject({
      status: "ended",
      period: { start: day(-2), end: day(7) },
      ending: { reason: "returned", endedAt },
    });
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.returned",
      payload: { objectId, early: true },
    });
  });
});

describe("a later problem with a confirmed return (PS-LOAN-017)", () => {
  it("reopens the loan as disputed and keeps the receipt in history", async () => {
    const setup = await activeLoan(0, 4);
    const { owner, borrower, objectId, loanId } = setup;
    const kari = await laterLoan(setup, 7, 8);
    await sayNow(owner, loanId, "received");
    // Approved while the object was back: it stays whatever comes next.
    const per = await laterLoan(setup, 2, 3);
    const requestId = await openRequest(setup, dated(10, 11));

    expect(await sayNow(owner, loanId, "not_received")).toMatchObject({
      status: "disputed",
    });
    expect(await statusOf(loanId)).toEqual({
      status: "return_disputed",
      end_reason: null,
      ended_by_user_id: null,
    });
    expect(await loanOf(borrower, loanId)).toMatchObject({
      status: "disputed",
      ending: null,
      return: { lender: { outcome: "not_received" } },
    });
    expect(await loanEvents(loanId)).toEqual(
      expect.arrayContaining(["loan.returned", "loan.return_disputed"]),
    );
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.return_disputed",
      payload: {
        objectId,
        reopened: true,
        otherLoanIds: [kari.loanId, per.loanId],
      },
    });
    expect(await statements(loanId)).toEqual([
      { reporter_role: "lender", outcome: "received", agreement_version: 1 },
      {
        reporter_role: "lender",
        outcome: "not_received",
        agreement_version: 1,
      },
    ]);

    // The loan holds no reservation again, but nothing new can collide
    // with it while nobody knows who has the object.
    expect(await reservation(loanId)).toBeNull();
    expect(await effective(objectId)).toEqual([]);
    await expect(
      run(approveLoanRequest, owner, { requestId }),
    ).rejects.toMatchObject(conflict);
    expect(await reservation(per.loanId)).toBe(range(2, 3));
    expect(await reservation(kari.loanId)).toBe(range(7, 8));

    // The borrower's word does not settle it; a new receipt does.
    expect((await sayNow(borrower, loanId, "returned")).status).toBe(
      "disputed",
    );
    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    expect(await statusOf(loanId)).toEqual({
      status: "ended",
      end_reason: "returned",
      ended_by_user_id: owner.userId,
    });
    expect(await run(approveLoanRequest, owner, { requestId })).toMatchObject({
      status: "approved",
    });
  });

  it("reopens on the borrower's word that they still have it, also before the return day", async () => {
    const { owner, borrower, loanId } = await activeLoan(0, 4);
    await sayNow(owner, loanId, "received");

    expect((await sayNow(borrower, loanId, "still_has")).status).toBe(
      "disputed",
    );
    expect(await reservation(loanId)).toBeNull();
  });

  it("never reopens a loan that ended otherwise", async () => {
    const cancelled = await reservedLoan(1, 2);
    await run(cancelLoan, cancelled.borrower, { loanId: cancelled.loanId });

    for (const [actor, outcome] of [
      [cancelled.owner, "not_received"],
      [cancelled.borrower, "still_has"],
    ] as const) {
      await expect(
        sayNow(actor, cancelled.loanId, outcome),
      ).rejects.toMatchObject(conflict);
    }
    expect(await statements(cancelled.loanId)).toEqual([]);
  });

  it("is not a statement before the handover", async () => {
    const { owner, loanId } = await reservedLoan(1, 2);

    await expect(sayNow(owner, loanId, "received")).rejects.toMatchObject(
      conflict,
    );
  });
});

describe("the parties keep what the return needs (PS-LOAN-002, PS-LOAN-021, scenario 81)", () => {
  it("lets each side say only its own statements; everyone else gets not_found", async () => {
    const { owner, borrower, admin, objectId, loanId } = await activeLoan(0, 2);
    const coOwner = await user();
    await addCoOwner(owner, objectId, coOwner);

    await expect(sayNow(borrower, loanId, "received")).rejects.toMatchObject(
      forbidden,
    );
    await expect(sayNow(owner, loanId, "returned")).rejects.toMatchObject(
      forbidden,
    );
    for (const outsider of [coOwner, admin, await user()]) {
      await expect(sayNow(outsider, loanId, "received")).rejects.toMatchObject(
        notFound,
      );
      await expect(undo(outsider, loanId)).rejects.toMatchObject(notFound);
    }
    await expect(
      sayNow(borrower, randomUUID(), "returned"),
    ).rejects.toMatchObject(notFound);
    expect(await statements(loanId)).toEqual([]);
  });

  it("runs the job only as its own process", async () => {
    const { owner } = await activeLoan(0, 2);

    await expect(run(concludeReturns, owner, {})).rejects.toMatchObject(
      forbidden,
    );
    await expect(
      run(concludeReturns, systemActor(handoverProcess), {}),
    ).rejects.toMatchObject(forbidden);
  });

  it("survives an ended friendship and a block between the parties", async () => {
    const { owner, borrower, loanId } = await directLoan();

    await run(removeFriend, owner, { userId: borrower.userId });
    await run(blockUser, borrower, { userId: owner.userId });

    expect((await sayNow(borrower, loanId, "returned")).status).toBe(
      "awaiting_return",
    );
    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
  });

  it("survives the borrower leaving the environment", async () => {
    const { owner, borrower, environmentId, loanId } = await activeLoan(0, 2);

    await run(leaveEnvironment, borrower, { environmentId });
    kit.advanceDays(3);

    expect((await sayNow(borrower, loanId, "still_has")).status).toBe("late");
    expect((await loanOf(borrower, loanId)).status).toBe("late");
    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
  });
});

describe("concurrency (docs/architecture/05)", () => {
  it("gives one consistent status when both parties speak at once", async () => {
    const { owner, borrower, loanId } = await overdueLoan();

    const results = await Promise.allSettled([
      sayNow(borrower, loanId, "still_has"),
      sayNow(owner, loanId, "received"),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    const said = await statements(loanId);
    expect(said).toHaveLength(2);
    // Received first and then contradicted reopens it; the other way round
    // the receipt settles it.
    expect((await statusOf(loanId)).status).toBe(
      said[0]?.outcome === "received" ? "return_disputed" : "ended",
    );
  });

  it("never lets an undo in time and the job both win", async () => {
    const { borrower, loanId } = await activeLoan(0, 4);
    await say(borrower, loanId, "returned");
    // The undo runs a millisecond before the buffer ends, the job at its end.
    kit.advance(undoBuffer - 2);

    const [undone, job] = await Promise.allSettled([
      undo(borrower, loanId),
      conclude(),
    ]);

    expect(job.status).toBe("fulfilled");
    const [confirmation] = await confirmations(loanId);
    if (undone.status === "fulfilled") {
      expect(confirmation).toBe("withdrawn");
      expect(await statements(loanId)).toEqual([]);
    } else {
      expect(undone.reason).toMatchObject(conflict);
      expect(confirmation).toBe("applied");
      expect(await statements(loanId)).toHaveLength(1);
    }
  });

  it("never lets an early return and a colliding request both see the object held or free", async () => {
    const setup = await activeLoan(0, 4);
    const kari = await member(setup.environmentId, setup.admin);
    const origin = environmentOrigin(setup.environmentId);

    const [returned, asked] = await Promise.allSettled([
      sayNow(setup.owner, setup.loanId, "received"),
      ask(kari, setup.objectId, origin, dated(2, 3)),
    ]);

    expect(returned.status).toBe("fulfilled");
    expect(await statusOf(setup.loanId)).toMatchObject({ status: "ended" });
    if (asked.status === "fulfilled") {
      // The return came first and freed the days: the request can become a
      // loan now.
      expect(
        await run(approveLoanRequest, setup.owner, {
          requestId: asked.value.requestId,
        }),
      ).toMatchObject({ status: "approved" });
    } else {
      // The request saw the days reserved and was refused.
      expect(asked.reason).toMatchObject(conflict);
    }
  });

  it("never lets a reopening and a colliding approval both see a free object", async () => {
    const setup = await activeLoan(0, 4);
    await sayNow(setup.owner, setup.loanId, "received");
    const requestId = await openRequest(setup, dated(2, 3));

    const [reopened, approved] = await Promise.allSettled([
      sayNow(setup.owner, setup.loanId, "not_received"),
      run(approveLoanRequest, setup.owner, { requestId }),
    ]);

    expect(reopened.status).toBe("fulfilled");
    expect(await statusOf(setup.loanId)).toMatchObject({
      status: "return_disputed",
    });
    const disputed = (await eventsFor("loan", setup.loanId)).at(-1);
    if (approved.status === "fulfilled") {
      // Approved first: it stays, and its parties are among those told.
      expect(disputed?.payload).toMatchObject({
        otherLoanIds: [approved.value.loanId],
      });
    } else {
      expect(approved.reason).toMatchObject(conflict);
      expect(await stored(requestId)).toMatchObject({ status: "requested" });
      expect(disputed?.payload).toMatchObject({ otherLoanIds: [] });
    }
  });

  it("never lets a receipt that comes due and an agreed extension both win", async () => {
    const { owner, borrower, loanId } = await overdueLoan();
    await sayNow(borrower, loanId, "still_has");
    const { amendmentId } = await propose(borrower, loanId, -3, 4);
    await say(owner, loanId, "received");
    // The acceptance runs a millisecond before the receipt takes effect,
    // the job at that moment.
    kit.advance(undoBuffer - 2);

    const [accepted] = await Promise.allSettled([
      run(acceptLoanAmendment, owner, { loanId, amendmentId }),
      conclude(),
    ]);

    const { status } = await statusOf(loanId);
    if (accepted.status === "fulfilled") {
      expect(status).toBe("active");
      expect(await confirmations(loanId)).toEqual(["lapsed"]);
      expect(await reservation(loanId)).toBe(range(-3, 4));
    } else {
      expect(accepted.reason).toMatchObject(conflict);
      expect(status).toBe("ended");
      expect(await confirmations(loanId)).toEqual(["applied"]);
      expect(await reservation(loanId)).toBeNull();
    }
  });

  it("lets concurrent jobs make each confirmation exactly once", async () => {
    const loans = [await activeLoan(0, 4), await activeLoan(0, 4)];
    for (const { owner, loanId } of loans) {
      await say(owner, loanId, "received");
    }
    kit.advance(undoBuffer);

    await Promise.all([conclude(), conclude(), conclude()]);

    for (const { loanId } of loans) {
      expect(await confirmations(loanId)).toEqual(["applied"]);
      expect(await statements(loanId)).toHaveLength(1);
      expect(await statusOf(loanId)).toMatchObject({ status: "ended" });
    }
  });
});

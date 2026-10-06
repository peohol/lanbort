import { randomUUID } from "node:crypto";
import { responsibilityDeclarationVersion } from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { calendarDate } from "../objects/availability";
import { leaveObject } from "../objects/co-owners";
import { blockUser, removeFriend } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { acceptLoanAmendment, proposeLoanAmendment } from "./amendments";
import { approveLoanRequest } from "./approval";
import { cancelLoan } from "./cancellation";
import { acceptResponsibility } from "./commands";
import { concludeHandovers, reportHandover } from "./handover";
import { handoverProcess } from "./policies";
import { readLoan } from "./queries";
import { loadDerivedAvailability } from "./store";

/**
 * WP-33: the handover and the active loan (PS-LOAN-012–013, scenarios 61 and
 * 81), and the parts of quality gate B they cover: what the parties say
 * decides the status, silence is never fault, a disputed handover blocks
 * new colliding loans without touching loans already approved, and every
 * transition holds under concurrency.
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
const conflict = { code: "conflict" };
const oneHour = 60 * 60 * 1000;
const oneDay = 24 * oneHour;

type Outcome = "handed_over" | "not_handed_over";

const say = (
  actor: UserActor,
  loanId: string,
  outcome: Outcome,
  agreementVersion = 1,
  key?: string,
) => run(reportHandover, actor, { loanId, agreementVersion, outcome }, key);

const conclude = () => run(concludeHandovers, systemActor(handoverProcess), {});

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
    .selectFrom("app.loan_handover_reports")
    .select(["reporter_role", "outcome", "agreement_version"])
    .where("loan_id", "=", loanId)
    .orderBy("position")
    .execute();

const loanEvents = async (loanId: string) =>
  (await eventsFor("loan", loanId)).map((event) => event.event_type);

/** A reserved loan for days 1–3 whose handover day is over. */
async function pastHandover() {
  const loan = await reservedLoan(1, 3);
  // An hour more, so a day that is 25 hours long (the end of summer time)
  // never leaves the clock on the handover day.
  kit.advance(2 * oneDay + oneHour);
  return loan;
}

/** A reserved direct loan between friends for days `from`–`to`. */
async function directLoan(from: number, to: number) {
  const owner = await user();
  const borrower = await user();
  await friends(borrower, owner);
  const objectId = await create(owner);
  await showToFriends(owner, objectId);
  const { requestId } = await ask(
    borrower,
    objectId,
    { kind: "direct" },
    dated(from, to),
  );
  await run(acceptResponsibility, owner, {
    requestId,
    declarationVersion: responsibilityDeclarationVersion,
  });
  const { loanId } = await run(approveLoanRequest, owner, { requestId });

  return { owner, borrower, objectId, loanId };
}

describe("the handover (PS-LOAN-012)", () => {
  it("makes the loan active when either party confirms it, from the handover day on", async () => {
    const { owner, borrower, objectId, loanId } = await reservedLoan(1, 3);

    // Before the handover day the period would have to change first.
    await expect(say(borrower, loanId, "handed_over")).rejects.toMatchObject(
      conflict,
    );

    kit.advance(oneDay);
    expect(await say(borrower, loanId, "handed_over")).toEqual({
      loanId,
      status: "active",
      agreementVersion: 1,
    });
    const reportedAt = kit.now().toISOString();

    for (const party of [borrower, owner]) {
      expect(await loanOf(party, loanId)).toMatchObject({
        status: "active",
        ending: null,
        period: { start: day(0), end: day(2) },
        handover: {
          borrower: {
            outcome: "handed_over",
            reportedAt,
          },
          lender: null,
          answerDueAt: null,
        },
      });
    }

    // It holds its period as before; cancelling and a new handover day are
    // over (only the return day can still be changed, WP-34).
    expect(await reservation(loanId)).toBe(range(0, 2));
    await expect(run(cancelLoan, owner, { loanId })).rejects.toMatchObject(
      conflict,
    );
    await expect(
      run(proposeLoanAmendment, borrower, {
        loanId,
        agreementVersion: 1,
        period: { start: day(1), end: day(5) },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    // The other side agrees; the side that confirmed cannot take it back.
    expect((await say(owner, loanId, "handed_over")).status).toBe("active");
    await expect(
      say(borrower, loanId, "not_handed_over"),
    ).rejects.toMatchObject(conflict);
    await expect(say(owner, loanId, "not_handed_over")).rejects.toMatchObject(
      conflict,
    );

    // The responsible lender still holds the object (PS-OBJ-010).
    expect(await effective(objectId)).toEqual([{ from: day(3), until: null }]);
    expect(await loanEvents(loanId)).toEqual([
      "loan.reserved",
      "loan.handover_reported",
      "loan.handed_over",
      "loan.handover_reported",
    ]);
    expect(
      (await eventsFor("loan", loanId)).find(
        (event) => event.event_type === "loan.handover_reported",
      )?.payload,
    ).toEqual({
      objectId,
      role: "borrower",
      outcome: "handed_over",
      agreementVersion: 1,
    });
  });

  it("is retry-safe: the same statement again returns the loan as it is", async () => {
    const { owner, loanId } = await reservedLoan(0, 2);
    const key = randomUUID();

    const first = await say(owner, loanId, "handed_over", 1, key);
    expect(await say(owner, loanId, "handed_over", 1, key)).toEqual(first);
    expect(await say(owner, loanId, "handed_over")).toEqual(first);
    expect(await statements(loanId)).toHaveLength(1);
    expect(await loanEvents(loanId)).toEqual([
      "loan.reserved",
      "loan.handover_reported",
      "loan.handed_over",
    ]);
  });

  it("waits neutrally for clarification once the handover day is over", async () => {
    const { owner, borrower, loanId } = await reservedLoan(1, 3);

    // The handover day itself is still before the handover.
    kit.advance(oneDay);
    expect((await loanOf(borrower, loanId)).status).toBe("reserved");

    kit.advance(oneDay);
    for (const party of [borrower, owner]) {
      expect(await loanOf(party, loanId)).toMatchObject({
        status: "awaiting_handover",
        ending: null,
        handover: { borrower: null, lender: null, answerDueAt: null },
      });
    }

    // Silence alone ends nothing and blames nobody, however long it lasts.
    kit.advance(10 * oneDay);
    await conclude();
    expect(await statusOf(loanId)).toMatchObject({ status: "reserved" });
    expect(await loanEvents(loanId)).toEqual(["loan.reserved"]);

    // It can still be handed over late; past its return day, it then awaits
    // the return at once (WP-34).
    expect((await say(owner, loanId, "handed_over")).status).toBe(
      "awaiting_return",
    );
    expect(await statusOf(loanId)).toMatchObject({ status: "active" });
  });

  it("ends as not completed, not cancelled, when both say it was not handed over", async () => {
    const { owner, borrower, objectId, requestId, loanId } = await reservedLoan(
      1,
      3,
    );

    // On the handover day, not handing over is still a cancellation.
    kit.advance(oneDay);
    await expect(say(owner, loanId, "not_handed_over")).rejects.toMatchObject({
      ...conflict,
      fields: ["outcome"],
    });

    kit.advance(oneDay);
    expect(await say(owner, loanId, "not_handed_over")).toEqual({
      loanId,
      status: "awaiting_handover",
      agreementVersion: 1,
    });
    const answerDueAt = new Date(
      kit.now().getTime() + 72 * oneHour,
    ).toISOString();
    expect(await loanOf(borrower, loanId)).toMatchObject({
      status: "awaiting_handover",
      handover: {
        borrower: null,
        lender: { outcome: "not_handed_over" },
        answerDueAt,
      },
    });

    expect(await say(borrower, loanId, "not_handed_over")).toEqual({
      loanId,
      status: "ended",
      agreementVersion: 1,
    });
    const endedAt = kit.now().toISOString();

    for (const party of [borrower, owner]) {
      expect(await loanOf(party, loanId)).toMatchObject({
        status: "ended",
        ending: { reason: "not_completed", endedBy: null, endedAt },
        handover: {
          borrower: { outcome: "not_handed_over" },
          lender: { outcome: "not_handed_over" },
          answerDueAt: null,
        },
      });
    }

    // The period is free again; the agreement, request and statements stay.
    expect(await reservation(loanId)).toBeNull();
    expect(await effective(objectId)).toEqual([
      { from: calendarDate(kit.now()), until: null },
    ]);
    expect(await stored(requestId)).toMatchObject({ status: "approved" });
    expect(await statements(loanId)).toHaveLength(2);
    expect(await eventsFor("loan", loanId)).toEqual([
      expect.objectContaining({ event_type: "loan.reserved" }),
      expect.objectContaining({ event_type: "loan.handover_reported" }),
      expect.objectContaining({ event_type: "loan.handover_reported" }),
      {
        event_type: "loan.not_completed",
        payload: { objectId, basis: "agreed" },
      },
    ]);

    // Nothing more can be said, and it is no cancellation either.
    await expect(say(owner, loanId, "handed_over")).rejects.toMatchObject(
      conflict,
    );
    await expect(run(cancelLoan, borrower, { loanId })).rejects.toMatchObject(
      conflict,
    );
    expect((await say(owner, loanId, "not_handed_over")).status).toBe("ended");
  });

  it("ends an unanswered statement as not completed after 72 hours, by nobody", async () => {
    const { owner, borrower, objectId, loanId } = await pastHandover();

    await say(borrower, loanId, "not_handed_over");

    kit.advance(71 * oneHour);
    await conclude();
    expect(await statusOf(loanId)).toMatchObject({ status: "reserved" });
    expect((await loanOf(owner, loanId)).status).toBe("awaiting_handover");

    kit.advance(2 * oneHour);
    await conclude();
    expect(await statusOf(loanId)).toEqual({
      status: "ended",
      end_reason: "not_completed",
      ended_by_user_id: null,
    });
    expect(await loanOf(owner, loanId)).toMatchObject({
      ending: { reason: "not_completed", endedBy: null },
    });
    expect(await reservation(loanId)).toBeNull();
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.not_completed",
      payload: { objectId, basis: "unanswered" },
    });

    // A later answer comes too late; running the job again changes nothing.
    await expect(say(owner, loanId, "handed_over")).rejects.toMatchObject(
      conflict,
    );
    await conclude();
    expect(
      (await loanEvents(loanId)).filter(
        (type) => type === "loan.not_completed",
      ),
    ).toHaveLength(1);
  });

  it("lets an answer that comes before the job win, even after the deadline", async () => {
    const { owner, borrower, loanId } = await pastHandover();

    await say(owner, loanId, "not_handed_over");
    kit.advance(73 * oneHour);
    expect((await say(borrower, loanId, "handed_over")).status).toBe(
      "disputed",
    );

    await conclude();
    expect(await statusOf(loanId)).toMatchObject({ status: "disputed" });
  });

  it("starts over when the parties agree a new handover day (WP-32)", async () => {
    const { owner, borrower, loanId } = await pastHandover();

    await say(owner, loanId, "not_handed_over");
    const { amendmentId } = await run(proposeLoanAmendment, owner, {
      loanId,
      agreementVersion: 1,
      // Long enough that the return day is not over when the old
      // clarification's deadline passes below, whatever the time of day.
      period: { start: day(1), end: day(5) },
    });
    await run(acceptLoanAmendment, borrower, { loanId, amendmentId });

    // The statements were about the old handover; they stay as history.
    expect(await loanOf(borrower, loanId)).toMatchObject({
      status: "reserved",
      agreement: { version: 2 },
      handover: { borrower: null, lender: null, answerDueAt: null },
    });
    expect(await statements(loanId)).toEqual([
      {
        reporter_role: "lender",
        outcome: "not_handed_over",
        agreement_version: 1,
      },
    ]);
    await expect(say(borrower, loanId, "handed_over", 1)).rejects.toMatchObject(
      { ...conflict, fields: ["agreementVersion"] },
    );

    kit.advance(73 * oneHour);
    await conclude();
    expect(await statusOf(loanId)).toMatchObject({ status: "reserved" });
    expect((await say(borrower, loanId, "handed_over", 2)).status).toBe(
      "active",
    );
  });
});

describe("a disputed handover (PS-LOAN-013, scenario 61)", () => {
  /**
   * Anne's loan of the trailer is for days 1–3, Kari's for days 7–9, both
   * approved; Per has asked for days 12–13. Anne's handover day is over.
   */
  async function disputedSetup() {
    const anne = await reservedLoan(1, 3);
    const kari = await member(anne.environmentId, anne.admin);
    const origin = environmentOrigin(anne.environmentId);
    const karis = await ask(kari, anne.objectId, origin, dated(7, 9));
    const { loanId: karisLoanId } = await run(approveLoanRequest, anne.owner, {
      requestId: karis.requestId,
    });
    const per = await member(anne.environmentId, anne.admin);
    const { requestId: persRequestId } = await ask(
      per,
      anne.objectId,
      origin,
      dated(12, 13),
    );
    kit.advance(2 * oneDay);

    return { ...anne, kari, karisLoanId, per, persRequestId };
  }

  it("blocks new colliding loans while loans already approved stay as they are", async () => {
    const {
      owner,
      borrower,
      kari,
      objectId,
      loanId,
      karisLoanId,
      persRequestId,
    } = await disputedSetup();

    await say(owner, loanId, "handed_over");
    expect(await say(borrower, loanId, "not_handed_over")).toEqual({
      loanId,
      status: "disputed",
      agreementVersion: 1,
    });
    expect(await loanOf(owner, loanId)).toMatchObject({
      status: "disputed",
      handover: {
        borrower: { outcome: "not_handed_over" },
        lender: { outcome: "handed_over" },
        answerDueAt: null,
      },
    });
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.handover_disputed",
      payload: { objectId, otherLoanIds: [karisLoanId] },
    });

    // Nobody knows who has the object: nothing is available from the
    // disputed handover day on, and Per's request cannot be approved.
    expect(await effective(objectId)).toEqual([]);
    await expect(
      run(approveLoanRequest, owner, { requestId: persRequestId }),
    ).rejects.toMatchObject(conflict);
    expect(await stored(persRequestId)).toMatchObject({ status: "requested" });

    // Kari's loan stays, may not grow into the blocked days, and its parties
    // keep their ordinary rights.
    expect(await reservation(karisLoanId)).toBe(range(5, 7));
    expect((await loanOf(kari, karisLoanId)).status).toBe("reserved");
    await expect(
      run(proposeLoanAmendment, kari, {
        loanId: karisLoanId,
        agreementVersion: 1,
        period: { start: day(5), end: day(8) },
      }),
    ).rejects.toMatchObject({ ...conflict, fields: ["period"] });
    const shorter = await run(proposeLoanAmendment, kari, {
      loanId: karisLoanId,
      agreementVersion: 1,
      period: { start: day(5), end: day(6) },
    });
    await run(acceptLoanAmendment, owner, {
      loanId: karisLoanId,
      amendmentId: shorter.amendmentId,
    });
    expect(await reservation(karisLoanId)).toBe(range(5, 6));

    // The disputed loan keeps its reservation and stays a commitment.
    expect(await reservation(loanId)).toBe(range(-1, 1));
    await expect(run(cancelLoan, borrower, { loanId })).rejects.toMatchObject(
      conflict,
    );

    // The borrower agrees after all: it is active and the block lifts.
    expect((await say(borrower, loanId, "handed_over")).status).toBe("active");
    expect((await eventsFor("loan", loanId)).at(-1)).toMatchObject({
      event_type: "loan.handed_over",
    });
    expect(
      await run(approveLoanRequest, owner, { requestId: persRequestId }),
    ).toMatchObject({ status: "approved" });
  });

  it("is settled by either side: both saying not handed over ends it", async () => {
    const { owner, borrower, objectId, loanId, karisLoanId } =
      await disputedSetup();

    expect((await say(borrower, loanId, "handed_over")).status).toBe("active");
    expect((await say(owner, loanId, "not_handed_over")).status).toBe(
      "disputed",
    );
    // The borrower is the one who changes their mind.
    expect((await say(borrower, loanId, "not_handed_over")).status).toBe(
      "ended",
    );

    expect(await statusOf(loanId)).toEqual({
      status: "ended",
      end_reason: "not_completed",
      ended_by_user_id: null,
    });
    expect(await reservation(loanId)).toBeNull();
    expect(await reservation(karisLoanId)).toBe(range(5, 7));
    expect(await effective(objectId)).toEqual([
      { from: day(0), until: day(5) },
      { from: day(8), until: null },
    ]);
  });
});

describe("the parties keep what the handover needs (PS-LOAN-002, scenario 81)", () => {
  it("lets only the parties speak; other co-owners and everyone else get not_found", async () => {
    const { owner, objectId, loanId, admin } = await reservedLoan(0, 2);
    const coOwner = await user();
    await addCoOwner(owner, objectId, coOwner);

    for (const outsider of [coOwner, admin, await user()]) {
      await expect(say(outsider, loanId, "handed_over")).rejects.toMatchObject(
        notFound,
      );
    }
    expect(await statements(loanId)).toEqual([]);

    // The responsible lender cannot leave the object while it is lent out.
    await say(owner, loanId, "handed_over");
    await expect(run(leaveObject, owner, { objectId })).rejects.toMatchObject(
      conflict,
    );
  });

  it("survives an ended friendship and a block between the parties", async () => {
    const { owner, borrower, loanId } = await directLoan(0, 2);

    await run(removeFriend, owner, { userId: borrower.userId });
    await run(blockUser, borrower, { userId: owner.userId });

    expect((await say(owner, loanId, "handed_over")).status).toBe("active");
    expect((await loanOf(borrower, loanId)).status).toBe("active");
  });

  it("survives the borrower leaving the environment", async () => {
    const { borrower, environmentId, loanId } = await reservedLoan(0, 2);

    await run(leaveEnvironment, borrower, { environmentId });

    expect((await say(borrower, loanId, "handed_over")).status).toBe("active");
  });
});

describe("concurrency (docs/architecture/05)", () => {
  it("gives one consistent status when both parties speak at once", async () => {
    const { owner, borrower, loanId } = await pastHandover();

    const results = await Promise.allSettled([
      say(owner, loanId, "handed_over"),
      say(borrower, loanId, "not_handed_over"),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect(await statusOf(loanId)).toMatchObject({ status: "disputed" });
    expect(await statements(loanId)).toHaveLength(2);
  });

  it("never lets a dispute and a colliding approval both see a free object", async () => {
    const { owner, borrower, loanId, persRequestId } = await (async () => {
      const anne = await reservedLoan(1, 3);
      const per = await member(anne.environmentId, anne.admin);
      const { requestId } = await ask(
        per,
        anne.objectId,
        environmentOrigin(anne.environmentId),
        dated(9, 10),
      );
      kit.advance(2 * oneDay);
      await say(anne.owner, anne.loanId, "handed_over");

      return { ...anne, persRequestId: requestId };
    })();

    const [disputed, approved] = await Promise.allSettled([
      say(borrower, loanId, "not_handed_over"),
      run(approveLoanRequest, owner, { requestId: persRequestId }),
    ]);

    expect(disputed.status).toBe("fulfilled");
    expect(await statusOf(loanId)).toMatchObject({ status: "disputed" });
    // Either the approval came first and stays (continuity), or it saw the
    // dispute and was refused with the request still open.
    expect((await stored(persRequestId)).status).toBe(
      approved.status === "fulfilled" ? "approved" : "requested",
    );
  });

  it("lets the deadline job and a late answer race without both winning", async () => {
    const { owner, borrower, loanId } = await pastHandover();

    await say(owner, loanId, "not_handed_over");
    kit.advance(73 * oneHour);

    const [, answered] = await Promise.allSettled([
      conclude(),
      say(borrower, loanId, "handed_over"),
    ]);

    const { status, end_reason } = await statusOf(loanId);
    if (answered.status === "fulfilled") {
      expect(status).toBe("disputed");
    } else {
      expect({ status, end_reason }).toEqual({
        status: "ended",
        end_reason: "not_completed",
      });
      expect(answered.reason).toMatchObject(conflict);
    }
  });

  it("lets an agreed new handover and the deadline job race without both winning", async () => {
    const { owner, borrower, loanId } = await pastHandover();

    await say(owner, loanId, "not_handed_over");
    const { amendmentId } = await run(proposeLoanAmendment, owner, {
      loanId,
      agreementVersion: 1,
      period: { start: day(5), end: day(6) },
    });
    const agreed = range(5, 6);
    kit.advance(73 * oneHour);

    const [, accepted] = await Promise.allSettled([
      conclude(),
      run(acceptLoanAmendment, borrower, { loanId, amendmentId }),
    ]);

    const { status } = await statusOf(loanId);
    expect(status).toBe(accepted.status === "fulfilled" ? "reserved" : "ended");
    expect(await reservation(loanId)).toBe(
      accepted.status === "fulfilled" ? agreed : null,
    );
  });
});

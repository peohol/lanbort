import {
  type LoanHandoverResult,
  loanHandoverResultSchema,
  reportHandoverSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { calendarDate } from "../objects/availability";
import { actingUserId } from "../objects/state";
import {
  loanHandedOver,
  loanHandoverDisputed,
  loanHandoverReported,
  loanNotCompleted,
} from "./events";
import {
  dueHandoverAnswers,
  insertHandoverStatement,
  loadHandoverReading,
  otherCommittedLoans,
  setLoanStatus,
  tryLockObject,
} from "./handover-store";
import {
  type HandoverVerdict,
  handoverRefusal,
  handoverVerdict,
  presentedLoanStatus,
  type StoredLoanStatus,
  statusAfterHandover,
} from "./model";
import {
  concludeHandoversPolicy,
  loanRoleOf,
  reportHandoverPolicy,
} from "./policies";
import { loadLockedLoan } from "./resources";
import { endLoan, findLoan, type LoanRecord } from "./reservations";

/**
 * The handover and the active loan (WP-33, PS-LOAN-012–013). The parties say
 * what happened; the loan's status follows from what they say
 * ({@link handoverVerdict}), never from who said it first or from silence.
 */
type Db = Kysely<Database>;

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

/**
 * Moves the loan to the status `verdict` leads to, in the caller's
 * transaction, with the object and the loan locked:
 * - `active`: handed over; an open proposal lapses (database), since changes
 *   during the loan are the return's (WP-34);
 * - `disputed`: the object is blocked for new colliding loans
 *   (`loanPossessionBlocks`), while loans already approved stay as they are;
 *   their ids go with the event so their parties can be told (scenario 61);
 * - `ended` as not completed, by no party: the reservation is released.
 * Nothing changes while the verdict leaves the loan where it is.
 */
async function settleHandover(
  db: Db,
  input: {
    readonly loan: LoanRecord;
    readonly objectId: string;
    readonly verdict: HandoverVerdict;
    readonly now: Date;
  },
  events: EventRecorder,
): Promise<StoredLoanStatus> {
  const { loan, objectId, verdict, now } = input;
  const status = statusAfterHandover(verdict);

  if (status === loan.status) {
    return status;
  }

  switch (status) {
    case "ended":
      await endLoan(db, {
        loanId: loan.id,
        from: ["reserved", "disputed"],
        reason: "not_completed",
        endedByUserId: null,
        now,
      });
      events.record(loanNotCompleted, {
        resourceId: loan.id,
        payload: {
          objectId,
          basis: verdict === "unanswered" ? "unanswered" : "agreed",
        },
      });
      break;
    case "active":
      await setLoanStatus(db, {
        loanId: loan.id,
        from: loan.status,
        to: status,
        now,
      });
      events.record(loanHandedOver, {
        resourceId: loan.id,
        payload: { objectId },
      });
      break;
    case "disputed":
      await setLoanStatus(db, {
        loanId: loan.id,
        from: loan.status,
        to: status,
        now,
      });
      events.record(loanHandoverDisputed, {
        resourceId: loan.id,
        payload: {
          objectId,
          otherLoanIds: await otherCommittedLoans(db, objectId, loan.id),
        },
      });
      break;
    case "reserved":
      throw new Error(`A ${loan.status} loan does not go back to reserved`);
  }

  return status;
}

const handoverResult = (
  loan: Pick<LoanRecord, "id" | "agreement">,
  status: StoredLoanStatus,
  now: Date,
): LoanHandoverResult => ({
  loanId: loan.id,
  status: presentedLoanStatus(status, loan.agreement.period, calendarDate(now)),
  agreementVersion: loan.agreement.version,
});

/**
 * PS-LOAN-012–013: a party says whether the object was handed over, in one
 * transaction (docs/architecture/05):
 * 1. the object is locked, then the loan, so statements, agreed changes,
 *    cancellations, approvals of the object and the deadline job run one
 *    after another;
 * 2. the statement is on the agreement the caller saw (`agreementVersion`):
 *    an agreed new handover makes earlier statements history;
 * 3. the caller may say it now ({@link handoverRefusal}): «handed over»
 *    from the handover day on, «not handed over» once that day is over, and
 *    once the loan is active only the side that has not spoken may still
 *    contradict it;
 * 4. the statement is recorded (append-only), and the loan moves to what
 *    the statements of both sides now say ({@link statusAfterHandover}):
 *    one side's «handed over» makes it active, contradicting statements
 *    make it disputed, both saying «not handed over» ends it as not
 *    completed, and one side's «not handed over» gives the other
 *    {@link handoverAnswerHours} hours to answer.
 * Saying again what one said last returns the loan as it is. Nothing else is
 * checked: a friendship, membership or block that is gone never stops a
 * party from settling the handover (PS-LOAN-002, scenario 81), and other
 * co-owners are not parties.
 */
export const reportHandover = defineCommand({
  name: "loan.report_handover",
  input: reportHandoverSchema,
  output: loanHandoverResultSchema,
  policy: reportHandoverPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedLoan(tx, input.loanId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const { loan } = resource;
    const role = loanRoleOf(actor, resource);

    if (!role) {
      throw new Error("The policy allows only a party of the loan");
    }

    if (input.agreementVersion !== loan.agreement.version) {
      conflict("The agreement has changed", ["agreementVersion"]);
    }

    const reading = await loadHandoverReading(
      tx,
      loan.id,
      loan.agreement.version,
    );

    if (reading[role]?.outcome === input.outcome) {
      return handoverResult(loan, loan.status, now);
    }

    const refusal = handoverRefusal(
      loan.status,
      loan.agreement.period,
      reading,
      role,
      input.outcome,
      calendarDate(now),
    );

    if (refusal) {
      conflict(refusal.message, refusal.fields);
    }

    if (loan.objectId === null) {
      throw new Error("A loan that has not ended without its object");
    }

    const statement = await insertHandoverStatement(tx, {
      loanId: loan.id,
      agreementVersion: loan.agreement.version,
      userId: actingUserId(actor),
      role,
      outcome: input.outcome,
      now,
    });
    events.record(loanHandoverReported, {
      resourceId: loan.id,
      payload: {
        objectId: loan.objectId,
        role,
        outcome: input.outcome,
        agreementVersion: loan.agreement.version,
      },
    });

    const status = await settleHandover(
      tx,
      {
        loan,
        objectId: loan.objectId,
        verdict: handoverVerdict({ ...reading, [role]: statement }, now),
        now,
      },
      events,
    );

    return handoverResult(loan, status, now);
  },
});

/** How many loans one run of the job settles at most. */
const handoverBatchSize = 100;

/**
 * The scheduled job for PS-LOAN-012: a reserved loan where one party said
 * the object was not handed over, and the other did not answer before the
 * deadline, ends as not completed by nobody. Safe to run repeatedly and
 * concurrently: objects another run or a command holds are skipped until
 * the next run, and each loan is re-read under its locks, so an answer, an
 * agreed new handover or a cancellation that came first always wins.
 */
export const concludeHandovers = defineCommand({
  name: "loan.conclude_handovers",
  input: z.strictObject({}),
  output: z.strictObject({ notCompleted: z.int().nonnegative() }),
  policy: concludeHandoversPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, events, now }) => {
    let notCompleted = 0;

    for (const due of await dueHandoverAnswers(tx, now, handoverBatchSize)) {
      if (!(await tryLockObject(tx, due.objectId))) continue;

      const loan = await findLoan(tx, { loanId: due.loanId }, { lock: true });
      if (loan?.status !== "reserved" || loan.objectId !== due.objectId)
        continue;

      const reading = await loadHandoverReading(
        tx,
        loan.id,
        loan.agreement.version,
      );
      const verdict = handoverVerdict(reading, now);
      if (verdict !== "unanswered") continue;

      await settleHandover(
        tx,
        { loan, objectId: due.objectId, verdict, now },
        events,
      );
      notCompleted += 1;
    }

    return { notCompleted };
  },
});

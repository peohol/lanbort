import {
  type LoanReturnResult,
  loanReferenceSchema,
  loanReturnResultSchema,
  type ReturnReporter,
  reportReturnSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { addDays, calendarDate } from "../objects/availability";
import { actingUserId } from "../objects/state";
import { loanReturnDisputed, loanReturned, loanReturnReported } from "./events";
import {
  otherCommittedLoans,
  setLoanStatus,
  tryLockObject,
} from "./handover-store";
import {
  inReturnPhase,
  isReturnConfirmation,
  presentedLoanStatus,
  type ReturnStatement,
  repeatsLastStatement,
  returnPhaseStatuses,
  returnRefusal,
  returnSide,
  returnVerdict,
  type StoredLoanStatus,
  statusAfterReturn,
} from "./model";
import {
  concludeReturnsPolicy,
  loanRoleOf,
  reportReturnPolicy,
  undoReturnPolicy,
} from "./policies";
import { loadLockedLoan } from "./resources";
import { endLoan, findLoan, type LoanRecord } from "./reservations";
import { loadCoOwnerReach, speakerAllowed } from "./responsibility-store";
import {
  dueReturnConfirmations,
  findPendingReturns,
  insertPendingReturn,
  insertReturnStatement,
  latestConfirmationStatus,
  loadReturnStatements,
  type PendingReturn,
  reopenLoan,
  resolvePendingReturn,
} from "./return-store";

/**
 * The return and early return (WP-34, PS-LOAN-014–017, PS-LOAN-020). As at
 * the handover, the parties say what happened and the loan's status follows
 * from what they say ({@link returnVerdict}): never from who spoke first, and
 * never from silence or the date alone. Only the responsible lender's
 * receipt ends the loan.
 */
type Db = Kysely<Database>;

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

function requireObject(loan: LoanRecord): string {
  if (loan.objectId === null) {
    conflict("The loan has ended");
  }

  return loan.objectId;
}

/**
 * Moves the loan to the status the statements now lead to
 * ({@link statusAfterReturn}), in the caller's transaction, with the object
 * and the loan locked:
 * - `ended` as returned, by the lender who confirmed it: the reservation is
 *   released at once, so an early return frees the rest of the period
 *   unless something else blocks it (PS-LOAN-020);
 * - `return_disputed`: the object stays blocked for new colliding loans
 *   (`loanPossessionBlocks`), loans already approved stay as they are, and
 *   their ids go with the event (scenario 58); a loan that had ended as
 *   returned reopens (PS-LOAN-017), keeping its ending as history;
 * - `active`, `awaiting_return` or `late`: only the status changes; the
 *   database lapses what can no longer happen.
 */
async function settleReturn(
  db: Db,
  input: {
    readonly loan: LoanRecord;
    readonly objectId: string;
    readonly statements: readonly ReturnStatement[];
    readonly byUserId: string;
    readonly now: Date;
  },
  events: EventRecorder,
): Promise<StoredLoanStatus> {
  const { loan, objectId, now } = input;
  const status = statusAfterReturn(returnVerdict(input.statements));

  if (status === loan.status) {
    return status;
  }

  switch (status) {
    case "ended":
      await endLoan(db, {
        loanId: loan.id,
        from: returnPhaseStatuses,
        reason: "returned",
        endedByUserId: input.byUserId,
        now,
      });
      events.record(loanReturned, {
        resourceId: loan.id,
        payload: {
          objectId,
          early: calendarDate(now) < addDays(loan.agreement.period.until, -1),
        },
      });
      break;
    case "return_disputed":
      if (loan.status === "ended") {
        await reopenLoan(db, { loanId: loan.id, now });
      } else {
        await setLoanStatus(db, {
          loanId: loan.id,
          from: loan.status,
          to: status,
          now,
        });
      }

      events.record(loanReturnDisputed, {
        resourceId: loan.id,
        payload: {
          objectId,
          reopened: loan.status === "ended",
          otherLoanIds: await otherCommittedLoans(db, objectId, loan.id),
        },
      });
      break;
    default:
      await setLoanStatus(db, {
        loanId: loan.id,
        from: loan.status,
        to: status,
        now,
      });
  }

  return status;
}

/**
 * Makes a statement now: records it (append-only) and its event, and moves
 * the loan to what all statements on the agreement now say.
 */
async function makeStatement(
  db: Db,
  input: {
    readonly loan: LoanRecord;
    readonly statements: readonly ReturnStatement[];
    readonly userId: string;
    readonly role: ReturnStatement["role"];
    readonly reportedAs: ReturnReporter;
    readonly outcome: ReturnStatement["outcome"];
    readonly confirmationId: string | null;
    readonly now: Date;
  },
  events: EventRecorder,
): Promise<StoredLoanStatus> {
  const { loan, now } = input;
  const objectId = requireObject(loan);
  const statement = await insertReturnStatement(db, {
    loanId: loan.id,
    agreementVersion: loan.agreement.version,
    userId: input.userId,
    role: input.role,
    reportedAs: input.reportedAs,
    outcome: input.outcome,
    confirmationId: input.confirmationId,
    now,
  });
  events.record(loanReturnReported, {
    resourceId: loan.id,
    payload: {
      objectId,
      role: input.role,
      outcome: input.outcome,
      agreementVersion: loan.agreement.version,
      reportedAs: input.reportedAs,
    },
  });

  return settleReturn(
    db,
    {
      loan,
      objectId,
      statements: [...input.statements, statement],
      byUserId: input.userId,
      now,
    },
    events,
  );
}

/** Whoever made the waiting confirmation may still speak for its side. */
const stillSpeaks = (db: Db, pending: PendingReturn) =>
  speakerAllowed(db, {
    loanId: pending.loanId,
    role: pending.role,
    userId: pending.userId,
    reportedAs: pending.reportedAs,
  });

/**
 * Makes a waiting confirmation: when its buffer is over, as of the moment
 * it took effect, however late the job or the next command comes by; or
 * now, when its party asks for it early. It is made on the agreement and
 * status the loan has then, by someone who may still speak for its side; if
 * it can no longer be (the database lapses those whose loan or agreement
 * moved on), it lapses. So does one whose maker lost that right since: the
 * lender's role moved on (WP-35), or a co-owner lost the narrow receipt role.
 */
async function makePending(
  db: Db,
  loan: LoanRecord,
  pending: PendingReturn,
  now: Date,
  events: EventRecorder,
): Promise<LoanRecord> {
  if (
    !inReturnPhase(loan.status) ||
    pending.agreementVersion !== loan.agreement.version ||
    !(await stillSpeaks(db, pending))
  ) {
    await resolvePendingReturn(db, { id: pending.id, status: "lapsed", now });
    return loan;
  }

  // Due confirmations ran first (settleDueReturns), so nothing that
  // happened to the loan since can come before this moment.
  const at = pending.effectiveAt < now ? pending.effectiveAt : now;
  const statements = await loadReturnStatements(
    db,
    loan.id,
    loan.agreement.version,
  );
  await resolvePendingReturn(db, {
    id: pending.id,
    status: "applied",
    now: at,
  });
  await makeStatement(
    db,
    {
      loan,
      statements,
      userId: pending.userId,
      role: pending.role,
      reportedAs: pending.reportedAs,
      outcome: pending.outcome,
      confirmationId: pending.id,
      now: at,
    },
    events,
  );

  return reload(db, loan.id);
}

async function reload(db: Db, loanId: string): Promise<LoanRecord> {
  const loan = await findLoan(db, { loanId });

  if (!loan) {
    throw new Error("A loan that disappeared");
  }

  return loan;
}

/**
 * PS-LOAN-016: before anything else happens to a loan in its return phase,
 * the waiting confirmations whose buffer is over are made, the earliest
 * first, so what a party confirmed counts from when it took effect, not from
 * when a job came by. Returns the loan as it is then, and how many were made.
 */
export async function settleDueReturns(
  db: Db,
  loan: LoanRecord,
  now: Date,
  events: EventRecorder,
): Promise<{ loan: LoanRecord; made: number }> {
  let current = loan;
  let made = 0;

  // Each one is read again: making one can lapse the others.
  while (inReturnPhase(current.status)) {
    const [due] = await findPendingReturns(db, current.id, { dueBy: now });

    if (!due) {
      break;
    }

    current = await makePending(db, current, due, now, events);
    made += 1;
  }

  return { loan: current, made };
}

/**
 * Lapses the loan's waiting confirmations whose makers may no longer speak
 * for their side, at once: when the lender's role moves (WP-35), the former
 * lender's confirmation is not made later in someone else's name.
 */
export async function lapseUnspokenReturns(
  db: Db,
  loanId: string,
  now: Date,
): Promise<void> {
  for (const pending of await findPendingReturns(db, loanId)) {
    if (!(await stillSpeaks(db, pending))) {
      await resolvePendingReturn(db, { id: pending.id, status: "lapsed", now });
    }
  }
}

/**
 * The loan, locked, with whether the caller, who is not its party, may
 * confirm the receipt for the lender's side (PS-LOAN-015). `receipt` says
 * whether the caller asks to: nobody else gets that far.
 */
async function loadReturnLoan(
  tx: Transaction<Database>,
  actor: Actor,
  loanId: string,
  receipt: boolean,
) {
  const loaded = await loadLockedLoan(tx, loanId);

  if (!loaded) {
    return null;
  }

  const outsider =
    receipt && actor.kind === "user" && !loanRoleOf(actor, loaded.resource);

  return {
    ...loaded.resource,
    receivesForLender:
      outsider &&
      (await loadCoOwnerReach(tx, loanId, actor.userId)).receivesForLender,
  };
}

/** Who speaks: the party of `side`, or a co-owner in the narrow receipt role. */
function speakingAs(
  actor: Actor,
  resource: Parameters<typeof loanRoleOf>[1] & { receivesForLender: boolean },
): { role: ReturnStatement["role"]; reportedAs: ReturnReporter } {
  const role = loanRoleOf(actor, resource);

  if (role) {
    return { role, reportedAs: "party" };
  }

  if (!resource.receivesForLender) {
    throw new Error("The policy allows only a party or a receiving co-owner");
  }

  return { role: "lender", reportedAs: "co_owner" };
}

const returnResult = (
  loan: Pick<LoanRecord, "id" | "agreement">,
  status: StoredLoanStatus,
  pending: Pick<PendingReturn, "outcome" | "effectiveAt"> | null,
  now: Date,
): LoanReturnResult => ({
  loanId: loan.id,
  status: presentedLoanStatus(status, loan.agreement.period, calendarDate(now)),
  agreementVersion: loan.agreement.version,
  pending: pending && {
    outcome: pending.outcome,
    effectiveAt: pending.effectiveAt.toISOString(),
  },
});

/**
 * PS-LOAN-014–017, PS-LOAN-020: a party says what happened at the return,
 * in one transaction (docs/architecture/05):
 * 1. the object is locked, then the loan, so statements, confirmations,
 *    agreed changes, approvals of the object and the job run one after
 *    another; confirmations that are due are made first;
 * 2. the statement is on the agreement the caller saw (`agreementVersion`):
 *    an agreed new return day makes earlier statements history;
 * 3. the caller's side may say it now ({@link returnRefusal}): the borrower
 *    that it was returned, or, once the return day is over, that they still
 *    have it; the responsible lender that it was received, or, once the
 *    return day is over or the borrower says it was returned, that it was
 *    not. After the loan ended as returned, only a contradiction of the
 *    receipt can be said, which reopens it;
 * 4. a return confirmation (returned, received) waits
 *    {@link returnUndoSeconds} seconds unless the caller asks for it
 *    `immediately`: until then only the caller sees it and can undo it;
 *    sending it again with `immediately` makes it at once. Other statements
 *    are made at once;
 * 5. a statement made is recorded (append-only), and the loan moves to what
 *    all statements now say ({@link statusAfterReturn}): the lender's receipt
 *    ends it as returned and frees the rest of its period; the borrower's
 *    word alone never does.
 * Saying again what one's side said last, with nobody speaking since,
 * returns the loan as it is. While the caller's own confirmation waits, they
 * undo or make it before saying something else; while someone else's
 * confirmation waits on the same side, the caller waits for it. Nothing
 * else is checked: a friendship, membership or block that is gone never
 * stops a party from settling the return (PS-LOAN-002, PS-LOAN-021,
 * scenario 81). Other co-owners are not parties, except that while the
 * responsible lender is established as unavailable, a co-owner of the
 * circle may confirm the receipt for the lender's side without becoming
 * responsible (PS-LOAN-015); it is recorded as theirs, and ends the loan
 * like the lender's.
 */
export const reportReturn = defineCommand({
  name: "loan.report_return",
  input: reportReturnSchema,
  output: loanReturnResultSchema,
  policy: reportReturnPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input }) => {
    const loaded = await loadReturnLoan(
      tx,
      actor,
      input.loanId,
      input.outcome === "received",
    );

    return (
      loaded && {
        resource: { ...loaded, side: returnSide(input.outcome) },
        context: undefined,
      }
    );
  },
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const { role, reportedAs } = speakingAs(actor, resource);

    if (role !== resource.side) {
      throw new Error("The policy allows only the statement's own side");
    }

    const { loan } = await settleDueReturns(tx, resource.loan, now, events);

    if (input.agreementVersion !== loan.agreement.version) {
      conflict("The agreement has changed", ["agreementVersion"]);
    }

    const userId = actingUserId(actor);
    const [own] = await findPendingReturns(tx, loan.id, { role });

    if (own) {
      if (own.userId !== userId) {
        conflict("A return confirmation for this side is waiting");
      }

      if (own.outcome !== input.outcome) {
        conflict("Your return confirmation is waiting", ["outcome"]);
      }

      if (!input.immediately) {
        return returnResult(loan, loan.status, own, now);
      }

      const made = await makePending(tx, loan, own, now, events);
      return returnResult(made, made.status, null, now);
    }

    const statements = await loadReturnStatements(
      tx,
      loan.id,
      loan.agreement.version,
    );

    if (repeatsLastStatement(statements, role, input.outcome)) {
      return returnResult(loan, loan.status, null, now);
    }

    const refusal = returnRefusal(
      {
        status: loan.status,
        endReason: loan.ending?.reason ?? null,
        period: loan.agreement.period,
      },
      statements,
      input.outcome,
      calendarDate(now),
    );

    if (refusal) {
      conflict(refusal.message, refusal.fields);
    }

    if (isReturnConfirmation(input.outcome) && !input.immediately) {
      const pending = await insertPendingReturn(tx, {
        loanId: loan.id,
        agreementVersion: loan.agreement.version,
        userId,
        role,
        reportedAs,
        outcome: input.outcome,
        now,
      });

      return returnResult(loan, loan.status, pending, now);
    }

    const status = await makeStatement(
      tx,
      {
        loan,
        statements,
        userId,
        role,
        reportedAs,
        outcome: input.outcome,
        confirmationId: null,
        now,
      },
      events,
    );

    return returnResult(loan, status, null, now);
  },
});

/**
 * PS-LOAN-016: the caller takes back their waiting return confirmation
 * before it takes effect, as if it was never sent: nobody else saw it, and
 * it has no event. Undoing it again returns the loan as it is. Once the
 * buffer is over it is made and stays: a mistake is then corrected with a
 * new statement (PS-LOAN-017). A co-owner undoes their own receipt the same
 * way while they hold the narrow receipt role.
 */
export const undoReturn = defineCommand({
  name: "loan.undo_return",
  input: loanReferenceSchema,
  output: loanReturnResultSchema,
  policy: undoReturnPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input }) => {
    const loaded = await loadReturnLoan(tx, actor, input.loanId, true);

    return loaded && { resource: loaded, context: undefined };
  },
  execute: async ({ tx, actor, resource, events, now }) => {
    const { role } = speakingAs(actor, resource);
    const userId = actingUserId(actor);
    const { loan } = await settleDueReturns(tx, resource.loan, now, events);
    const own = (await findPendingReturns(tx, loan.id, { role })).find(
      (pending) => pending.userId === userId,
    );

    if (own) {
      await resolvePendingReturn(tx, { id: own.id, status: "withdrawn", now });
    } else if (
      (await latestConfirmationStatus(tx, loan.id, userId)) !== "withdrawn"
    ) {
      conflict("No return confirmation is waiting");
    }

    return returnResult(loan, loan.status, null, now);
  },
});

/** How many loans one run of the job settles at most. */
const returnBatchSize = 100;

/**
 * The scheduled job for PS-LOAN-016: makes return confirmations whose undo
 * buffer is over, on loans nobody has touched since. Safe to run repeatedly
 * and concurrently: objects another run or a command holds are skipped
 * until the next run, and each loan is re-read under its locks, so an undo
 * or another statement that came first always counts first.
 */
export const concludeReturns = defineCommand({
  name: "loan.conclude_returns",
  input: z.strictObject({}),
  output: z.strictObject({ made: z.int().nonnegative() }),
  policy: concludeReturnsPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, events, now }) => {
    let made = 0;

    for (const due of await dueReturnConfirmations(tx, now, returnBatchSize)) {
      if (!(await tryLockObject(tx, due.objectId))) continue;

      const loan = await findLoan(tx, { loanId: due.loanId }, { lock: true });
      if (loan?.objectId !== due.objectId) continue;

      made += (await settleDueReturns(tx, loan, now, events)).made;
    }

    return { made };
  },
});

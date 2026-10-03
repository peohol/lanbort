import {
  type LoanControlResult,
  loanControlResultSchema,
  loanReferenceSchema,
  type LoanUnresolvedResult,
  loanUnresolvedResultSchema,
} from "@lanbort/contracts";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import { calendarDate } from "../objects/availability";
import { actingUserId } from "../objects/state";
import { loanControlConfirmed, loanEndedUnresolved } from "./events";
import { loadHandoverReading, otherCommittedLoans } from "./handover-store";
import {
  handoverVerdict,
  type StoredLoanStatus,
  unresolvedEndable,
} from "./model";
import { confirmLoanControlPolicy, endLoanUnresolvedPolicy } from "./policies";
import { loadLoan, loadLockedLoan } from "./resources";
import {
  endLoan,
  findControlConfirmation,
  type LoanRecord,
} from "./reservations";
import { settleDueReturns } from "./return";

/**
 * The administrative unresolved ending (PS-LOAN-018) and the owner's
 * confirmation of control that follows it (PS-LOAN-019). The ending closes
 * the loan's process without saying what happened or who was right: the
 * statements stay as they were, and it ends by no party. The object stays
 * blocked for new loans as while its possession was uncertain, until an
 * owner confirms having it back; loans already approved stay as they are.
 */
function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

/** The statuses a loan can end unresolved from ({@link unresolvedEndable}). */
const unsettledStatuses: readonly StoredLoanStatus[] = [
  "reserved",
  "disputed",
  "active",
  "awaiting_return",
  "late",
  "return_disputed",
];

const unresolvedResult = (loan: LoanRecord): LoanUnresolvedResult => {
  if (loan.ending?.reason !== "unresolved") {
    throw new Error("The loan has not ended unresolved");
  }

  return { loanId: loan.id, endedAt: loan.ending.endedAt.toISOString() };
};

/**
 * PS-LOAN-018: ends the loan as administratively unresolved, in one
 * transaction: the object is locked, then the loan; return confirmations
 * that are due are made first, so a receipt that took effect still ends it
 * as returned. Only a loan whose handover or return is unsettled can end so
 * ({@link unresolvedEndable}); its reservation is released, and what was
 * open on it (proposals, transfers, waiting confirmations) lapses with it
 * in the database. Ending it again returns the same ending.
 *
 * Who may end a loan this way, and after what clarification, is not decided
 * (OD-0017). Until it is, only its own process may run it, and nothing in
 * the product does.
 */
export const endLoanUnresolved = defineCommand({
  name: "loan.end_unresolved",
  input: loanReferenceSchema,
  output: loanUnresolvedResultSchema,
  policy: endLoanUnresolvedPolicy,
  idempotency: "none",
  load: async ({ tx, input }) => loadLockedLoan(tx, input.loanId),
  execute: async ({ tx, resource, events, now }) => {
    const { loan } = await settleDueReturns(tx, resource.loan, now, events);

    if (loan.ending?.reason === "unresolved") {
      return unresolvedResult(loan);
    }

    const handover = handoverVerdict(
      await loadHandoverReading(tx, loan.id),
      now,
    );

    if (
      loan.objectId === null ||
      !unresolvedEndable(
        { status: loan.status, period: loan.agreement.period, handover },
        calendarDate(now),
      )
    ) {
      conflict("The loan's handover or return is not unsettled");
    }

    await endLoan(tx, {
      loanId: loan.id,
      from: unsettledStatuses,
      reason: "unresolved",
      endedByUserId: null,
      now,
    });
    events.record(loanEndedUnresolved, {
      resourceId: loan.id,
      payload: {
        objectId: loan.objectId,
        otherLoanIds: await otherCommittedLoans(tx, loan.objectId, loan.id),
      },
    });

    return { loanId: loan.id, endedAt: now.toISOString() };
  },
});

/**
 * PS-LOAN-019: after its loan ended unresolved, a current owner of the
 * object confirms having it back in their control, so the object may take
 * new loans again (unless something else blocks it). The object is locked
 * first, then the loan, so the confirmation and new approvals of the object
 * run one after another. The first owner's confirmation counts; confirming
 * again returns it. The borrower never confirms, and a loan that did not
 * end unresolved needs no confirmation.
 */
export const confirmLoanControl = defineCommand({
  name: "loan.confirm_control",
  input: loanReferenceSchema,
  output: loanControlResultSchema,
  policy: confirmLoanControlPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const loaded = await loadLoan(tx, input.loanId, { lock: true });

    return (
      loaded && {
        resource: {
          ...loaded,
          ownerIds: loaded.object?.ownerIds ?? [],
          endedUnresolved: loaded.loan.ending?.reason === "unresolved",
        },
        context: undefined,
      }
    );
  },
  execute: async ({
    tx,
    actor,
    resource,
    events,
    now,
  }): Promise<LoanControlResult> => {
    const { loan } = resource;

    if (!resource.endedUnresolved || loan.objectId === null) {
      conflict("The loan did not end unresolved");
    }

    const confirmed = await findControlConfirmation(tx, loan.id);

    if (confirmed) {
      return { loanId: loan.id, confirmedAt: confirmed.toISOString() };
    }

    await tx
      .insertInto("app.loan_control_confirmations")
      .values({
        loan_id: loan.id,
        confirmed_by_user_id: actingUserId(actor),
        confirmed_at: now,
      })
      .execute();
    events.record(loanControlConfirmed, {
      resourceId: loan.id,
      payload: { objectId: loan.objectId },
    });

    return { loanId: loan.id, confirmedAt: now.toISOString() };
  },
});

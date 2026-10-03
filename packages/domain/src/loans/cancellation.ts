import {
  cancelLoanSchema,
  type LoanCancellationResult,
  loanCancellationResultSchema,
} from "@lanbort/contracts";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import { calendarDate } from "../objects/availability";
import { actingUserId } from "../objects/state";
import { loanCancelled } from "./events";
import { beforeHandover } from "./model";
import { cancelLoanPolicy, partyRole } from "./policies";
import { loadLockedLoan } from "./resources";
import { cancelReservedLoan, type LoanRecord } from "./reservations";

function conflict(message: string, fields: readonly string[] = []): never {
  throw new DomainError("conflict", message, fields);
}

/** The cancelled loan, with the side of the party who cancelled it. */
function cancellationResult(
  loan: LoanRecord,
  cancelledByUserId: string,
): LoanCancellationResult {
  const endedBy = partyRole(loan, cancelledByUserId);

  if (endedBy === null) {
    throw new Error("A loan cancelled by someone who is not a party");
  }

  return { loanId: loan.id, status: "ended", endReason: "cancelled", endedBy };
}

/**
 * PS-LOAN-011: the borrower or the responsible lender ends a reserved loan
 * on their own, before the handover, in one transaction
 * (docs/architecture/05):
 * 1. the object is locked, then the loan, so a cancellation, an agreed
 *    change and approvals of the object run one after another;
 * 2. the loan is still reserved and its handover day is not over
 *    (`beforeHandover`): after that, a loan that was not handed over is the
 *    handover clarification's (PS-LOAN-012, WP-33), never a cancellation;
 * 3. the loan ends as cancelled by the caller and its reservation is
 *    released, so the period is available again; an open proposal lapses
 *    with it (database);
 * 4. the agreement versions, the approved request and earlier events stay.
 * No reason is needed and the other party's consent is not asked. Nothing
 * else is checked either: a friendship, membership or block that is gone
 * never stops a party from ending the loan, and other co-owners are not
 * parties (`cancelLoanPolicy`). A cancelled loan stays cancelled: retries,
 * and the other party cancelling at the same moment, get the same answer,
 * saying who was first.
 */
export const cancelLoan = defineCommand({
  name: "loan.cancel",
  input: cancelLoanSchema,
  output: loanCancellationResultSchema,
  policy: cancelLoanPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedLoan(tx, input.loanId),
  execute: async ({ tx, actor, resource, events, now }) => {
    const { loan } = resource;

    if (loan.status !== "reserved") {
      if (loan.ending?.reason === "cancelled" && loan.ending.endedByUserId) {
        return cancellationResult(loan, loan.ending.endedByUserId);
      }

      conflict("The loan has ended");
    }

    if (!beforeHandover(loan.agreement.period, calendarDate(now))) {
      conflict("The handover day has passed", ["handover"]);
    }

    if (loan.objectId === null) {
      throw new Error("A reserved loan without its object");
    }

    const userId = actingUserId(actor);
    await cancelReservedLoan(tx, { loanId: loan.id, userId, now });

    const result = cancellationResult(loan, userId);
    events.record(loanCancelled, {
      resourceId: loan.id,
      payload: { objectId: loan.objectId, role: result.endedBy },
    });

    return result;
  },
});

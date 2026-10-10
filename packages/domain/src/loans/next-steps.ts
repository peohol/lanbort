import {
  handoverOutcomeSchema,
  type LoanActions,
  type LoanRequestRole,
  type ReturnOutcome,
} from "@lanbort/contracts";
import { takesNewActivity } from "../account/model";
import type { UserActor } from "../actor";
import { calendarDate } from "../objects/availability";
import {
  beforeHandover,
  type HandoverReading,
  handoverRefusal,
  periodChangeable,
  type LoanPeriodInterval,
  repeatsLastStatement,
  returnRefusal,
  type ReturnStatement,
  type StoredLoanStatus,
} from "./model";

/** Each side's own return statements (PS-LOAN-014–015). */
const sideOutcomes: Record<LoanRequestRole, readonly ReturnOutcome[]> = {
  borrower: ["returned", "still_has"],
  lender: ["received", "not_received"],
};

/** A loan as far as deciding what its parties may do now needs it. */
export interface LoanSteps {
  readonly status: StoredLoanStatus;
  readonly endReason: string | null;
  readonly period: LoanPeriodInterval;
  readonly handover: HandoverReading;
  /** The return statements on the current agreement, in order. */
  readonly returns: readonly ReturnStatement[];
  /** The confirmations of either side still in their undo buffer. */
  readonly pending: readonly {
    readonly userId: string;
    readonly role: LoanRequestRole;
    readonly effectiveAt: Date;
  }[];
  /** The open proposal, and whether accepting it would succeed now. */
  readonly amendment: {
    readonly proposerRole: LoanRequestRole;
    readonly acceptable: boolean;
  } | null;
  readonly transfer: {
    readonly kind: "voluntary" | "takeover";
    readonly fromUserId: string;
    readonly needsBorrowerConsent: boolean;
    readonly borrowerConsentedAt: Date | null;
  } | null;
  /** Ended unresolved and not confirmed back yet (PS-LOAN-019). */
  readonly awaitingControl: boolean;
  /** The responsible lender is a current owner of the object. */
  readonly lenderOwns: boolean;
  /** The object still exists, so its agreement can change. */
  readonly hasObject: boolean;
  /** The object's owners other than the parties, with their names. */
  readonly coOwners: readonly {
    readonly userId: string;
    readonly realName: string;
  }[];
  /**
   * The loan came through an environment and its handover or return is in
   * question now (`mediationOffered`), and no mediation of it is open.
   */
  readonly mediationAvailable: boolean;
}

/**
 * The answers the caller may give: an account that is not active may only
 * say no (PS-ADM-002), and nobody is offered an acceptance that would fail.
 */
const answers = (actor: UserActor, acceptable = true) =>
  takesNewActivity(actor.accountStatus) && acceptable
    ? (["accept", "decline"] as const)
    : (["decline"] as const);

/**
 * UX-INT-001: what `role`, the caller, may do about the loan now. The same
 * rules the commands apply decide it ({@link handoverRefusal},
 * {@link returnRefusal}), so only steps that would be accepted are offered;
 * saying again what one said last changes nothing and is not offered. The
 * commands decide again when they run, under their locks.
 */
export function loanActions(
  actor: UserActor,
  role: LoanRequestRole,
  loan: LoanSteps,
  now: Date,
): LoanActions {
  const today = calendarDate(now);
  // A confirmation whose undo time is over counts as made, even before a
  // job or the next command has recorded it, so it can no longer be undone.
  const ownPending = loan.pending.some(
    ({ userId, effectiveAt }) => userId === actor.userId && effectiveAt > now,
  );
  // One confirmation per side waits at a time, whoever on it made it.
  const sidePending = loan.pending.some((pending) => pending.role === role);
  const transfer = loan.transfer;

  return {
    handover: handoverOutcomeSchema.options.filter(
      (outcome) =>
        loan.handover[role]?.outcome !== outcome &&
        handoverRefusal(
          loan.status,
          loan.period,
          loan.handover,
          loan.returns,
          role,
          outcome,
          today,
        ) === null,
    ),
    // A statement needs the object: once it is deleted, an ended loan's
    // return can no longer be reopened.
    return:
      sidePending || !loan.hasObject
        ? []
        : sideOutcomes[role].filter(
            (outcome) =>
              !repeatsLastStatement(loan.returns, role, outcome) &&
              returnRefusal(loan, loan.returns, outcome, today) === null,
          ),
    undoReturn: ownPending,
    amendment:
      loan.amendment && loan.amendment.proposerRole !== role
        ? [...answers(actor, loan.amendment.acceptable)]
        : [],
    responsibility:
      role === "borrower" &&
      transfer?.needsBorrowerConsent &&
      transfer.borrowerConsentedAt === null
        ? [...answers(actor)]
        : [],
    confirmControl:
      role === "lender" && loan.awaitingControl && loan.lenderOwns,
    proposeAmendment:
      takesNewActivity(actor.accountStatus) &&
      loan.hasObject &&
      loan.amendment === null &&
      periodChangeable(loan.status)
        ? loan.status === "reserved"
          ? "period"
          : "return_day"
        : null,
    withdrawAmendment: loan.amendment?.proposerRole === role,
    cancel:
      loan.status === "reserved" &&
      loan.hasObject &&
      beforeHandover(loan.period, today),
    offerResponsibility:
      role === "lender" && loan.status !== "ended" && transfer === null
        ? [...loan.coOwners]
        : [],
    withdrawResponsibility:
      transfer?.kind === "voluntary" && transfer.fromUserId === actor.userId,
    requestMediation: loan.mediationAvailable,
  };
}

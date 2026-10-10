import type {
  DesiredEnd,
  DesiredStart,
  HandoverOutcome,
  LoanPeriod,
  LoanRequestEndReason,
  LoanRequestRole,
  LoanRequestStatus,
  LoanStatus,
  ReturnOutcome,
} from "@lanbort/contracts";
import type { HistoryPosition } from "../environment/privacy";
import { DomainError } from "../errors";
import {
  addDays,
  type DateInterval,
  subtractIntervals,
} from "../objects/availability";

/**
 * Pure rules of loan requests (WP-30, PS-LOAN-001–005) and of the period an
 * approval reserves (WP-31, PS-LOAN-006/007). A request is the same whether
 * it came through an environment or directly between friends; only its
 * origin differs.
 */

/** An open request can still become a loan (stored statuses). */
export const openLoanRequestStatuses = [
  "requested",
  "awaiting_terms_confirmation",
] as const;

export type OpenLoanRequestStatus = (typeof openLoanRequestStatuses)[number];

/** `approved` and `ended` are final: the request never changes again. */
export type StoredLoanRequestStatus =
  OpenLoanRequestStatus | "approved" | "ended";

export type LoanRequestOriginKind = "environment" | "direct";

export interface LoanRequestRecord {
  readonly id: string;
  /** Null once the object is deleted; the request has ended then. */
  readonly objectId: string | null;
  readonly borrowerUserId: string;
  readonly origin: LoanRequestOriginKind;
  /** Set for an environment request, with the publication it builds on. */
  readonly environmentId: string | null;
  readonly publicationId: string | null;
  /** Where it was made in the environment's history (PS-ENV-009). */
  readonly position: HistoryPosition | null;
  readonly start: DesiredStart;
  readonly end: DesiredEnd;
  /** Optional (PS-LOAN-004); null when the borrower wrote none. */
  readonly message: string | null;
  /** The object version whose terms the borrower confirmed (PS-LOAN-005). */
  readonly termsVersion: number | null;
  /** The owners when the object was deleted; null while it exists. */
  readonly formerOwnerIds: readonly string[] | null;
  readonly status: StoredLoanRequestStatus;
  readonly endReason: LoanRequestEndReason | null;
  readonly endedByUserId: string | null;
  readonly createdAt: Date;
  readonly statusChangedAt: Date;
}

export function isOpen(status: StoredLoanRequestStatus): boolean {
  return (openLoanRequestStatuses as readonly string[]).includes(status);
}

/**
 * Whether the access a request builds on still holds now (PS-LOAN-002):
 * - `open`: it may proceed.
 * - `on_hold`: the environment holds it for now (its publication waits for
 *   approval, or the environment is winding down and may still cancel).
 * - `ended`: the access is gone, so the request ends neutrally.
 */
export type LoanRequestStanding =
  | { readonly kind: "open" }
  | { readonly kind: "on_hold" }
  | { readonly kind: "ended"; readonly reason: LoanRequestEndReason };

export const openStanding: LoanRequestStanding = Object.freeze({
  kind: "open",
});

export const endedStanding = (
  reason: LoanRequestEndReason,
): LoanRequestStanding => ({ kind: "ended", reason });

/**
 * The status shown for a request: what is stored, with what its standing
 * says now. Access that is already gone counts at once, even before the
 * database has recorded it (an expired transition period, for example).
 * The borrower's own step comes before an environment's hold.
 */
export function presentedStatus(
  request: Pick<LoanRequestRecord, "status" | "endReason">,
  standing: LoanRequestStanding,
): { status: LoanRequestStatus; endReason: LoanRequestEndReason | null } {
  if (!isOpen(request.status)) {
    return { status: request.status, endReason: request.endReason };
  }

  if (standing.kind === "ended") {
    return { status: "ended", endReason: standing.reason };
  }

  if (request.status === "awaiting_terms_confirmation") {
    return { status: request.status, endReason: null };
  }

  return {
    status: standing.kind === "on_hold" ? "on_hold" : "requested",
    endReason: null,
  };
}

/**
 * PS-LOAN-004 as of `today`: a start date is not in the past, and the last
 * day is not before the start (or before today, as soon as possible).
 */
export function validateDesiredPeriod(
  start: DesiredStart,
  end: DesiredEnd,
  today: string,
): void {
  if (start.kind === "date" && start.date < today) {
    throw new DomainError("invalid_input", "The start has passed", ["start"]);
  }

  if (
    end.kind === "date" &&
    end.date < (start.kind === "date" ? start.date : today)
  ) {
    throw new DomainError("invalid_input", "The end is before the start", [
      "end",
    ]);
  }
}

/**
 * PS-LOAN-004: the earliest period, `[from, until)`, that fits entirely in
 * one interval of the object's actual availability as of `today`, or null if
 * none does. A dated start fixes the period. «As soon as possible» begins on
 * the first available day from which the whole duration, or every day up to
 * the desired last day, is available without a break. Approval reserves
 * exactly this period (PS-LOAN-006).
 */
export function earliestPeriod(
  start: DesiredStart,
  end: DesiredEnd,
  effective: readonly DateInterval[],
  today: string,
): LoanPeriodInterval | null {
  const candidates =
    start.kind === "date"
      ? [start.date]
      : effective.flatMap((interval) =>
          interval.from === null
            ? []
            : [interval.from < today ? today : interval.from],
        );

  for (const from of candidates) {
    const period = periodFrom(from, end);

    if (period.from < period.until && withinAvailability(period, effective)) {
      return period;
    }
  }

  return null;
}

/** A loan period: calendar dates, `[from, until)`, always bounded. */
export interface LoanPeriodInterval {
  readonly from: string;
  readonly until: string;
}

/** The period that starts on `from` and ends as asked. */
function periodFrom(from: string, end: DesiredEnd): LoanPeriodInterval {
  return {
    from,
    until: end.kind === "date" ? addDays(end.date, 1) : addDays(from, end.days),
  };
}

/** Whether `period` lies within one interval of actual availability. */
export function withinAvailability(
  period: LoanPeriodInterval,
  effective: readonly DateInterval[],
): boolean {
  return effective.some(
    (interval) =>
      interval.from !== null &&
      interval.from <= period.from &&
      (interval.until === null || period.until <= interval.until),
  );
}

/**
 * PS-LOAN-007: the open requests that collide with a period just reserved,
 * given the actual availability before it. A request with a start date
 * collides when its period overlaps the reservation. «As soon as possible»
 * has no fixed period, so it collides when it fitted before and no longer
 * fits anywhere because of the reservation; if it still fits later, it
 * stays open. Requests that do not collide stay open as they are.
 */
export function collidingRequests<
  R extends Pick<LoanRequestRecord, "start" | "end">,
>(
  requests: readonly R[],
  reserved: LoanPeriodInterval,
  effectiveBefore: readonly DateInterval[],
  today: string,
): R[] {
  const effectiveAfter = subtractIntervals(effectiveBefore, [reserved]);

  return requests.filter((request) =>
    request.start.kind === "date"
      ? overlaps(periodFrom(request.start.date, request.end), reserved)
      : earliestPeriod(request.start, request.end, effectiveBefore, today) !==
          null &&
        earliestPeriod(request.start, request.end, effectiveAfter, today) ===
          null,
  );
}

function overlaps(a: LoanPeriodInterval, b: LoanPeriodInterval): boolean {
  return a.from < b.until && b.from < a.until;
}

/** The API form of a period, with its last day inclusive. */
export function toApiPeriod(period: LoanPeriodInterval): LoanPeriod {
  return { start: period.from, end: addDays(period.until, -1) };
}

/** The internal form of an API period. */
export function fromApiPeriod(period: LoanPeriod): LoanPeriodInterval {
  return { from: period.start, until: addDays(period.end, 1) };
}

export function samePeriod(
  a: LoanPeriodInterval,
  b: LoanPeriodInterval,
): boolean {
  return a.from === b.from && a.until === b.until;
}

/**
 * PS-LOAN-011: a reserved loan is before its handover until the agreed
 * handover day (the period's first day) is over. Until then either party
 * may cancel it. After it, a loan that was not handed over is a matter for
 * the handover clarification (PS-LOAN-012), never a cancellation: the
 * parties say what happened, or agree a new handover day.
 */
export function beforeHandover(
  period: LoanPeriodInterval,
  today: string,
): boolean {
  return today <= period.from;
}

/**
 * The statuses a loan is stored with. «Awaiting handover clarification» is
 * never stored: it is a reserved loan whose handover day is over
 * ({@link presentedLoanStatus}), so it needs no job to begin, and an agreed
 * new handover day ends it by itself. Likewise an active loan whose return
 * day is over is shown as awaiting return clarification. A disputed return
 * (`return_disputed`) is shown as `disputed`, like a disputed handover.
 */
export type StoredLoanStatus =
  Exclude<LoanStatus, "awaiting_handover"> | "return_disputed";

/**
 * The statuses of a loan that was handed over and has not ended: the
 * return statements decide among them (PS-LOAN-014–017).
 */
export const returnPhaseStatuses = [
  "active",
  "awaiting_return",
  "late",
  "return_disputed",
] as const satisfies readonly StoredLoanStatus[];

export function inReturnPhase(status: StoredLoanStatus): boolean {
  return (returnPhaseStatuses as readonly string[]).includes(status);
}

/**
 * Whether the agreed period can still change (PS-LOAN-010): a reserved
 * loan's handover and return day, and an active or late loan's return day
 * (extension, vision «Når returtidspunktet passeres»). An unsettled or
 * disputed return is settled first.
 */
export function periodChangeable(status: StoredLoanStatus): boolean {
  return status === "reserved" || status === "active" || status === "late";
}

/**
 * Why a loan in `status` can no longer be cancelled or have its agreement
 * changed: it has ended, it is past its handover (cancelling), or its
 * handover or return is not settled (changing).
 */
export function notReservedReason(status: StoredLoanStatus): string {
  switch (status) {
    case "ended":
      return "The loan has ended";
    case "active":
    case "late":
      return "The loan is past its handover";
    default:
      return "The loan is not settled";
  }
}

/** PS-LOAN-012/014: the status shown for a loan as of `today`. */
export function presentedLoanStatus(
  status: StoredLoanStatus,
  period: LoanPeriodInterval,
  today: string,
): LoanStatus {
  switch (status) {
    case "reserved":
      return beforeHandover(period, today) ? status : "awaiting_handover";
    case "active":
      return returnDayOver(period, today) ? "awaiting_return" : status;
    case "return_disputed":
      return "disputed";
    default:
      return status;
  }
}

/**
 * PS-LOAN-014: the agreed return day (the period's last day) is over. Only
 * then is a loan awaiting return clarification by itself, and only then can
 * the borrower say they still have it.
 */
export function returnDayOver(
  period: LoanPeriodInterval,
  today: string,
): boolean {
  return today >= period.until;
}

/**
 * PS-LOAN-012, pilot standard: how long the other party has to answer a
 * statement that the object was not handed over before it alone can end
 * the loan as not completed. Silence only lets the deadline pass; it is
 * never taken as the silent party's fault.
 */
export const handoverAnswerHours = 72;

export function handoverAnswerDue(reportedAt: Date): Date {
  return new Date(reportedAt.getTime() + handoverAnswerHours * 60 * 60 * 1000);
}

/** A party's statement about the handover of the current agreement. */
export interface HandoverStatement {
  readonly outcome: HandoverOutcome;
  readonly reportedAt: Date;
  /** When the other side's time to answer ends; «not handed over» only. */
  readonly answerDueAt: Date | null;
}

/** The latest statement of each side on the current agreement. */
export type HandoverReading = Readonly<
  Record<LoanRequestRole, HandoverStatement | null>
>;

export const noHandoverStatements: HandoverReading = Object.freeze({
  borrower: null,
  lender: null,
});

/**
 * What the parties' current statements say as of `now` (PS-LOAN-012–013;
 * the database's `app.loan_handover_verdict` is the same rule):
 * - `none`: nobody has said anything.
 * - `handed_over`: it was handed over, and nobody says otherwise.
 * - `disputed`: one says it was handed over, the other that it was not.
 * - `not_handed_over`: both say it was not.
 * - `awaiting_answer`: one says it was not; the other may still answer.
 * - `unanswered`: one says it was not, and the other did not answer in time.
 */
export type HandoverVerdict =
  | "none"
  | "handed_over"
  | "disputed"
  | "not_handed_over"
  | "awaiting_answer"
  | "unanswered";

export function handoverVerdict(
  reading: HandoverReading,
  now: Date,
): HandoverVerdict {
  const statements = [reading.borrower, reading.lender].filter(
    (statement) => statement !== null,
  );

  if (statements.length === 0) {
    return "none";
  }

  if (statements.every(({ outcome }) => outcome === "handed_over")) {
    return "handed_over";
  }

  if (statements.some(({ outcome }) => outcome === "handed_over")) {
    return "disputed";
  }

  if (statements.length === 2) {
    return "not_handed_over";
  }

  const due = statements[0]?.answerDueAt;

  return due && due.getTime() <= now.getTime()
    ? "unanswered"
    : "awaiting_answer";
}

/**
 * The stored status a verdict leads to: handed over, where the return
 * statements on the agreement (`returned`) put it, so active when nobody has
 * said anything about the return; disputed while the parties disagree
 * (PS-LOAN-013), ended as not completed when both say it was not handed
 * over or the other side let the deadline pass, and reserved for as long as
 * nothing is settled.
 */
export function statusAfterHandover(
  verdict: HandoverVerdict,
  returned: ReturnVerdict,
): StoredLoanStatus {
  switch (verdict) {
    case "handed_over":
      return statusAfterReturn(returned);
    case "disputed":
      return "disputed";
    case "not_handed_over":
    case "unanswered":
      return "ended";
    case "none":
    case "awaiting_answer":
      return "reserved";
  }
}

/**
 * Why `role` may not say `outcome` now, or null if they may
 * (PS-LOAN-012–013). The caller has returned already if it is what they
 * said last.
 * - A reserved loan is handed over from its handover day on, never before
 *   (the period would have to change first); «not handed over» belongs to
 *   the clarification after the handover day, before it the parties cancel.
 * - Once it is active, only the side that has not spoken may still
 *   contradict it; the side that said it was handed over cannot take that
 *   back on its own.
 * - Once the return is under way, that side may still say it was not
 *   handed over, as long as it has said nothing about the return either
 *   (PS-LOAN-022); a disputed return has been spoken to by both.
 * - While it is disputed, either side may change what they say.
 */
export function handoverRefusal(
  status: StoredLoanStatus,
  period: LoanPeriodInterval,
  reading: HandoverReading,
  returns: readonly Pick<ReturnStatement, "role">[],
  role: LoanRequestRole,
  outcome: HandoverOutcome,
  today: string,
): { readonly message: string; readonly fields: readonly string[] } | null {
  const silent =
    reading[role] === null &&
    !returns.some((statement) => statement.role === role);
  const settled = { message: "The handover is settled", fields: ["outcome"] };

  switch (status) {
    case "ended":
      return { message: "The loan has ended", fields: [] };
    case "reserved":
      if (today < period.from) {
        return { message: "The handover day has not come", fields: [] };
      }

      return outcome === "not_handed_over" && beforeHandover(period, today)
        ? { message: "The handover day is not over", fields: ["outcome"] }
        : null;
    case "active":
      return silent ? null : settled;
    case "disputed":
      return null;
    case "awaiting_return":
    case "late":
      return silent && outcome === "not_handed_over" ? null : settled;
    case "return_disputed":
      return settled;
  }
}

/**
 * PS-LOAN-010, scenario 26: whether the agreed period can become `proposed`.
 * The days it keeps are the loan's own already; every day it adds must be
 * open (`open`: general availability minus every other block, the loan's
 * own excluded), so a change never reaches into another loan's reservation,
 * uncertain possession or a co-owner's restriction. Before the handover the
 * period cannot start in the past; after it, the handover day stays and only
 * the return day moves, to today or later (an extension may cover the days
 * the borrower has already kept the object).
 */
export function amendmentFits(
  status: StoredLoanStatus,
  current: LoanPeriodInterval,
  proposed: LoanPeriodInterval,
  open: readonly DateInterval[],
  today: string,
): boolean {
  const timely =
    status === "reserved"
      ? proposed.from >= today
      : proposed.from === current.from && proposed.until > today;

  return (
    timely &&
    // The pieces of a bounded period are bounded.
    (subtractIntervals([proposed], [current]) as LoanPeriodInterval[]).every(
      (added) => withinAvailability(added, open),
    )
  );
}

/**
 * PS-LOAN-016, pilot standard: how long a return confirmation waits before
 * it is made. Until then its party can undo it as if it was never sent, or
 * make it at once.
 */
export const returnUndoSeconds = 30;

export function returnEffectiveAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + returnUndoSeconds * 1000);
}

/** The return statements that wait for the undo buffer (PS-LOAN-016). */
export const returnConfirmations = [
  "returned",
  "received",
] as const satisfies readonly ReturnOutcome[];

export type ReturnConfirmation = (typeof returnConfirmations)[number];

export function isReturnConfirmation(
  outcome: ReturnOutcome,
): outcome is ReturnConfirmation {
  return (returnConfirmations as readonly string[]).includes(outcome);
}

/** The side that says `outcome`: each statement belongs to one side. */
export function returnSide(outcome: ReturnOutcome): LoanRequestRole {
  return outcome === "returned" || outcome === "still_has"
    ? "borrower"
    : "lender";
}

/** A statement about the return, in the order it was made. */
export interface ReturnStatement {
  readonly role: LoanRequestRole;
  readonly outcome: ReturnOutcome;
  readonly reportedAt: Date;
}

/**
 * What the return statements on the current agreement say (PS-LOAN-014–017;
 * the database's `app.loan_return_verdict` is the same rule), from all of
 * them in order:
 * - `received`: the lender's latest receipt, not contradicted since;
 * - `reopened`: a receipt that the lender (`not_received`) or the borrower
 *   (`still_has`) contradicted afterwards;
 * otherwise by the latest statement of each side:
 * - `disputed`: returned, and not received;
 * - `late`: the borrower still has it;
 * - `returned` / `not_received`: one side's word, not settled;
 * - `none`: nobody has said anything.
 */
export type ReturnVerdict =
  | "none"
  | "returned"
  | "not_received"
  | "late"
  | "disputed"
  | "received"
  | "reopened";

const contradictsReceipt = (outcome: ReturnOutcome) =>
  outcome === "still_has" || outcome === "not_received";

export function returnVerdict(
  statements: readonly ReturnStatement[],
): ReturnVerdict {
  const receipt = statements
    .map(({ outcome }) => outcome)
    .lastIndexOf("received");

  if (receipt >= 0) {
    return statements
      .slice(receipt + 1)
      .some(({ outcome }) => contradictsReceipt(outcome))
      ? "reopened"
      : "received";
  }

  const borrower = latestReturnStatement(statements, "borrower")?.outcome;
  const lender = latestReturnStatement(statements, "lender")?.outcome;

  if (borrower === "still_has") {
    return "late";
  }

  if (borrower === "returned") {
    return lender === "not_received" ? "disputed" : "returned";
  }

  return lender === "not_received" ? "not_received" : "none";
}

/** The latest statement of one side, if it has said anything. */
export function latestReturnStatement<S extends ReturnStatement>(
  statements: readonly S[],
  role: LoanRequestRole,
): S | null {
  return (
    [...statements].reverse().find((statement) => statement.role === role) ??
    null
  );
}

/**
 * The stored status a return verdict leads to: the lender's receipt ends the
 * loan as returned, at once, also before the return day (PS-LOAN-015/020);
 * one side's word leaves it awaiting clarification, the borrower who still
 * has it makes it late, and contradicting statements, or a receipt
 * contradicted later, make it disputed (PS-LOAN-017). A reopened loan stays
 * disputed until the lender confirms a receipt again.
 */
export function statusAfterReturn(verdict: ReturnVerdict): StoredLoanStatus {
  switch (verdict) {
    case "none":
      return "active";
    case "returned":
    case "not_received":
      return "awaiting_return";
    case "late":
      return "late";
    case "disputed":
    case "reopened":
      return "return_disputed";
    case "received":
      return "ended";
  }
}

/**
 * Why `role` may not say `outcome` now, or null if they may
 * (PS-LOAN-014–017). The caller has returned already if it repeats their
 * side's latest statement and nobody spoke since.
 * - Statements belong to a loan in its return phase, or contradict the
 *   receipt that ended it (`still_has`, `not_received`), which reopens it.
 * - The borrower can say they still have it only once the return day is
 *   over (before that, it is simply an active loan), or to contradict a
 *   receipt.
 * - The lender can say they have not received it once the return day is
 *   over, when the borrower says it was returned, or to contradict a
 *   receipt.
 */
export function returnRefusal(
  loan: {
    readonly status: StoredLoanStatus;
    readonly endReason: string | null;
    readonly period: LoanPeriodInterval;
  },
  statements: readonly ReturnStatement[],
  outcome: ReturnOutcome,
  today: string,
): { readonly message: string; readonly fields: readonly string[] } | null {
  const verdict = returnVerdict(statements);
  const againstReceipt =
    contradictsReceipt(outcome) &&
    (verdict === "received" || verdict === "reopened");

  if (loan.status === "ended") {
    return loan.endReason === "returned" && againstReceipt
      ? null
      : { message: "The loan has ended", fields: [] };
  }

  if (!inReturnPhase(loan.status)) {
    return { message: "The object has not been handed over", fields: [] };
  }

  const dayOver = returnDayOver(loan.period, today) || againstReceipt;

  switch (outcome) {
    case "still_has":
      return dayOver
        ? null
        : { message: "The return day is not over", fields: ["outcome"] };
    case "not_received":
      return dayOver ||
        latestReturnStatement(statements, "borrower")?.outcome === "returned"
        ? null
        : { message: "The return day is not over", fields: ["outcome"] };
    case "returned":
    case "received":
      return null;
  }
}

/**
 * Whether `role` saying `outcome` changes nothing: it is what their side
 * said last, and nobody has spoken since.
 */
export function repeatsLastStatement(
  statements: readonly ReturnStatement[],
  role: LoanRequestRole,
  outcome: ReturnOutcome,
): boolean {
  const last = statements.at(-1);

  return last?.role === role && last.outcome === outcome;
}

/**
 * PS-LOAN-018: whether a loan's handover or return is still unsettled, so
 * the loan could end as administratively unresolved: a reserved loan whose
 * handover day is over and about which nobody has said anything, a disputed
 * handover, an active loan whose return day is over, and a return that is
 * unsettled, late or disputed. A loan that ended, or is simply running, has
 * nothing to clarify, and neither has one whose «not handed over» waits for
 * its answer: that deadline settles it (PS-LOAN-012). Who may end a loan
 * so, and after what process, is not decided (OD-0017).
 */
export function unresolvedEndable(
  loan: {
    readonly status: StoredLoanStatus;
    readonly period: LoanPeriodInterval;
    readonly handover: HandoverVerdict;
  },
  today: string,
): boolean {
  const { status, period } = loan;

  switch (status) {
    case "reserved":
      return !beforeHandover(period, today) && loan.handover === "none";
    case "active":
      return returnDayOver(period, today);
    case "disputed":
    case "awaiting_return":
    case "late":
    case "return_disputed":
      return true;
    case "ended":
      return false;
  }
}

/**
 * Pilot standard (product spec 04, «Tidsfrister som pilotstandard»): how
 * long a return can wait for clarification before a clarification process
 * is offered. Silence still makes nobody late or at fault.
 */
export const returnClarificationDays = 7;

/**
 * Whether a loan through an environment may now go to mediation by the
 * environment's administrators (vision 05, «Konflikt om tilbakelevering»):
 * at once when the parties contradict each other about the handover or the
 * return, and once the return has waited {@link returnClarificationDays}
 * days for clarification: from the moment a party's word left it awaiting
 * clarification, or from the agreed return day when nobody said anything.
 * A late loan is not in question (the borrower says they still have it),
 * and neither is a loan before its return day.
 */
export function mediationOffered(
  loan: {
    readonly status: StoredLoanStatus;
    readonly statusChangedAt: Date;
    readonly period: LoanPeriodInterval;
  },
  now: Date,
  today: string,
): boolean {
  switch (loan.status) {
    case "disputed":
    case "return_disputed":
      return true;
    case "awaiting_return":
      return (
        now.getTime() - loan.statusChangedAt.getTime() >=
        returnClarificationDays * 86_400_000
      );
    case "active":
      return today >= addDays(loan.period.until, returnClarificationDays);
    default:
      return false;
  }
}

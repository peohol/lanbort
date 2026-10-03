import type {
  DesiredEnd,
  DesiredStart,
  HandoverOutcome,
  LoanPeriod,
  LoanRequestEndReason,
  LoanRequestRole,
  LoanRequestStatus,
  LoanStatus,
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
  readonly message: string;
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
 * new handover day ends it by itself.
 */
export type StoredLoanStatus = Exclude<LoanStatus, "awaiting_handover">;

/**
 * Why a loan in `status` can no longer be cancelled or have its agreement
 * changed like a reserved one: it has ended, or it is past the handover
 * (handed over, or disputed).
 */
export function notReservedReason(status: StoredLoanStatus): string {
  return status === "ended"
    ? "The loan has ended"
    : "The loan is past its handover";
}

/** PS-LOAN-012: the status shown for a loan as of `today`. */
export function presentedLoanStatus(
  status: StoredLoanStatus,
  period: LoanPeriodInterval,
  today: string,
): LoanStatus {
  return status === "reserved" && !beforeHandover(period, today)
    ? "awaiting_handover"
    : status;
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
 * The stored status a verdict leads to: active once handed over, disputed
 * while the parties disagree (PS-LOAN-013), ended as not completed when both
 * say it was not handed over or the other side let the deadline pass, and
 * reserved for as long as nothing is settled.
 */
export function statusAfterHandover(
  verdict: HandoverVerdict,
): StoredLoanStatus {
  switch (verdict) {
    case "handed_over":
      return "active";
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
 * - While it is disputed, either side may change what they say.
 */
export function handoverRefusal(
  status: StoredLoanStatus,
  period: LoanPeriodInterval,
  reading: HandoverReading,
  role: LoanRequestRole,
  outcome: HandoverOutcome,
  today: string,
): { readonly message: string; readonly fields: readonly string[] } | null {
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
      return reading[role] === null
        ? null
        : { message: "The handover is settled", fields: ["outcome"] };
    case "disputed":
      return null;
  }
}

/**
 * PS-LOAN-010, scenario 26: whether the agreed period can become `proposed`.
 * The days it keeps are the loan's own already; every day it adds must be
 * actually available (`effective`, which the loan's own reservation already
 * blocks), so a change never reaches into another loan's reservation or a
 * co-owner's restriction. It cannot start in the past.
 */
export function amendmentFits(
  current: LoanPeriodInterval,
  proposed: LoanPeriodInterval,
  effective: readonly DateInterval[],
  today: string,
): boolean {
  return (
    proposed.from >= today &&
    // The pieces of a bounded period are bounded.
    (subtractIntervals([proposed], [current]) as LoanPeriodInterval[]).every(
      (added) => withinAvailability(added, effective),
    )
  );
}

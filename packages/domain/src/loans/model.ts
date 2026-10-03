import type {
  DesiredEnd,
  DesiredStart,
  LoanPeriod,
  LoanRequestEndReason,
  LoanRequestStatus,
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
 * may cancel it, or propose and agree changes. After it, a loan that was not
 * handed over is a matter for the handover clarification (PS-LOAN-012,
 * WP-33), never a cancellation.
 */
export function beforeHandover(
  period: LoanPeriodInterval,
  today: string,
): boolean {
  return today <= period.from;
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

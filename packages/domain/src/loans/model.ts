import type {
  DesiredEnd,
  DesiredStart,
  LoanRequestEndReason,
  LoanRequestStatus,
} from "@lanbort/contracts";
import type { HistoryPosition } from "../environment/privacy";
import { DomainError } from "../errors";
import { addDays, type DateInterval } from "../objects/availability";

/**
 * Pure rules of loan requests (WP-30, PS-LOAN-001–005). A request is the
 * same whether it came through an environment or directly between friends;
 * only its origin differs. Approval and reservation are WP-31's.
 */

/** An open request can still become a loan (stored statuses). */
export const openLoanRequestStatuses = [
  "requested",
  "awaiting_terms_confirmation",
] as const;

export type OpenLoanRequestStatus = (typeof openLoanRequestStatuses)[number];

export type StoredLoanRequestStatus = OpenLoanRequestStatus | "ended";

export type LoanRequestOriginKind = "environment" | "direct";

export interface LoanRequestRecord {
  readonly id: string;
  readonly objectId: string;
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
  readonly termsVersion: number;
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
  if (request.status === "ended") {
    return { status: "ended", endReason: request.endReason };
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
 * The days a request asks for, `[from, until)`, as of `today`. «As soon as
 * possible» counts from today; WP-31 decides the period actually reserved.
 */
export function desiredPeriod(
  start: DesiredStart,
  end: DesiredEnd,
  today: string,
): DateInterval {
  const from = start.kind === "date" ? start.date : today;

  return {
    from,
    until: end.kind === "date" ? addDays(end.date, 1) : addDays(from, end.days),
  };
}

/** Whether `period` lies within one interval of actual availability. */
export function withinAvailability(
  period: DateInterval,
  effective: readonly DateInterval[],
): boolean {
  return effective.some(
    (interval) =>
      interval.from !== null &&
      period.from !== null &&
      interval.from <= period.from &&
      (interval.until === null ||
        (period.until !== null && period.until <= interval.until)),
  );
}

/**
 * PS-LOAN-004 against the object's actual availability: a dated request
 * must fit in it, and «as soon as possible» needs some available day ahead,
 * no later than a desired last day.
 */
export function fitsAvailability(
  start: DesiredStart,
  end: DesiredEnd,
  effective: readonly DateInterval[],
  today: string,
): boolean {
  if (start.kind === "date") {
    return withinAvailability(desiredPeriod(start, end, today), effective);
  }

  return effective.some(
    (interval) =>
      end.kind === "duration" ||
      (interval.from !== null && interval.from <= end.date),
  );
}

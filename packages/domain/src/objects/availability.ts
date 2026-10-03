import type { AvailabilityInterval } from "@lanbort/contracts";
import { DomainError } from "../errors";

/**
 * Availability arithmetic on calendar dates (PS-OBJ-003–005).
 *
 * Internally an interval is half-open, `[from, until)`, with ISO dates
 * (`YYYY-MM-DD`, which sort as strings). `null` means unbounded. The API uses
 * inclusive end dates instead, see {@link toApiInterval}.
 *
 * General availability is what the owners set. Actual availability is never
 * stored: it is always derived as general availability minus the blocks that
 * apply to the object, so no separate "available" status can disagree with it.
 */
export interface DateInterval {
  readonly from: string | null;
  readonly until: string | null;
}

/**
 * Why a period cannot be offered for new loans. Later phases add the sources:
 * an approved loan blocks its period globally (PS-OBJ-004), unresolved
 * physical possession blocks new colliding loans (PS-OBJ-005), and co-owner
 * restrictions or a co-owner block freeze limit new commitments (PS-OBJ-008,
 * PS-OBJ-009). Blocks only limit new loans; they never rewrite existing ones.
 */
export interface AvailabilityBlock {
  readonly period: DateInterval;
  /**
   * A block that holds only from this day on, such as an active loan whose
   * return day has passed (PS-LOAN-014). Blocks without it always hold.
   */
  readonly appliesFrom?: string;
  /** The loan the block comes from, so a loan's own blocks can be left out. */
  readonly loanId?: string;
}

/**
 * Calendar days follow the product's time zone, so "today" is the same date
 * for every user and server.
 */
export const productTimeZone = "Europe/Oslo";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: productTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date of `now` in the product's time zone. */
export function calendarDate(now: Date): string {
  return dateFormat.format(now);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];

  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function fromApiInterval(interval: AvailabilityInterval): DateInterval {
  return {
    from: interval.start,
    until: interval.end === null ? null : addDays(interval.end, 1),
  };
}

/** Only for intervals with a start, as all stored and derived ones have. */
export function toApiInterval(interval: DateInterval): AvailabilityInterval {
  if (interval.from === null) {
    throw new Error("An availability interval always has a start date");
  }

  return {
    start: interval.from,
    end: interval.until === null ? null : addDays(interval.until, -1),
  };
}

/** `a` ends before `b` starts; touching counts as before. */
function endsBefore(a: DateInterval, b: DateInterval): boolean {
  return a.until !== null && b.from !== null && a.until <= b.from;
}

function startOrder(a: DateInterval, b: DateInterval): number {
  if (a.from === b.from) return 0;
  if (a.from === null) return -1;
  if (b.from === null) return 1;
  return a.from < b.from ? -1 : 1;
}

function laterEnd(a: string | null, b: string | null): string | null {
  return a === null || b === null ? null : a > b ? a : b;
}

/** Sorted, with overlapping and touching intervals merged into one. */
export function mergeIntervals(
  intervals: readonly DateInterval[],
): DateInterval[] {
  const merged: DateInterval[] = [];

  for (const interval of [...intervals].sort(startOrder)) {
    const last = merged.at(-1);

    if (last && (last.until === null || (interval.from ?? "") <= last.until)) {
      merged[merged.length - 1] = {
        from: last.from,
        until: laterEnd(last.until, interval.until),
      };
    } else {
      merged.push(interval);
    }
  }

  return merged;
}

/**
 * Validates the owners' general availability and returns it in stored form.
 * Overlapping intervals are refused, since the owner would have entered the
 * same days twice; intervals that only touch are one logical space and are
 * merged (PS-OBJ-003). Errors name the offending entries, never values.
 */
export function normalizeAvailability(
  intervals: readonly AvailabilityInterval[],
): DateInterval[] {
  const entries = intervals.map((interval, index) => ({
    index,
    interval: fromApiInterval(interval),
  }));
  const sorted = [...entries].sort((a, b) =>
    startOrder(a.interval, b.interval),
  );
  const overlapping = new Set<number>();

  sorted.forEach((entry, position) => {
    for (const later of sorted.slice(position + 1)) {
      if (endsBefore(entry.interval, later.interval)) break;
      overlapping.add(entry.index).add(later.index);
    }
  });

  if (overlapping.size > 0) {
    throw new DomainError(
      "invalid_input",
      "Availability intervals overlap",
      [...overlapping].sort((a, b) => a - b).map((i) => `availability.${i}`),
    );
  }

  return mergeIntervals(entries.map((entry) => entry.interval));
}

/** `base` minus every interval in `removed`. Both may be unsorted. */
export function subtractIntervals(
  base: readonly DateInterval[],
  removed: readonly DateInterval[],
): DateInterval[] {
  let remaining = mergeIntervals(base);

  for (const cut of mergeIntervals(removed)) {
    remaining = remaining.flatMap((interval) => {
      if (endsBefore(interval, cut) || endsBefore(cut, interval)) {
        return [interval];
      }

      const pieces: DateInterval[] = [];

      if (startOrder(interval, cut) < 0) {
        pieces.push({ from: interval.from, until: cut.from });
      }

      if (
        cut.until !== null &&
        (interval.until === null || cut.until < interval.until)
      ) {
        pieces.push({ from: cut.until, until: interval.until });
      }

      return pieces;
    });
  }

  return remaining;
}

/** The parts of `intervals` on or after `date`. */
export function intervalsFrom(
  intervals: readonly DateInterval[],
  date: string,
): DateInterval[] {
  return subtractIntervals(intervals, [{ from: null, until: date }]);
}

export interface DerivedAvailability {
  /** Actual availability from today on. */
  readonly effective: DateInterval[];
  /**
   * General availability minus the blocks that hold today, also before
   * today: what an agreed loan period may cover (PS-LOAN-010).
   */
  readonly open: DateInterval[];
  /**
   * At least one future or current day is actually available. An object
   * without general availability can never be offered (PS-OBJ-002).
   */
  readonly availableForNewLoans: boolean;
}

/**
 * Actual availability of an object (PS-OBJ-001, PS-OBJ-003–005): its general
 * availability from `today`, minus every block. An archived object is not
 * offered at all. This is the only place the value is computed.
 */
export function deriveAvailability(input: {
  readonly status: "active" | "archived";
  readonly availability: readonly DateInterval[];
  readonly blocks: readonly AvailabilityBlock[];
  readonly today: string;
}): DerivedAvailability {
  const open =
    input.status === "archived"
      ? []
      : subtractIntervals(
          input.availability,
          input.blocks
            .filter(
              ({ appliesFrom }) =>
                appliesFrom === undefined || appliesFrom <= input.today,
            )
            .map((block) => block.period),
        );
  const effective = intervalsFrom(open, input.today);

  return { effective, open, availableForNewLoans: effective.length > 0 };
}

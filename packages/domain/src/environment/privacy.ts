import type { EnvironmentType, TypeChangeProcess } from "@lanbort/contracts";
import { DomainError } from "../errors";

/**
 * Environment types and historical privacy (WP-23, PS-ENV-007–010). Pure
 * rules over the environment's type history; the database keeps the history
 * and refuses weaker types that were not adopted by the members.
 */

/** Higher is more private. */
const privacyRank: Record<EnvironmentType, number> = {
  open: 0,
  closed: 1,
  hidden: 2,
};

export const isStricter = (to: EnvironmentType, from: EnvironmentType) =>
  privacyRank[to] > privacyRank[from];

/**
 * PS-ENV-008: closed → open gives every member a week to accept. For
 * hidden → closed the specification names no voting period (OD-0012), so
 * that vote cannot be started until one is decided. null means undecided.
 */
export const typeChangeDays = {
  consent: 7,
  vote: null,
} as const satisfies Record<TypeChangeProcess, number | null>;

export type TypeChange =
  | { readonly kind: "stricter" }
  | { readonly kind: "weaker"; readonly process: TypeChangeProcess };

/**
 * How a change between two types is made. A stricter type needs no
 * individual consent (PS-ENV-007). A weaker one needs the members
 * (PS-ENV-008), and hidden → open is never one step: it goes through closed.
 */
export function classifyTypeChange(
  from: EnvironmentType,
  to: EnvironmentType,
): TypeChange {
  if (from === to) {
    throw new DomainError("conflict", "The environment already has this type");
  }

  if (isStricter(to, from)) {
    return { kind: "stricter" };
  }

  if (from === "closed" && to === "open") {
    return { kind: "weaker", process: "consent" };
  }

  if (from === "hidden" && to === "closed") {
    return { kind: "weaker", process: "vote" };
  }

  throw new DomainError("conflict", "A hidden environment opens via closed");
}

/** The process a proposal between these types uses. */
export function processOf(
  from: EnvironmentType,
  to: EnvironmentType,
): TypeChangeProcess {
  const change = classifyTypeChange(from, to);

  if (change.kind !== "weaker") {
    throw new Error("Only a weaker type is proposed");
  }

  return change.process;
}

/**
 * PS-ENV-008: a vote passes with at least 2/3 of all active members for it.
 * Not voting is not support, and nobody to vote passes nothing.
 */
export const votePasses = (support: number, eligible: number) =>
  eligible > 0 && support * 3 >= eligible * 2;

/**
 * Where an event lies in the order of events (PS-ENV-009). The database
 * gives every event historical privacy compares (a type period, a
 * publication, an activation, a passivation) the next position as it writes
 * it, so the order is clear even when two events share a clock time.
 */
export type HistoryPosition = bigint;

/** A position as the database returns it. */
export const toPosition = (value: string | number | bigint): HistoryPosition =>
  BigInt(value);

/** The same for a position that may be missing. */
export const toOptionalPosition = (
  value: string | number | bigint | null,
): HistoryPosition | null => (value === null ? null : toPosition(value));

/** One period of the environment's type history, oldest first. */
export interface TypePeriod {
  readonly type: EnvironmentType;
  readonly position: HistoryPosition;
}

/** The type in force at `at`: the latest period that began before it. */
function typeAt(
  periods: readonly TypePeriod[],
  at: HistoryPosition,
): EnvironmentType {
  let type = periods[0]?.type ?? "hidden";

  for (const period of periods) {
    if (period.position > at) break;
    type = period.type;
  }

  return type;
}

/** The first period after `after` whose type is weaker than `context`. */
function firstWeakening(
  periods: readonly TypePeriod[],
  context: EnvironmentType,
  after: HistoryPosition,
): HistoryPosition | null {
  return (
    periods.find(
      (period) =>
        period.position > after &&
        privacyRank[period.type] < privacyRank[context],
    )?.position ?? null
  );
}

/**
 * Where historical privacy begins for something created at `created`
 * (PS-ENV-009): the first time afterwards the environment became less
 * private than it was then, or null if it never did.
 */
export const widenedAfterCreation = (
  periods: readonly TypePeriod[],
  created: HistoryPosition,
): HistoryPosition | null =>
  firstWeakening(periods, typeAt(periods, created), created);

/**
 * The same for a membership that became passive at `passive`: it keeps the
 * context the member last accepted. A member made passive by a weaker type
 * becomes passive just before the type changes, so that context is the
 * stricter one.
 */
export const widenedAfterPassivation = widenedAfterCreation;

/**
 * PS-ENV-009: whether something whose privacy widened at `widenedAt` may be
 * shown to a viewer. Without a later weakening the ordinary rules decide
 * alone. Otherwise only members active since before the weakening, who
 * belonged to the stricter context, may see it: never later members or
 * outsiders, whatever their role. `viewerActiveFrom` is where the viewer's
 * current active period began, null if they have none.
 */
export function mayExposeHistory(
  widenedAt: HistoryPosition | null,
  viewerActiveFrom: HistoryPosition | null,
): boolean {
  return (
    widenedAt === null ||
    (viewerActiveFrom !== null && viewerActiveFrom < widenedAt)
  );
}

/** Positions from `from` up to, not including, `until` (open if null). */
export interface PositionSpan {
  readonly from: HistoryPosition;
  readonly until: HistoryPosition | null;
}

/**
 * PS-ENV-009 for whole lists: the positions at which created things a viewer
 * may not see. Everything created in one period of the type history shares
 * its context, so `mayExposeHistory` decides per period, and lists that page
 * in the database filter on position instead of row by row.
 */
export function concealedSpans(
  periods: readonly TypePeriod[],
  viewerActiveFrom: HistoryPosition | null,
): PositionSpan[] {
  return periods.flatMap((period, index) =>
    mayExposeHistory(
      widenedAfterCreation(periods, period.position),
      viewerActiveFrom,
    )
      ? []
      : [
          {
            from: period.position,
            until: periods[index + 1]?.position ?? null,
          },
        ],
  );
}

/** Whether something created at `created` falls in a concealed span. */
export const isConcealed = (
  spans: readonly PositionSpan[],
  created: HistoryPosition,
) =>
  spans.some(
    (span) =>
      span.from <= created && (span.until === null || created < span.until),
  );

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
 * PS-ENV-008: closed → open gives every member a week to accept; for
 * hidden → closed the specification names no voting period, and the same
 * week is used until one is decided.
 */
export const typeChangeDays: Record<TypeChangeProcess, number> = {
  consent: 7,
  vote: 7,
};

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

/** One period of the environment's type history, oldest first. */
export interface TypePeriod {
  readonly type: EnvironmentType;
  readonly startedAt: Date;
}

/** The type in force at `at`; a period starting exactly then counts. */
function typeAt(periods: readonly TypePeriod[], at: Date): EnvironmentType {
  let type = periods[0]?.type ?? "hidden";

  for (const period of periods) {
    if (period.startedAt.getTime() > at.getTime()) break;
    type = period.type;
  }

  return type;
}

/** The first period from `from` on whose type is weaker than `context`. */
function firstWeakening(
  periods: readonly TypePeriod[],
  context: EnvironmentType,
  from: (period: TypePeriod) => boolean,
): Date | null {
  return (
    periods.find(
      (period) =>
        from(period) && privacyRank[period.type] < privacyRank[context],
    )?.startedAt ?? null
  );
}

/**
 * Where historical privacy begins for something created at `createdAt`
 * (PS-ENV-009): the first time afterwards the environment became less
 * private than it was then, or null if it never did.
 */
export function widenedAfterCreation(
  periods: readonly TypePeriod[],
  createdAt: Date,
): Date | null {
  return firstWeakening(
    periods,
    typeAt(periods, createdAt),
    (period) => period.startedAt.getTime() > createdAt.getTime(),
  );
}

/**
 * The same for a membership that became passive at `passiveSince`: it keeps
 * the context the member last accepted, which is the type in force just
 * before. A member made passive by a weaker type is passive from the very
 * moment the type changed.
 */
export function widenedAfterPassivation(
  periods: readonly TypePeriod[],
  passiveSince: Date,
): Date | null {
  const before = periods.filter(
    (period) => period.startedAt.getTime() < passiveSince.getTime(),
  );

  return firstWeakening(
    periods,
    typeAt(before, passiveSince),
    (period) => period.startedAt.getTime() >= passiveSince.getTime(),
  );
}

/**
 * PS-ENV-009: whether something whose privacy widened at `widenedAt` may be
 * shown to a viewer. Without a later weakening the ordinary rules decide
 * alone. Otherwise only members active since before the weakening, who
 * belonged to the stricter context, may see it: never later members or
 * outsiders, whatever their role. `viewerActiveSince` is the start of the
 * viewer's current active period, null if they have none.
 */
export function mayExposeHistory(
  widenedAt: Date | null,
  viewerActiveSince: Date | null,
): boolean {
  return (
    widenedAt === null ||
    (viewerActiveSince !== null &&
      viewerActiveSince.getTime() < widenedAt.getTime())
  );
}

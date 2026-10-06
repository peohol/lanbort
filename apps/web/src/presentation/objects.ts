import type { AvailabilityInterval, ObjectCategory } from "@lanbort/contracts";
import { formatDay } from "./dates";

/** What every view of a thing knows about whether it can be borrowed. */
interface Availability {
  readonly availableForNewLoans: boolean;
  readonly effectiveAvailability: readonly AvailabilityInterval[];
}

/**
 * Whether the thing can be borrowed now, or from when, in words. It never
 * says what blocks it: others get a neutral answer (UX-PRIV-004, UX-EXC-006).
 */
export function describeAvailability(
  object: Availability,
  today: string,
): string {
  const next = object.effectiveAvailability[0];

  if (!object.availableForNewLoans || !next) {
    return "Ikke ledig for nye lån nå";
  }

  return next.start > today ? `Ledig fra ${formatDay(next.start)}` : "Ledig nå";
}

/** One availability interval, open or bounded (PS-OBJ-003). */
export function formatInterval({ start, end }: AvailabilityInterval): string {
  if (end === null) return `Fra ${formatDay(start)}`;
  return start === end
    ? formatDay(start)
    : `${formatDay(start)} – ${formatDay(end)}`;
}

/** A category's name, or the id while the list does not have it. */
export function categoryLabel(
  categories: readonly ObjectCategory[],
  id: string,
): string {
  return categories.find((category) => category.id === id)?.label ?? id;
}

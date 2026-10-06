import type {
  AvailabilityInterval,
  LoanStatus,
  ObjectCategory,
  OwnObject,
} from "@lanbort/contracts";
import type { Tone } from "@/components/tag";
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

/** A loan in these states has the thing out of its owners' hands. */
export const lentOutStatuses: readonly LoanStatus[] = [
  "active",
  "awaiting_return",
  "late",
];

/** Whether `interval` holds on `day`. */
const holdsOn = ({ start, end }: AvailabilityInterval, day: string) =>
  start <= day && (end === null || day <= end);

/**
 * One of the user's own things in a list, in a word or two (WP-81): lent
 * out, blocked, can be lent out, or archived. `lentOut` comes from the
 * user's own loans; what blocks it is said only as far as every owner sees
 * it (PS-OBJ-007–009).
 */
export function ownThingStatus(
  object: Pick<
    OwnObject,
    | "status"
    | "availability"
    | "availableForNewLoans"
    | "frozenForNewLoans"
    | "restrictions"
  >,
  today: string,
  lentOut: boolean,
): { readonly label: string; readonly tone: Tone } {
  if (object.status === "archived")
    return { label: "Arkivert", tone: "neutral" };
  if (lentOut) return { label: "Utlånt", tone: "waiting" };

  const restricted = object.restrictions.some(
    ({ period }) => period === null || holdsOn(period, today),
  );

  if (object.frozenForNewLoans || restricted) {
    return { label: "Sperret for nye lån", tone: "warning" };
  }

  if (object.availableForNewLoans) {
    return { label: "Kan lånes ut", tone: "positive" };
  }

  return object.availability.every(({ end }) => end !== null && end < today)
    ? { label: "Mangler ledig tid", tone: "warning" }
    : { label: "Ikke ledig nå", tone: "neutral" };
}

import type {
  AvailabilityInterval,
  ObjectCategory,
  OwnObject,
  ShownOwner,
} from "@lanbort/contracts";
import type { Tone } from "@/components/tag";
import { formatDay } from "./dates";

/** What every view of a thing knows about whether it can be borrowed. */
interface Availability {
  readonly availableForNewLoans: boolean;
  readonly effectiveAvailability: readonly AvailabilityInterval[];
}

/**
 * Whether the thing can be borrowed now, or from when, in words and a tone.
 * It never says what blocks it: others get a neutral answer (UX-PRIV-004,
 * UX-EXC-006).
 */
export function availabilityStatus(
  object: Availability,
  today: string,
): { readonly label: string; readonly tone: Tone } {
  const next = object.effectiveAvailability[0];

  if (!object.availableForNewLoans || !next) {
    return { label: "Ikke ledig for nye lån nå", tone: "neutral" };
  }

  return next.start > today
    ? { label: `Ledig fra ${formatDay(next.start)}`, tone: "waiting" }
    : { label: "Ledig nå", tone: "positive" };
}

export const describeAvailability = (object: Availability, today: string) =>
  availabilityStatus(object, today).label;

/** One availability interval, open or bounded (PS-OBJ-003). */
export function formatInterval({ start, end }: AvailabilityInterval): string {
  if (end === null) return `Fra ${formatDay(start)}`;
  return start === end
    ? formatDay(start)
    : `${formatDay(start)} – ${formatDay(end)}`;
}

/**
 * When a thing can be lent, in one line: «Når som helst, fra 4. oktober»
 * for one open period that has begun (Tomat kjerneflyt 2), else its
 * periods. Empty when it has none.
 */
export function availabilityLine(
  intervals: readonly AvailabilityInterval[],
  today: string,
): string {
  const [only] = intervals;

  return intervals.length === 1 && only!.end === null && only!.start <= today
    ? `Når som helst, ${formatInterval(only!).toLowerCase()}`
    : intervals.map(formatInterval).join(", ");
}

/** A category's name, or the id while the list does not have it. */
export function categoryLabel(
  categories: readonly ObjectCategory[],
  id: string,
): string {
  return categories.find((category) => category.id === id)?.label ?? id;
}

/** Whether `interval` holds on `day`. */
const holdsOn = ({ start, end }: AvailabilityInterval, day: string) =>
  start <= day && (end === null || day <= end);

/**
 * One of the user's own things in a list, in a word or two (WP-81): lent
 * out, blocked, can be lent out, or archived. What blocks it is said only
 * as far as every owner sees it (PS-OBJ-007–009).
 */
export function ownThingStatus(
  object: Pick<
    OwnObject,
    | "status"
    | "availability"
    | "availableForNewLoans"
    | "frozenForNewLoans"
    | "restrictions"
    | "lentOut"
  >,
  today: string,
): { readonly label: string; readonly tone: Tone } {
  if (object.status === "archived")
    return { label: "Arkivert", tone: "neutral" };
  if (object.lentOut) return { label: "Utlånt", tone: "waiting" };

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

/** What goes before the item at `index` in a list said as «Anna, Bo og Cleo». */
export const listSeparator = (index: number, count: number) =>
  index === 0 ? "" : index === count - 1 ? " og " : ", ";

/** Words said as a list: «Lia», «Lia og Furu», «Lia, Furu og Nøste». */
export const sayList = (words: readonly string[]) =>
  words
    .map((word, index) => listSeparator(index, words.length) + word)
    .join("");

/** The heading for a thing's owners, one or several. */
export const ownersLabel = (owners: readonly ShownOwner[]) =>
  owners.length === 1 ? "Eier" : "Eiere";

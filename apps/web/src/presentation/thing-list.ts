import type { AvailabilityInterval, ObjectCategory } from "@lanbort/contracts";
import type { SearchParams } from "@/navigation/list-pages";
import { addDays } from "./dates";

/**
 * Lists of things to look through (UX-IA-021): grouped by category, each
 * group in alphanumeric order, and filtered by category and by when the
 * things are free. The filter lives in the address, so it survives the way
 * back from a thing and can be shared.
 */

/** A thing in a list: enough to group it, order it and filter it. */
export interface ListedThing {
  readonly title: string;
  readonly categoryId: string;
  readonly availableForNewLoans: boolean;
  readonly effectiveAvailability: readonly AvailabilityInterval[];
}

/** «Ledig snart»: free now or within this many days. */
export const availableSoonDays = 14;

/** The choices of when a thing is free; «Alle» is no choice. */
export const availabilityChoices = [
  { value: undefined, label: "Alle" },
  { value: "na", label: "Ledig nå" },
  { value: "snart", label: "Ledig snart" },
] as const;

export type AvailabilityChoice = NonNullable<
  (typeof availabilityChoices)[number]["value"]
>;

/** What a list is filtered by; nothing chosen shows everything. */
export interface ThingFilter {
  /** Only these categories; none means every category. */
  readonly categoryIds: readonly string[];
  readonly availability: AvailabilityChoice | undefined;
}

/** The address's names for the filter, apart from Finn's own `kategori`. */
const params = { categories: "kategorier", availability: "ledig" } as const;

/** The filter the address asks for. */
export function readThingFilter(query: SearchParams): ThingFilter {
  const availability = query[params.availability];

  return {
    categoryIds: [
      ...new Set([query[params.categories] ?? []].flat().filter(Boolean)),
    ],
    availability: availabilityChoices.find(
      (choice) => choice.value !== undefined && choice.value === availability,
    )?.value,
  };
}

/**
 * The address of `pathname` with the filter `filter`, keeping everything
 * else the address chose, such as a search.
 */
export function thingFilterHref(
  pathname: string,
  query: SearchParams,
  filter: ThingFilter,
): string {
  const search = new URLSearchParams();

  for (const [name, value] of Object.entries(query)) {
    if (name === params.categories || name === params.availability) continue;
    for (const each of [value ?? []].flat()) search.append(name, each);
  }

  for (const id of filter.categoryIds) search.append(params.categories, id);
  if (filter.availability) search.set(params.availability, filter.availability);

  const shown = search.toString();
  return shown ? `${pathname}?${shown}` : pathname;
}

/** The filter with `categoryId` chosen if it was not, and left out if it was. */
export const toggleCategory = (
  filter: ThingFilter,
  categoryId: string,
): ThingFilter => ({
  ...filter,
  categoryIds: filter.categoryIds.includes(categoryId)
    ? filter.categoryIds.filter((id) => id !== categoryId)
    : [...filter.categoryIds, categoryId],
});

/**
 * Whether the thing is free for a new loan by the choice: now, or now or
 * within {@link availableSoonDays} days. Like its status, this never says
 * what blocks it (UX-PRIV-004).
 */
export function freeBy(
  thing: Pick<ListedThing, "availableForNewLoans" | "effectiveAvailability">,
  choice: AvailabilityChoice | undefined,
  today: string,
): boolean {
  if (choice === undefined) return true;

  const next = thing.effectiveAvailability[0];
  if (!thing.availableForNewLoans || !next) return false;

  return (
    next.start <= (choice === "na" ? today : addDays(today, availableSoonDays))
  );
}

/**
 * The name as it is ordered: from its first letter or digit, so «"Ny" sag»
 * stands under N.
 */
const orderedName = (title: string) =>
  title.replace(/^[^\p{L}\p{N}]+/u, "") || title;

const collator = new Intl.Collator("nb", {
  numeric: true,
  sensitivity: "base",
});

/** Alphanumeric order of names, with «2» before «10» and «Å» after «Ø». */
export const byName = (a: { title: string }, b: { title: string }) =>
  collator.compare(orderedName(a.title), orderedName(b.title)) ||
  collator.compare(a.title, b.title);

/** Each category followed by those below it, as the list of categories orders them. */
export function orderedCategories(
  categories: readonly ObjectCategory[],
  parentId: string | null = null,
  depth = 0,
): { category: ObjectCategory; depth: number }[] {
  return categories
    .filter((category) => category.parentId === parentId)
    .flatMap((category) => [
      { category, depth },
      ...orderedCategories(categories, category.id, depth + 1),
    ]);
}

/** One category's things in a list. */
export interface ThingGroup<T> {
  /** The category's id; empty for things in a category no longer offered. */
  readonly id: string;
  readonly label: string;
  readonly things: readonly T[];
}

/**
 * The things by category, in the categories' own order and each in
 * alphanumeric order. A category without things is left out, and things in
 * a category no longer offered come last, together.
 */
export function groupByCategory<T extends ListedThing>(
  things: readonly T[],
  categories: readonly ObjectCategory[],
): ThingGroup<T>[] {
  const known = orderedCategories(categories).map(({ category }) => ({
    id: category.id,
    label: category.label,
  }));
  const ids = new Set(known.map(({ id }) => id));

  return [...known, { id: "", label: "Andre ting" }]
    .map((group) => ({
      ...group,
      things: things
        .filter((thing) =>
          group.id ? thing.categoryId === group.id : !ids.has(thing.categoryId),
        )
        .sort(byName),
    }))
    .filter((group) => group.things.length > 0);
}

/** The things the filter keeps. */
export function filterThings<T extends ListedThing>(
  things: readonly T[],
  filter: ThingFilter,
  today: string,
): T[] {
  return things.filter(
    (thing) =>
      (filter.categoryIds.length === 0 ||
        filter.categoryIds.includes(thing.categoryId)) &&
      freeBy(thing, filter.availability, today),
  );
}

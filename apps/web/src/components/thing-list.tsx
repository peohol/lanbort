import type { ObjectCategory } from "@lanbort/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  availabilityChoices,
  filterThings,
  groupByCategory,
  type ListedThing,
  type ThingFilter,
  toggleCategory,
} from "@/presentation/thing-list";
import { Icon } from "./icon";
import { ThingCards } from "./thing-card";
import styles from "./thing-list.module.css";

/** The filter a list is shown with, and the address of another one. */
export interface ThingListFilter {
  readonly chosen: ThingFilter;
  readonly href: (filter: ThingFilter) => string;
}

/**
 * Things grouped by category, with the category as the heading and each
 * group in alphanumeric order; a category without things is not shown
 * (UX-IA-021). With `filter`, the things can be narrowed to some categories
 * and to those free now or soon, by choices that are only offered when
 * they would change something.
 */
export function ThingList<T extends ListedThing>({
  things,
  categories,
  today,
  filter,
  card,
}: {
  things: readonly T[];
  categories: readonly ObjectCategory[];
  today: string;
  filter?: ThingListFilter;
  /** Each thing as a card, usually a `FoundThingCard`. */
  card: (thing: T) => ReactNode;
}) {
  const kept = filter ? filterThings(things, filter.chosen, today) : things;
  const groups = groupByCategory(kept, categories);

  return (
    <div className={styles.list}>
      {filter && (
        <ThingFilters
          things={things}
          categories={categories}
          today={today}
          filter={filter}
        />
      )}
      {groups.length === 0 && filter ? (
        <p className="quiet">
          Ingen ting passer med valgene.{" "}
          <Link
            href={filter.href({ categoryIds: [], availability: undefined })}
            scroll={false}
          >
            Vis alle
          </Link>
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.id} className={styles.group}>
            <h3>{group.label}</h3>
            <ThingCards>{group.things.map(card)}</ThingCards>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * «Alle», «Ledig nå» and «Ledig snart», and the categories the things are
 * in, each chosen or not. A row is left out while it would not narrow
 * anything: the things are all in one category, or all free alike.
 */
function ThingFilters<T extends ListedThing>({
  things,
  categories,
  today,
  filter: { chosen, href },
}: {
  things: readonly T[];
  categories: readonly ObjectCategory[];
  today: string;
  filter: ThingListFilter;
}) {
  const inCategories = filterThings(
    things,
    { ...chosen, availability: undefined },
    today,
  );
  const counts = availabilityChoices.map(
    ({ value }) =>
      filterThings(inCategories, { ...chosen, availability: value }, today)
        .length,
  );
  const byTime =
    chosen.availability !== undefined ||
    counts.some((count) => count !== counts[0]);
  const shown = groupByCategory(things, categories).filter(
    ({ id }) => id !== "",
  );
  const byCategory = shown.length > 1 || chosen.categoryIds.length > 0;

  if (!byTime && !byCategory) return null;

  return (
    <div className={styles.filters}>
      {byTime && (
        <nav aria-label="Når tingen er ledig" className="filters">
          {availabilityChoices.map(({ value, label }) => (
            <Link
              key={label}
              href={href({ ...chosen, availability: value })}
              scroll={false}
              aria-current={value === chosen.availability ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      {byCategory && (
        <nav aria-label="Kategorier" className="filters">
          {shown.map(({ id, label }) => {
            const on = chosen.categoryIds.includes(id);

            return (
              <Link
                key={id}
                href={href(toggleCategory(chosen, id))}
                scroll={false}
                aria-current={on ? "true" : undefined}
              >
                {on && <Icon name="check" />}
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

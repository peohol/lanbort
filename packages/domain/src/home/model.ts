import {
  type HomeItem,
  homeItemKinds,
  type HomeOverview,
  homeSections,
} from "@lanbort/contracts";

/** Earliest first; what has no time comes last. */
function byTime(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Orders Home (UX-IA-005): each item in its kind's section, the sections in
 * Home's order. Within a section, what must be done soonest comes first:
 * by deadline, then by the day it is about, then by name. The same kind of
 * item about the same thing is shown once, however many sources found it.
 */
export function arrangeHome(
  items: readonly HomeItem[],
): HomeOverview["sections"] {
  const seen = new Set<string>();
  const distinct = items.filter((item) => {
    const key = `${item.kind}/${item.target.type}/${item.target.id}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });

  return homeSections.map((section) => ({
    section,
    items: distinct
      .filter((item) => homeItemKinds[item.kind] === section)
      .sort(
        (a, b) =>
          byTime(a.dueAt, b.dueAt) ||
          byTime(a.day, b.day) ||
          (a.title ?? "").localeCompare(b.title ?? "", "nb") ||
          a.target.id.localeCompare(b.target.id),
      ),
  }));
}

import { type AreaId, areaById } from "./areas";

/**
 * The navigation stack (UX-IA-009–011): the area the user started in and
 * the details opened from there, in order. Pure rules here; the browser's
 * side is `components/navigation-stack.ts`.
 */

/** One detail in the stack: where it is and what its way back says. */
export interface StackEntry {
  readonly href: string;
  readonly label: string;
}

/** How the page the user is on was reached, besides moving in the stack. */
export type DirectEntry = "varsel" | "epost";

export interface Stack {
  readonly area: AreaId;
  /** The details after the area's own page; the last is the current one. */
  readonly entries: readonly StackEntry[];
  /** Set while the user is still where a direct entry led (UX-IA-011). */
  readonly via: DirectEntry | null;
}

/** What a page says about its place: the facts the rule builds from. */
export interface Place extends StackEntry {
  /** Its fixed home area (UX-IA-010). */
  readonly home: AreaId;
  /** A fixed container it lies in, such as a queue (UX-IA-011). */
  readonly container?: StackEntry | undefined;
}

/**
 * How the user came to a page: following something in the app (`push`),
 * the browser's back and forward or a reload (`history`), or from outside
 * the stack (`direct`: a notification, an e-mail, a shared link, a new tab).
 */
export type Arrival = "push" | "history" | "direct";

/** Two addresses are the same place when their paths are. */
export const samePlace = (a: string, b: string) =>
  a.split(/[?#]/)[0] === b.split(/[?#]/)[0];

/** UX-IA-011: the home area, a fixed container if any, and the target. */
export const ruleStack = (place: Place, via: DirectEntry | null): Stack => ({
  area: place.home,
  entries: [
    ...(place.container ? [place.container] : []),
    { href: place.href, label: place.label },
  ],
  via,
});

/** An area's own page starts its stack over (UX-IA-009). */
export const areaStack = (area: AreaId): Stack => ({
  area,
  entries: [],
  via: null,
});

/**
 * The stack once the user has arrived at `place`. Something already in the
 * stack is gone back to rather than opened again (UX-IA-009); following a
 * link adds to the stack the user is in; anything else builds the stack
 * from the rule, never from history (UX-IA-011).
 */
export function arrive(
  previous: Stack | null,
  place: Place,
  how: Arrival,
  via: DirectEntry | null = null,
): Stack {
  const entry = { href: place.href, label: place.label };

  if (how === "direct" || previous === null) return ruleStack(place, via);

  const index = previous.entries.findIndex(({ href }) =>
    samePlace(href, place.href),
  );

  if (index >= 0) {
    const current = index === previous.entries.length - 1;
    return {
      area: previous.area,
      entries: [...previous.entries.slice(0, index), entry],
      // Still on the page the entry led to, as after a reload.
      via: current ? previous.via : null,
    };
  }

  return how === "push"
    ? { area: previous.area, entries: [...previous.entries, entry], via: null }
    : ruleStack(place, null);
}

/** Whether `stack` is the stack of the page at `href`. */
export const isStackOf = (stack: Stack | null, href: string) =>
  stack !== null &&
  stack.entries.length > 0 &&
  samePlace(stack.entries.at(-1)!.href, href);

/**
 * The whole way from the area to the current page: what the breadcrumbs
 * show on a larger screen (UX-IA-009), the last being the current page.
 */
export const trail = (stack: Stack): readonly StackEntry[] => {
  const area = areaById(stack.area);
  return [{ href: area.href, label: area.label }, ...stack.entries];
};

/** The one step back, named after where it leads («‹ Kari Nordmann»). */
export const backOf = (stack: Stack): StackEntry => trail(stack).at(-2)!;

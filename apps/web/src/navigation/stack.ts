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
  /** What the browser's forward leads back into, nearest first. */
  readonly forward: readonly StackEntry[];
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
  forward: [],
});

/** An area's own page starts its stack over (UX-IA-009). */
export const areaStack = (area: AreaId): Stack => ({
  area,
  entries: [],
  via: null,
  forward: [],
});

/**
 * The stack once the user is on an area's own page. Back to it keeps what
 * the browser's forward leads into again; anything else starts over.
 */
export const returnToArea = (
  previous: Stack | null,
  area: AreaId,
  how: Arrival,
): Stack =>
  how === "history" && previous?.area === area
    ? {
        ...areaStack(area),
        forward: [...previous.entries, ...previous.forward],
      }
    : areaStack(area);

/**
 * The stack once the user has arrived at `place`. Something already in the
 * stack is gone back to rather than opened again (UX-IA-009), and the
 * browser's back and forward move within it; following a link adds to the
 * stack the user is in; anything else builds the stack from the rule,
 * never from history (UX-IA-011).
 */
export function arrive(
  previous: Stack | null,
  place: Place,
  how: Arrival,
  via: DirectEntry | null = null,
): Stack {
  const entry = { href: place.href, label: place.label };

  if (how === "direct" || previous === null) return ruleStack(place, via);

  const at = (entries: readonly StackEntry[]) =>
    entries.findIndex(({ href }) => samePlace(href, place.href));
  const index = at(previous.entries);

  if (index >= 0) {
    const current = index === previous.entries.length - 1;
    return {
      area: previous.area,
      entries: [...previous.entries.slice(0, index), entry],
      // Still on the page the entry led to, as after a reload.
      via: current ? previous.via : null,
      // Following a link ends what the browser's forward would lead to.
      forward:
        how === "history"
          ? [...previous.entries.slice(index + 1), ...previous.forward]
          : [],
    };
  }

  if (how === "push") {
    return {
      area: previous.area,
      entries: [...previous.entries, entry],
      via: null,
      forward: [],
    };
  }

  const ahead = at(previous.forward);
  return ahead >= 0
    ? {
        area: previous.area,
        entries: [
          ...previous.entries,
          ...previous.forward.slice(0, ahead),
          entry,
        ],
        via: null,
        forward: previous.forward.slice(ahead + 1),
      }
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

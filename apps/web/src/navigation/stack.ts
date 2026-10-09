import { type AreaId, areaById, type LayerId, layerById } from "./areas";

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

/** Where the user is in a stack, and what the browser's forward leads to. */
interface Steps {
  readonly entries: readonly StackEntry[];
  readonly forward: readonly StackEntry[];
}

/**
 * The steps once the user has arrived at `entry`. Something already in them
 * is gone back to rather than opened again (UX-IA-009), and the browser's
 * back and forward move within them; following a link adds to them and
 * ends the way forward. None when history leads outside them.
 */
function step(previous: Steps, entry: StackEntry, how: Arrival): Steps | null {
  const at = (entries: readonly StackEntry[]) =>
    entries.findIndex(({ href }) => samePlace(href, entry.href));
  const index = at(previous.entries);

  if (index >= 0) {
    return {
      entries: [...previous.entries.slice(0, index), entry],
      forward:
        how === "history"
          ? [...previous.entries.slice(index + 1), ...previous.forward]
          : [],
    };
  }

  if (how === "push") {
    return { entries: [...previous.entries, entry], forward: [] };
  }

  const ahead = at(previous.forward);
  return ahead >= 0
    ? {
        entries: [
          ...previous.entries,
          ...previous.forward.slice(0, ahead),
          entry,
        ],
        forward: previous.forward.slice(ahead + 1),
      }
    : null;
}

/**
 * The stack once the user has arrived at `place`: a step within the stack
 * the user is in (`step`), or, for anything else, the stack built from the
 * rule, never from history (UX-IA-011).
 */
export function arrive(
  previous: Stack | null,
  place: Place,
  how: Arrival,
  via: DirectEntry | null = null,
): Stack {
  if (how === "direct" || previous === null) return ruleStack(place, via);

  const moved = step(previous, { href: place.href, label: place.label }, how);
  if (moved === null) return ruleStack(place, null);

  const current = previous.entries.at(-1);
  return {
    area: previous.area,
    ...moved,
    // Still on the page the entry led to, as after a reload.
    via: current && samePlace(current.href, place.href) ? previous.via : null,
  };
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

/**
 * A layer's own stack (UX-IA-020): the pages opened in it, in order, and
 * the screen under it that «Lukk» returns to. A layer is never a step in
 * an area's stack.
 */
export interface LayerStack extends Steps {
  readonly layer: LayerId;
  /**
   * The screen the layer was opened over, and its place in the browser's
   * history when known; none when the layer was reached from outside.
   */
  readonly under: {
    readonly href: string;
    readonly index: number | null;
  } | null;
}

/**
 * The layer's stack once the user has arrived at `entry` in it. Opening the
 * layer from the app keeps the screen under it; anything else from outside
 * starts it over from the rule, with nothing to return to.
 */
export function arriveInLayer(
  previous: LayerStack | null,
  layer: LayerId,
  entry: StackEntry,
  how: Arrival,
  under: LayerStack["under"],
): LayerStack {
  if (previous === null || previous.layer !== layer || how === "direct") {
    // By the rule, a page in a layer lies under the layer's first page.
    const { href, label } = layerById(layer);
    return {
      layer,
      entries: samePlace(href, entry.href) ? [entry] : [{ href, label }, entry],
      forward: [],
      // From outside there is nothing under it; back or forward into it
      // still finds the screen it was opened over.
      under: how === "direct" ? null : under,
    };
  }

  return {
    ...previous,
    ...(step(previous, entry, how) ?? { entries: [entry], forward: [] }),
  };
}

/** The step back within the layer, if the current page is not its first. */
export const layerBackOf = (stack: LayerStack, href: string) =>
  isLayerStackOf(stack, href) ? (stack.entries.at(-2) ?? null) : null;

/** Whether `stack` is the layer stack of the page at `href`. */
export const isLayerStackOf = (stack: LayerStack | null, href: string) =>
  stack !== null &&
  stack.entries.length > 0 &&
  samePlace(stack.entries.at(-1)!.href, href);

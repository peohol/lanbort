"use client";

import { useSyncExternalStore } from "react";
import {
  type AreaId,
  areaAt,
  homeHref,
  type LayerId,
  layerOf,
} from "@/navigation/areas";
import {
  type Arrival,
  areaStack,
  arrive,
  arriveInLayer,
  type DirectEntry,
  isLayerStackOf,
  isStackOf,
  type LayerStack,
  type Place,
  returnToArea,
  ruleStack,
  type Stack,
  type StackEntry,
} from "@/navigation/stack";

/**
 * The browser's side of the navigation stack (UX-IA-009–011) and of the
 * layers' own stacks (UX-IA-020). Both are kept for the tab
 * (`sessionStorage`), so a reload keeps them and a new tab starts from the
 * rule. Pages say where they are (`enterPlace`, `enterLayerPlace`); how the
 * user got there decides what the stack becomes:
 *
 * - a page loaded from outside the app is a direct entry, unless it was a
 *   reload or the browser's back or forward;
 * - the browser's back and forward move within the stack;
 * - everything else in the app adds to the stack, except where a direct
 *   entry is announced first (`expectDirectEntry`), as from a notification,
 *   where a page is announced to take the current one's place
 *   (`expectReplacement`), and where a page is opened from inside a layer,
 *   which starts from the page's rule.
 */

interface State {
  readonly stack: Stack | null;
  readonly layer: LayerStack | null;
  /** The last screen outside a layer: what a layer opened now lies over. */
  readonly outside: string | null;
}

// Named anew with the layers: a stack kept by the app before has none.
const storageKey = "lanbort.navigation";

let state: State = { stack: null, layer: null, outside: null };
/**
 * How the next page arrives. `seen` is set once the app has shown a new
 * address; a value no page took by the address after that is stale, as
 * after the browser's back to a page without a place (`trackAddress`).
 */
let next: { how: Arrival; via: DirectEntry | null; seen: boolean } = {
  how: "push",
  via: null,
  seen: false,
};
const following = () => ({ how: "push" as const, via: null, seen: true });
const listeners = new Set<() => void>();

/** The Navigation API, where the browser has it: the history's entries. */
interface NavigationHistory {
  readonly currentEntry: { readonly index: number } | null;
  entries(): readonly { readonly url: string | null }[];
}

const browserHistory = () =>
  (globalThis as { navigation?: NavigationHistory }).navigation ?? null;

if (typeof window !== "undefined") {
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) state = JSON.parse(stored) as State;
  } catch {
    // A stack that cannot be read is built again from the rule.
  }

  const [load] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];
  next = {
    how:
      load?.type === "reload" || load?.type === "back_forward"
        ? "history"
        : "direct",
    via: null,
    seen: false,
  };

  window.addEventListener("popstate", () => {
    next = { how: "history", via: null, seen: false };
  });
}

function set(change: Partial<State>) {
  state = { ...state, ...change };
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Without storage the stack lasts as long as the page.
  }
  for (const listener of listeners) listener();
}

/** How the page now arrived, which is then used up. */
function take() {
  const arrival = next;
  next = following();
  return arrival;
}

const here = () => `${location.pathname}${location.search}`;

/** The address now, unless it is in a layer: then the screen under it. */
const outsideNow = () =>
  layerOf(location.pathname) === null ? here() : state.outside;

/**
 * The app shows a new address (from the always present main navigation,
 * before the page says where it is). Outside a layer it is what a layer
 * opened now lies over, and reached by the browser's back or forward it
 * ends any layer. How the previous address arrived is used up by now.
 */
export function trackAddress() {
  if (next.seen) next = following();
  next = { ...next, seen: true };

  if (layerOf(location.pathname) !== null) return;
  set({ outside: here(), ...(next.how === "history" && { layer: null }) });
}

/** The next page is a direct entry, such as a chosen notification. */
export function expectDirectEntry(via: DirectEntry) {
  next = { how: "direct", via, seen: false };
}

/**
 * The next page takes the current one's place, in the browser's history
 * (`router.replace`) and in the stack, as after a step that is done with
 * the page it was taken on. A form is not in the stack (`enterTask`), so
 * the page after it is added as usual.
 */
export function expectReplacement() {
  const inStack =
    isStackOf(state.stack, here()) || isLayerStackOf(state.layer, here());
  next = { how: inStack ? "replace" : "push", via: null, seen: false };
}

/** Whether the user followed something in the app to the page. */
const followed = (how: Arrival) => how === "push" || how === "replace";

/** The user has arrived at a detail page. */
export function enterPlace(place: Place) {
  const { how, via } = take();
  // A page followed from inside a layer is not part of the stack under it.
  const fromLayer = state.layer !== null && followed(how);

  set({
    stack: arrive(state.stack, place, fromLayer ? "direct" : how, via),
    layer: null,
    outside: place.href,
  });
}

/**
 * The user has opened a form (UX-IA-013). It is not part of the stack: the
 * stack stays where the form was started, or, for a form opened from
 * outside, is built as if the user were on `from`.
 */
export function enterTask(from: Place) {
  const { how } = take();
  const fromLayer = state.layer !== null;
  const change = { layer: null, outside: outsideNow() };

  if (followed(how) && state.stack !== null && !fromLayer) {
    set(change);
    return;
  }

  const area = areaAt(from.href);
  set({ ...change, stack: area ? areaStack(area) : ruleStack(from, null) });
}

/** The user has arrived at an area's own page. */
export function enterArea(area: AreaId) {
  const { how } = take();
  set({
    stack: returnToArea(state.stack, area, how),
    layer: null,
    outside: outsideNow(),
  });
}

/**
 * The screen a layer lies over: the nearest earlier entry in the browser's
 * history that is not in a layer, so also after the browser's back or
 * forward into the layer; where that history is not known, the last screen
 * outside a layer.
 */
export function screenUnder(): LayerStack["under"] {
  const history = browserHistory();
  const current = history?.currentEntry?.index ?? null;

  if (history && current !== null) {
    const entries = history.entries();
    for (let index = current - 1; index >= 0; index -= 1) {
      const url = entries[index]?.url;
      if (!url) break;
      const { pathname, search } = new URL(url);
      if (layerOf(pathname) === null) {
        return { href: `${pathname}${search}`, index };
      }
    }
  }

  return state.outside ? { href: state.outside, index: null } : null;
}

/** The user has arrived at a page in a layer, such as Konto or Varsler. */
export function enterLayerPlace(layer: LayerId, entry: StackEntry) {
  const { how } = take();
  set({ layer: arriveInLayer(state.layer, layer, entry, how, screenUnder()) });
}

/**
 * «Lukk» (UX-IA-020): back to exactly the screen the layer was opened over,
 * by going back in the browser's history to it, so its stack, filters,
 * fields and scroll stay as they were. Where that history is not known,
 * the screen is opened again, and without one, Hjem.
 */
export function closeLayer(open: (href: string) => void) {
  const under = state.layer?.under ?? null;
  const history = browserHistory();
  const current = history?.currentEntry?.index ?? null;

  if (under?.index != null && current !== null && under.index < current) {
    const url = history?.entries()[under.index]?.url;
    const entry = url ? new URL(url) : null;

    if (entry && `${entry.pathname}${entry.search}` === under.href) {
      window.history.go(under.index - current);
      return;
    }
  }

  next = { how: "history", via: null, seen: false };
  open(under?.href ?? homeHref);
}

/**
 * How to follow a link in the app: into or within a layer the page under it
 * stays where it is, scrolled as it was (UX-IA-020); elsewhere the new page
 * starts at its top.
 */
export const scrollFor = (href: string) => ({
  scroll: layerOf(new URL(href, location.href).pathname) === null,
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const none = () => null;

/** The current stack; none while the page is made on the server. */
export function useStack(): Stack | null {
  return useSyncExternalStore(subscribe, () => state.stack, none);
}

/** The current layer's stack; none while the page is made on the server. */
export function useLayerStack(): LayerStack | null {
  return useSyncExternalStore(subscribe, () => state.layer, none);
}

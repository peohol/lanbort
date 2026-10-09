"use client";

import { useSyncExternalStore } from "react";
import { type AreaId, areaAt } from "@/navigation/areas";
import {
  type Arrival,
  areaStack,
  arrive,
  type DirectEntry,
  type Place,
  ruleStack,
  type Stack,
} from "@/navigation/stack";

/**
 * The browser's side of the navigation stack (UX-IA-009–011). The stack is
 * kept for the tab (`sessionStorage`), so a reload keeps it and a new tab
 * starts from the rule. Pages say where they are (`enterPlace`); how the
 * user got there decides what the stack becomes:
 *
 * - a page loaded from outside the app is a direct entry, unless it was a
 *   reload or the browser's back or forward;
 * - the browser's back and forward move within the stack;
 * - everything else in the app adds to the stack, except where a direct
 *   entry is announced first (`expectDirectEntry`), as from a notification.
 */

const storageKey = "lanbort.stack";

let stack: Stack | null = null;
let next: { how: Arrival; via: DirectEntry | null } = {
  how: "push",
  via: null,
};
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    const stored = sessionStorage.getItem(storageKey);
    stack = stored ? (JSON.parse(stored) as Stack) : null;
  } catch {
    stack = null;
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
  };

  window.addEventListener("popstate", () => {
    next = { how: "history", via: null };
  });
}

function set(value: Stack) {
  stack = value;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Without storage the stack lasts as long as the page.
  }
  for (const listener of listeners) listener();
}

/** The next page is a direct entry, such as a chosen notification. */
export function expectDirectEntry(via: DirectEntry) {
  next = { how: "direct", via };
}

/** The user has arrived at a detail page. */
export function enterPlace(place: Place) {
  const { how, via } = next;
  next = { how: "push", via: null };
  set(arrive(stack, place, how, via));
}

/**
 * The user has opened a form (UX-IA-013). It is not part of the stack: the
 * stack stays where the form was started, or, for a form opened from
 * outside, is built as if the user were on `from`.
 */
export function enterTask(from: Place) {
  const { how } = next;
  next = { how: "push", via: null };

  if (how === "push" && stack !== null) return;

  const area = areaAt(from.href);
  set(area ? areaStack(area) : ruleStack(from, null));
}

/** The user has arrived at an area's own page. */
export function enterArea(area: AreaId) {
  next = { how: "push", via: null };
  set(areaStack(area));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current stack; none while the page is made on the server. */
export function useStack(): Stack | null {
  return useSyncExternalStore(
    subscribe,
    () => stack,
    () => null,
  );
}

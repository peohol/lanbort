"use client";

import { useEffect, useSyncExternalStore } from "react";
import { followedLink } from "@/navigation/links";

/**
 * A followed link answers at once: a thin bar at the top of
 * the screen runs while the next page is on its way, the page under it
 * dims if that takes a moment, and the main navigation marks the area being
 * opened. The page counts as arrived when the address changes, which
 * Next.js does as it shows it.
 */
let pending: URL | null = null;
const listeners = new Set<() => void>();

function setPending(next: URL | null) {
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The path of the page on its way, if a followed link is. */
export function usePendingPath(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => pending?.pathname ?? null,
    () => null,
  );
}

/** How long a page may take before the bar stops waiting for it. */
const giveUpAfterMs = 15_000;

const address = (url: Pick<URL, "pathname" | "search">) =>
  `${url.pathname}${url.search}`;

export function NavigationProgress() {
  const active = useSyncExternalStore(
    subscribe,
    () => pending !== null,
    () => false,
  );

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const link = followedLink(event);
      // Only a link to another address shows a new page; the API's
      // addresses are files and the like.
      if (
        link &&
        address(link) !== address(location) &&
        !link.pathname.startsWith("/api/")
      ) {
        setPending(new URL(link.href));
      }
    }

    // A page the browser keeps and shows again on its back is not waiting.
    const onShow = () => setPending(null);

    window.addEventListener("click", onClick, { capture: true });
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    const from = location.href;
    let frame = requestAnimationFrame(function check() {
      if (location.href !== from) {
        setPending(null);
      } else {
        frame = requestAnimationFrame(check);
      }
    });
    const giveUp = setTimeout(() => setPending(null), giveUpAfterMs);
    const content = document.getElementById("innhold");
    content?.setAttribute("aria-busy", "true");

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(giveUp);
      content?.removeAttribute("aria-busy");
    };
  }, [active]);

  return (
    <div
      className="navigation-progress"
      data-active={active ? "" : undefined}
      aria-hidden="true"
    />
  );
}

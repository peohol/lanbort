"use client";

import { useEffect } from "react";

/** The bars that stay in view, and the property their height is kept in. */
const bars = [
  [".app-header", "--header-covers"],
  [".main-navigation", "--nav-covers"],
] as const;

/**
 * WCAG 2.4.11: what has focus is scrolled clear of the header and the
 * navigation (globals.css `scroll-padding`). Their heights are measured
 * here, because larger text can wrap either to more rows than any fixed
 * height allows for. A browser that scrolls a tall field only until its
 * top shows is helped the rest of the way: the field is moved up until it
 * clears the navigation, as far as it can without its top going under the
 * header.
 */
export function StickyBars() {
  useEffect(() => {
    const root = document.documentElement.style;
    const observer = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const [, property] = bars.find(([selector]) =>
          target.matches(selector),
        )!;
        root.setProperty(property, `${(target as HTMLElement).offsetHeight}px`);
      }
    });

    for (const [selector] of bars) {
      const bar = document.querySelector(selector);
      if (bar) observer.observe(bar);
    }

    // The width where the areas move to the side (globals.css).
    const wide = window.matchMedia("(min-width: 48rem)");
    const clearOfBars = (event: FocusEvent) => {
      const header = document.querySelector(".app-header");
      const navigation = document.querySelector(".main-navigation");
      if (!(event.target instanceof Element) || !header || !navigation) return;
      if (navigation.contains(event.target) || header.contains(event.target)) {
        return;
      }

      // Only the bar at the bottom of a phone covers from below.
      if (wide.matches) return;

      const box = event.target.getBoundingClientRect();
      const top = header.getBoundingClientRect().bottom;
      const bottom = navigation.getBoundingClientRect().top;
      if (box.bottom <= bottom) return;

      const room = box.top - top;
      if (room > 0) window.scrollBy(0, Math.min(box.bottom - bottom, room));
    };
    document.addEventListener("focusin", clearOfBars);

    return () => {
      document.removeEventListener("focusin", clearOfBars);
      observer.disconnect();
      for (const [, property] of bars) root.removeProperty(property);
    };
  }, []);

  return null;
}

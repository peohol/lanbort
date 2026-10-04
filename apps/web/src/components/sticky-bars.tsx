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
 * height allows for.
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

    return () => {
      observer.disconnect();
      for (const [, property] of bars) root.removeProperty(property);
    };
  }, []);

  return null;
}

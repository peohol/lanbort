"use client";

import { useEffect } from "react";

/**
 * The bars that stay in view, the property their size is kept in, and
 * which size: the bar's buttons are measured across, so a page's first row
 * leaves room for them (globals.css).
 */
const bars = [
  [".app-header", "--header-covers", "offsetHeight"],
  [".main-navigation", "--nav-covers", "offsetHeight"],
  [".header-actions", "--actions-covers", "offsetWidth"],
] as const;

/**
 * A page's first row, which stays in the bar of the app or of a layer
 * (globals.css), in the content the bar heads.
 */
const firstRow = (content: string) =>
  [
    `${content} > main:first-child > h1:first-child`,
    `${content} > main:first-child > .page-header:first-child > :is(.place-bar, h1):first-child`,
  ].join(", ");

function setRowHeight(holder: HTMLElement, height: number) {
  if (holder.style.getPropertyValue("--row-height") !== `${height}px`) {
    holder.style.setProperty("--row-height", `${height}px`);
  }
}

/** The most of the screen a bar may take and still stay in view. */
const pinnedShare = 1 / 4;

/**
 * Each bar, of the app or of a layer, is made as tall as its first row's
 * own content needs (`--row-height`), so a title that wraps with larger
 * text stays inside the bar instead of lying over the page. The content is
 * measured rather than the row, which is at least as tall as the bar. A
 * bar that then fits in its share of the screen is pinned: it stays, with
 * the row, while the page scrolls under it.
 */
function fitBarsToRows() {
  const root = document.documentElement;
  const bars: [HTMLElement, string, string][] = [
    [root, ".app-header", ".app-content"],
    ...[...document.querySelectorAll<HTMLElement>(".layer")].map(
      (layer): [HTMLElement, string, string] => [
        layer,
        ":scope > .layer-header",
        ".layer-content",
      ],
    ),
  ];

  for (const [holder, bar, content] of bars) {
    const row = holder.querySelector(firstRow(content));
    const range = document.createRange();
    if (row) range.selectNodeContents(row);
    const height = row ? range.getBoundingClientRect().height : 0;
    setRowHeight(holder, height);

    const size = holder.querySelector<HTMLElement>(bar)?.offsetHeight;
    const pinned = size !== undefined && size <= innerHeight * pinnedShare;
    // A bar that scrolls away has no need to hold the row.
    if (!pinned) setRowHeight(holder, 0);
    if (pinned !== (holder.dataset.bar === "pinned")) {
      if (pinned) holder.dataset.bar = "pinned";
      else delete holder.dataset.bar;
    }
  }
}

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
        const [, property, size] = bars.find(([selector]) =>
          target.matches(selector),
        )!;
        root.setProperty(property, `${(target as HTMLElement)[size]}px`);
      }
    });

    for (const [selector] of bars) {
      const bar = document.querySelector(selector);
      if (bar) observer.observe(bar);
    }

    // A row changes with the page, the width and the size of the text.
    let fitting = 0;
    const fitSoon = () => {
      cancelAnimationFrame(fitting);
      fitting = requestAnimationFrame(fitBarsToRows);
    };
    const pages = new MutationObserver(fitSoon);
    pages.observe(document.body, { childList: true, subtree: true });
    const sizes = new ResizeObserver(fitSoon);
    sizes.observe(document.documentElement);

    // The width where the areas move to the side (globals.css).
    const wide = window.matchMedia("(min-width: 48rem)");
    const clearOfBars = (event: FocusEvent) => {
      const header = document.querySelector(".app-header");
      const navigation = document.querySelector(".main-navigation");
      if (!(event.target instanceof Element) || !header || !navigation) return;
      // A layer covers the bars (UX-IA-020) and scrolls on its own.
      if (
        navigation.contains(event.target) ||
        header.contains(event.target) ||
        event.target.closest(".layer")
      ) {
        return;
      }

      // Only the bar at the bottom of a phone covers from below, and not
      // where it is hidden, as in a form (UX-IA-013).
      if (wide.matches || navigation.getClientRects().length === 0) return;

      const box = event.target.getBoundingClientRect();
      const top = Math.max(0, header.getBoundingClientRect().bottom);
      const bottom = navigation.getBoundingClientRect().top;
      if (box.bottom <= bottom) return;

      const room = box.top - top;
      if (room > 0) window.scrollBy(0, Math.min(box.bottom - bottom, room));
    };
    document.addEventListener("focusin", clearOfBars);

    return () => {
      document.removeEventListener("focusin", clearOfBars);
      observer.disconnect();
      pages.disconnect();
      sizes.disconnect();
      cancelAnimationFrame(fitting);
      for (const [, property] of bars) root.removeProperty(property);
      root.removeProperty("--row-height");
      delete document.documentElement.dataset.bar;
    };
  }, []);

  return null;
}

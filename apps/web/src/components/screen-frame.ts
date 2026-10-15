"use client";

import { type RefObject, useEffect } from "react";

/**
 * The least of the frame the part that scrolls keeps; with text so large
 * that it would get less, the page scrolls as a whole (UX-A11Y-007), as a
 * bar that takes too much stops staying (`StickyBars`).
 */
const scrollingShare = 1 / 4;

/**
 * Holds the page in the part of the screen that shows (globals.css
 * `data-frame`): the app's bar stays at the top, the navigation at the
 * bottom, and of the page only `scroller` scrolls, between what the page
 * keeps in place above and below it. The frame follows the visual viewport,
 * so an on-screen keyboard makes it shorter instead of scrolling the bar
 * out of sight.
 */
export function useScreenFrame(scroller: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    const view = window.visualViewport;
    const place = () =>
      root.style.setProperty("--frame-top", `${view?.offsetTop ?? 0}px`);

    // Tried in the frame before the screen is drawn; what does not fit is
    // left where the page scrolled to.
    const fit = () => {
      const list = scroller.current;
      if (!list) return;
      const height = view?.height ?? innerHeight;
      root.style.setProperty("--frame-height", `${height}px`);
      place();
      const scrolled = scrollY;
      root.dataset.frame = "";
      if (list.clientHeight < height * scrollingShare) {
        delete root.dataset.frame;
        scrollTo(0, scrolled);
      }
    };

    let fitting = 0;
    const fitSoon = () => {
      cancelAnimationFrame(fitting);
      fitting = requestAnimationFrame(fit);
    };
    fit();

    // The text's size changes what the page keeps in place.
    const sizes = new ResizeObserver(fitSoon);
    if (scroller.current) sizes.observe(scroller.current);
    view?.addEventListener("resize", fitSoon);
    view?.addEventListener("scroll", place);
    window.addEventListener("resize", fitSoon);

    return () => {
      cancelAnimationFrame(fitting);
      sizes.disconnect();
      view?.removeEventListener("resize", fitSoon);
      view?.removeEventListener("scroll", place);
      window.removeEventListener("resize", fitSoon);
      delete root.dataset.frame;
      root.style.removeProperty("--frame-height");
      root.style.removeProperty("--frame-top");
    };
  }, [scroller]);
}

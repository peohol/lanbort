"use client";

import { useEffect } from "react";

/** Where focus goes when what had it is gone: the part of the page it was in. */
const landing = "section, main, #innhold";

/**
 * UX-A11Y-003: when an answer removes the control that had focus (a friend
 * request accepted, an invitation declined), the keyboard is not dropped at
 * the top of the document. Focus moves to the heading of the part of the
 * page the control was in, without scrolling, so the next Tab continues
 * from there.
 */
export function FocusKeeper() {
  useEffect(() => {
    let focused: Element | null = null;
    let parts: Element[] = [];
    const remember = ({ target }: FocusEvent) => {
      focused = target as Element;
      parts = [];
      for (
        let part = (target as Element).closest(landing);
        part;
        part = part.parentElement?.closest(landing) ?? null
      ) {
        parts.push(part);
      }
    };
    const observer = new MutationObserver(() => {
      if (
        !focused ||
        focused.isConnected ||
        document.activeElement !== document.body
      ) {
        return;
      }

      const part = parts.find((candidate) => candidate.isConnected);
      focused = null;

      if (!part) return;

      const target =
        part.querySelector<HTMLElement>("h1, h2, h3") ?? (part as HTMLElement);

      if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });

    document.addEventListener("focusin", remember);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("focusin", remember);
      observer.disconnect();
    };
  }, []);

  return null;
}

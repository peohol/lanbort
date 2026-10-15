"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { needsOwnDocument } from "@/navigation/headers";
import { followedLink } from "@/navigation/links";
import { expectNewDocument } from "./navigation-stack";

/**
 * A document keeps the security headers it was loaded with (ADR-0010 §13),
 * so going between chat pages and the rest of the app loads the page anew
 * (`needsOwnDocument`): chat's keys are left behind in the old document,
 * and the map and location work again outside chat.
 *
 * A link there is followed as a new document at once, instead of first
 * inside this one: the link's own handlers still run, such as marking a
 * notification read, and Next.js leaves a click that is already prevented
 * alone. Anything else that reaches such a page inside the app, such as
 * the browser's back, loads it anew when it is shown.
 */
export function HeaderBoundary() {
  const pathname = usePathname();

  useEffect(() => {
    if (needsOwnDocument(pathname)) location.reload();
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const url = followedLink(event);
      if (!url || !needsOwnDocument(url.pathname)) return;

      event.preventDefault();
      setTimeout(() => {
        expectNewDocument(`${url.pathname}${url.search}`);
        location.assign(url.href);
      });
    }

    // Before the page's own handlers, which see the click as prevented.
    window.addEventListener("click", onClick, { capture: true });
    return () =>
      window.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}

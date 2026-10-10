"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { layerOf } from "@/navigation/areas";
import { isChatPage, loadedPath } from "@/navigation/chat";

/**
 * A document keeps the security headers it was loaded with (ADR-0010 §13).
 * Chat pages have stricter ones than the rest of the app, so going between
 * them inside the app loads the page anew: chat's keys are left behind in
 * the old document, and the map and location work again outside chat.
 * Konto and Varsler open as a layer over the page below, which keeps its
 * headers, so they are no such step.
 */
export function HeaderBoundary() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      layerOf(pathname) === null &&
      isChatPage(pathname) !== isChatPage(loadedPath())
    ) {
      location.reload();
    }
  }, [pathname]);

  return null;
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { loadedPath } from "@/navigation/headers";

const noSubscription = () => () => undefined;

/**
 * Whether the page's document was loaded at `href`, and so has that path's
 * security headers, such as the camera for scanning (`usesCamera`). A page
 * reached by navigating inside the app still runs under the first page's
 * headers, so where it `needs` its own, it is loaded anew.
 */
export function useLoadedAt(href: string, needs = true): boolean {
  const loaded = useSyncExternalStore(
    noSubscription,
    () => !needs || loadedPath() === href,
    () => false,
  );

  useEffect(() => {
    if (needs && loadedPath() !== href) location.reload();
  }, [href, needs]);

  return loaded;
}

"use client";

import { useEffect } from "react";

/**
 * Takes a one-time marker out of the address once the page has shown it,
 * so a reload, a bookmark or a shared link does not show it again (the
 * welcome after joining, Tomat kjerneflyt 3). The page itself is not read
 * again.
 */
export function ForgetParam({ name }: { name: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);

    if (!url.searchParams.has(name)) return;

    url.searchParams.delete(name);
    window.history.replaceState(null, "", url);
  }, [name]);

  return null;
}

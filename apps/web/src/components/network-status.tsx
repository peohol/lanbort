"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { announce } from "./announcer";

function subscribe(changed: () => void) {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);

  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
}

const offline =
  "Du er uten nett. Det du har fylt ut, beholdes, men ingenting sendes før du er tilkoblet igjen.";

/**
 * UX-A11Y-009, PS-NFR-006: being without a network is shown in words while
 * it lasts, and both losing and getting it back are announced. Nothing
 * claims to be sent meanwhile: each action still says whether it happened.
 */
export function NetworkStatus() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const wasOnline = useRef(online);

  useEffect(() => {
    if (online !== wasOnline.current) {
      announce(online ? "Du er tilkoblet igjen." : offline);
    }

    wasOnline.current = online;
  }, [online]);

  return online ? null : <p className="network-status">{offline}</p>;
}

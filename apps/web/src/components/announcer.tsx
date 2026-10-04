"use client";

import { useEffect, useState } from "react";

/**
 * One polite live region for the whole app (UX-A11Y-004, WCAG 4.1.3): what
 * changed after an answer is said to assistive technology, not only shown.
 */
const event = "lanbort:announce";

export function announce(message: string) {
  window.dispatchEvent(new CustomEvent<string>(event, { detail: message }));
}

export function Announcer() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let frame = 0;
    const listener = (announced: Event) => {
      // Emptied first, so the same words twice are said twice.
      setMessage("");
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setMessage((announced as CustomEvent<string>).detail),
      );
    };

    window.addEventListener(event, listener);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(event, listener);
    };
  }, []);

  // A live region, not a status role: a page's own status, such as where
  // a sign-in code went, stays the one status on it.
  return (
    <div aria-live="polite" aria-atomic="true" className="visually-hidden">
      {message}
    </div>
  );
}

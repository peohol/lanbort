import type { ComponentProps } from "react";

/**
 * A button whose command is under way (UX-A11Y-003, UX-A11Y-009). It keeps
 * its focus while busy, where a disabled button would drop the keyboard to
 * the top of the page; presses are ignored until the answer comes, and the
 * wait is said in words, not only by its look.
 */
export function BusyButton({
  busy,
  busyNote = "sender …",
  onClick,
  children,
  ...props
}: ComponentProps<"button"> & { busy: boolean; busyNote?: string }) {
  return (
    <button
      {...props}
      aria-disabled={busy || undefined}
      onClick={(event) => {
        if (busy) {
          // Also stops a submit button from sending its form twice.
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
    >
      {children}
      {busy && <span className="busy-note"> – {busyNote}</span>}
    </button>
  );
}

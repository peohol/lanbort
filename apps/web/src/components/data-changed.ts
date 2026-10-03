/**
 * A signal that a command changed what the server holds, for parts of the
 * page that read their own data (such as the notification count) and are
 * not refreshed with the page.
 */
const event = "lanbort:data-changed";

export function announceDataChanged() {
  window.dispatchEvent(new Event(event));
}

/** Calls `listener` on every change; returns the unsubscribe. */
export function onDataChanged(listener: () => void): () => void {
  window.addEventListener(event, listener);

  return () => window.removeEventListener(event, listener);
}

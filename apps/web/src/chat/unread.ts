import type { HistoryEntry } from "./engine";

/**
 * The first message from someone else after the last one shown on this
 * device, or null when there is none (PS-COM-004: new messages are marked
 * for the reader only, on the device). A device that has never shown the
 * conversation has not seen any of it.
 */
export function firstUnseen(
  history: readonly HistoryEntry[],
  seen: string | null,
): HistoryEntry | null {
  const after = seen === null ? 0 : history.findIndex((e) => e.id === seen) + 1;
  // A marker that is no longer in the history marks nothing as new.
  if (seen !== null && after === 0) return null;
  return history.slice(after).find((entry) => !entry.own) ?? null;
}

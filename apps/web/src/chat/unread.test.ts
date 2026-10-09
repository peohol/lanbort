import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "./engine";
import { firstUnseen } from "./unread";

const entry = (id: string, own = false): HistoryEntry => ({
  id,
  senderUserId: own ? "me" : "them",
  own,
  text: id,
  sentAt: "2026-10-09T10:00:00Z",
});

describe("firstUnseen", () => {
  const history = [entry("a"), entry("b", true), entry("c"), entry("d")];

  it("finds the first message from others after the marker", () => {
    expect(firstUnseen(history, "b")?.id).toBe("c");
    expect(firstUnseen(history, "a")?.id).toBe("c");
  });

  it("marks everything from others on a device that has shown nothing", () => {
    expect(firstUnseen(history, null)?.id).toBe("a");
  });

  it("marks nothing once the last message is seen, or for own messages", () => {
    expect(firstUnseen(history, "d")).toBeNull();
    expect(firstUnseen([entry("x", true)], null)).toBeNull();
  });

  it("marks nothing when the marker is gone from the history", () => {
    expect(firstUnseen(history, "gone")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { utf8 } from "./bytes";
import type { HistoryEntry } from "./engine";
import { mergeHistory, packHistory, unpackHistory } from "./history-transfer";

const entry = (
  id: string,
  minute: number,
  extra: Partial<HistoryEntry> = {},
): HistoryEntry => ({
  id,
  senderUserId: "them",
  own: false,
  text: `melding ${id}`,
  sentAt: `2026-10-10T10:${String(minute).padStart(2, "0")}:00.000Z`,
  ...extra,
});

describe("moving history to a linked device", () => {
  it("keeps every sent message and how far it was read", () => {
    const conversations = [
      {
        id: "c1",
        history: [entry("a", 1), entry("b", 2, { own: true })],
        seen: "b",
      },
      { id: "c2", history: [entry("c", 3, { text: null })], seen: null },
    ];

    expect(unpackHistory(packHistory(conversations))).toEqual(conversations);
  });

  it("leaves a message that is still being sent behind", () => {
    const [moved] = unpackHistory(
      packHistory([
        {
          id: "c1",
          history: [
            entry("a", 1),
            entry("b", 2, { own: true, sentAt: null, unsent: true }),
          ],
          seen: null,
        },
      ]),
    );

    expect(moved!.history.map((e) => e.id)).toEqual(["a"]);
  });

  it("leaves the oldest messages out when it is all too much", () => {
    const history = Array.from({ length: 50 }, (_, i) => entry(`m${i}`, i));
    const whole = packHistory([{ id: "c1", history, seen: null }]).length;
    const [moved] = unpackHistory(
      packHistory([{ id: "c1", history, seen: null }], whole / 2),
    );

    const ids = moved!.history.map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(50);
    expect(ids.at(-1)).toBe("m49");
    expect(ids[0]).toBe(`m${50 - ids.length}`);
  });

  it("refuses an archive that is not history", () => {
    expect(() => unpackHistory(utf8('{"v":2}'))).toThrow();
    expect(() =>
      unpackHistory(
        utf8(
          JSON.stringify({
            v: 1,
            conversations: [{ id: "c", history: [{ id: 1 }], seen: null }],
          }),
        ),
      ),
    ).toThrow();
  });

  it("adds what moved before what the device has, each message once", () => {
    const own = [entry("c", 5), entry("d", 6)];
    const moved = [entry("a", 1), entry("c", 5, { text: "gammel" })];

    expect(mergeHistory(own, moved)).toEqual([
      entry("a", 1),
      entry("c", 5),
      entry("d", 6),
    ]);
  });
});

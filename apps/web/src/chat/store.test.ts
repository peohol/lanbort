import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAllChatStores } from "./store";

/** An IndexedDB that lists `names` and records what is deleted. */
function fakeIndexedDb(names: (string | undefined)[]) {
  const deleted: string[] = [];
  vi.stubGlobal("indexedDB", {
    databases: async () => names.map((name) => ({ name, version: 1 })),
    deleteDatabase: (name: string) => {
      deleted.push(name);
      const req = { result: undefined } as {
        result: undefined;
        onsuccess?: () => void;
      };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  });
  return deleted;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deleteAllChatStores (ADR-0010 §7)", () => {
  it("deletes every account's chat in the browser, and nothing else", async () => {
    const deleted = fakeIndexedDb([
      "lanbort-chat-a",
      "something-else",
      undefined,
      "lanbort-chat-b",
    ]);

    await deleteAllChatStores();

    expect(deleted).toEqual(["lanbort-chat-a", "lanbort-chat-b"]);
  });

  it("does nothing where the browser cannot list its databases", async () => {
    vi.stubGlobal("indexedDB", { deleteDatabase: vi.fn() });

    await expect(deleteAllChatStores()).resolves.toBeUndefined();
  });
});

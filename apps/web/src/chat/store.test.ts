import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteChatStoresAtSignOut } from "./store";

/**
 * An IndexedDB that lists `names`, or cannot list any (null), and records
 * what is deleted.
 */
function fakeIndexedDb(names: (string | undefined)[] | null) {
  const deleted: string[] = [];
  vi.stubGlobal("indexedDB", {
    ...(names && {
      databases: async () => names.map((name) => ({ name, version: 1 })),
    }),
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

describe("deleteChatStoresAtSignOut (ADR-0010 §7)", () => {
  it("deletes the account's chat and every other one in the browser, and nothing else", async () => {
    const deleted = fakeIndexedDb([
      "lanbort-chat-b",
      "something-else",
      undefined,
      "lanbort-chat-a",
    ]);

    await deleteChatStoresAtSignOut("a");

    expect(deleted.sort()).toEqual(["lanbort-chat-a", "lanbort-chat-b"]);
  });

  it("still deletes the account's own where the browser cannot list its databases", async () => {
    const deleted = fakeIndexedDb(null);

    await deleteChatStoresAtSignOut("a");

    expect(deleted).toEqual(["lanbort-chat-a"]);
  });
});

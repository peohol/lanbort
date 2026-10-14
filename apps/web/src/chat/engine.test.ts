import {
  createAccountKey,
  createDevice,
  importRecoveryKey,
  openRecoveryBackup,
  readRecoveryKey,
  sealArchive,
  sealRecoveryBackup,
} from "@lanbort/e2ee";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./bytes";
import {
  type DeviceContext,
  FakeChatServer,
  fake,
  on,
  storedJson,
  storedNames,
  storedRecord,
} from "./engine.fixtures";
import {
  type ChatEngine,
  chatTuning,
  completeDeviceLink,
  createChat,
  loadChat,
  requestDeviceLink,
  restoreChat,
} from "./engine";

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  const fixtures = await import("./engine.fixtures");
  fixtures.useErrorClass(real.ChatApiError);
  return { ...real, chatApi: fixtures.fakeChatApi };
});
vi.mock(
  "./store",
  async () => (await import("./engine.fixtures")).memoryStores,
);

/**
 * The engine against a delivery service that may lie (ADR-0010 §13): what
 * a device shows and sends must follow from what it verified itself.
 */

interface TestDevice extends DeviceContext {
  engine: ChatEngine;
}

let server: FakeChatServer;

beforeEach(() => {
  server = new FakeChatServer();
  fake.server = server;
});

afterEach(() => {
  vi.useRealTimers();
});

const context = (userId: string): DeviceContext => ({
  userId,
  browser: crypto.randomUUID(),
  session: crypto.randomUUID(),
});

/** A new account with chat on its first device. */
async function startChat(userId = crypto.randomUUID()): Promise<TestDevice> {
  const device = context(userId);
  const engine = await on(device, () => createChat(userId, false));
  return { ...device, engine };
}

/** Links a new device of `from`'s account, as screens 12 and 13 do. */
async function link(from: TestDevice, moveHistory: boolean) {
  const device = context(from.userId);
  const { link: pending, status } = await on(device, requestDeviceLink);
  await on(from, async () => {
    const { requests } = await server.api.linkRequests();
    const found = await from.engine.findLinkRequest(requests, {
      code: pending.code,
    });
    if (!found) throw new Error("link request not found");
    await from.engine.approveLink(found, moveHistory);
  });
  const approved = await on(device, () =>
    server.api.linkStatus(status.linkRequestId),
  );
  const engine = await on(device, () =>
    completeDeviceLink(from.userId, pending, {
      ...approved,
      package: approved.package!,
    }),
  );
  await on(device, () => engine.resumeHistory());
  return { ...device, engine } satisfies TestDevice;
}

const maintain = (device: TestDevice, id: string) =>
  on(device, () => device.engine.maintain(id));
const sync = (device: TestDevice) => on(device, () => device.engine.sync());
/** Whom the conversation's page shows it is with, as the server says. */
const shown = (device: TestDevice, id: string) =>
  on(device, async () =>
    (await server.api.conversation(id)).others.map((other) => other.userId),
  );
const send = async (device: TestDevice, id: string, text: string) => {
  const to = await shown(device, id);
  return on(device, () => device.engine.send(id, text, to));
};
/** The device's page is reloaded: the engine starts from its store. */
async function reload(device: TestDevice): Promise<TestDevice> {
  const loaded = await on(device, () => loadChat(device.userId));
  if (loaded.setup !== "ready") throw new Error(loaded.setup);
  return { ...device, engine: loaded.engine };
}

/** Step one of a new recovery key: its code, or what it would end. */
const prepare = (device: TestDevice, dropping: string | null = null) =>
  on(device, () => device.engine.createRecoveryKey(dropping));
/** The key whose code step one showed. */
const shownKey = (
  made: Awaited<ReturnType<ChatEngine["createRecoveryKey"]>>,
) => {
  if (!("code" in made)) throw new Error("asked to drop backed-up history");
  return made;
};
/** Step two, once the user has kept the code: that key is put to use. */
const activate = (
  device: TestDevice,
  made: { keyId: string },
  dropping: string | null = null,
) => on(device, () => device.engine.activateRecoveryKey(made.keyId, dropping));
/** Makes a recovery key where no confirmation is needed; its code. */
const createRecoveryKey = async (device: TestDevice) => {
  const made = shownKey(await prepare(device));
  const activated = await activate(device, made);
  if (!("active" in activated)) {
    throw new Error("asked to drop backed-up history");
  }
  return made.code;
};
const texts = async (device: TestDevice, id: string) =>
  (await on(device, () => device.engine.history(id))).map((e) => e.text);

/** Two accounts in one conversation, every device in the group. */
async function conversationBetween(a: TestDevice, b: TestDevice) {
  const id = server.startConversation(a.userId, b.userId);
  await maintain(a, id);
  await sync(b);
  return id;
}

/**
 * Alice's first device has the recovery key and backed up a message;
 * her second has the key too, but its copy of the history lacks that
 * message, as when moving it failed.
 */
async function laggingDevice() {
  const alice1 = await startChat();
  const bob = await startChat();
  const id = await conversationBetween(alice1, bob);
  await send(alice1, id, "før");
  await sync(bob);
  const code = await createRecoveryKey(alice1);
  await on(alice1, () => alice1.engine.backUp());
  const linked = await link(alice1, true);
  storedJson.set(linked, `history:${id}`, []);
  const alice2 = await reload(linked);
  await send(bob, id, "etter");
  await sync(alice1);
  await sync(alice2);
  expect(await texts(alice2, id)).toEqual(["etter"]);
  return { alice1, alice2, bob, id, code };
}

/** A new device restored with the code, before its history is fetched. */
async function restore(userId: string, code: string): Promise<TestDevice> {
  const device = context(userId);
  const engine = await on(device, () => restoreChat(userId, code));
  if (engine === "wrong_key") throw new Error("wrong key");
  return { ...device, engine };
}

/** What a device restored with the code gets back. */
async function restored(userId: string, code: string, id: string) {
  const device = await restore(userId, code);
  await on(device, () => device.engine.resumeHistory());
  return texts(device, id);
}

/** A backup under Alice's key that points to `archive`'s parts. */
async function pointBackupTo(
  device: TestDevice,
  code: string,
  plaintext: Uint8Array | null,
) {
  const backup = server.recovery.get(device.userId)!;
  const key = (await readRecoveryKey(code))!;
  const opened = await openRecoveryBackup(
    key,
    device.userId,
    fromBase64(backup.backup),
  );
  const archiveId = backup.archiveId!;
  const row = server.archives.get(archiveId)!;
  if (plaintext) {
    const sealed = await sealArchive(plaintext);
    row.parts = sealed.parts.map((part) => toBase64(part));
    backup.backup = toBase64(
      await sealRecoveryBackup(key, {
        account: opened.account,
        pinned: opened.pinned,
        revoked: opened.revoked,
        archive: { archiveId, parts: sealed.parts.length, key: sealed.key },
      }),
    );
  } else {
    row.parts = row.parts.map((part) =>
      toBase64(
        crypto.getRandomValues(new Uint8Array(fromBase64(part!).length)),
      ),
    );
  }
  return backup.backup;
}

/** A device the server certifies under a key of its own for `userId`. */
async function serverOwnedDevice(userId: string) {
  const account = await createAccountKey(userId);
  const device = await createDevice(account);
  return { account, device };
}

describe("the engine against a delivery service that may lie", () => {
  it("delivers messages between two accounts", async () => {
    const alice = await startChat();
    const bob = await startChat();
    const id = await conversationBetween(alice, bob);
    expect(await send(alice, id, "hei")).toBe(true);
    await sync(bob);
    expect(await texts(bob, id)).toEqual(["hei"]);
  });

  describe("security code and a changed account key", () => {
    async function swappedKey() {
      const alice = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice, bob);
      const pinned = await on(alice, () =>
        alice.engine.securityCode(id, bob.userId),
      );

      // The server swaps Bob's account key for one it holds.
      const swap = await serverOwnedDevice(bob.userId);
      server.accountKeys.set(bob.userId, toBase64(swap.account.publicKey));
      await maintain(alice, id);
      return { alice, bob, id, pinned: pinned!, swap };
    }

    it("shows the code of the key that accepting would trust", async () => {
      const { alice, bob, id, pinned, swap } = await swappedKey();
      expect(alice.engine.keyChanged(bob.userId)).toBe(true);

      const shown = await on(alice, () =>
        alice.engine.securityCode(id, bob.userId),
      );
      expect(shown?.pending).toBe(true);
      expect(shown?.key).toBe(toBase64(swap.account.publicKey));
      expect(shown?.code).not.toEqual(pinned.code);
    });

    it("accepts only the key whose code the user was shown", async () => {
      const { alice, bob, id, swap } = await swappedKey();
      const shown = await on(alice, () =>
        alice.engine.securityCode(id, bob.userId),
      );

      // Before the user answers, the server shows yet another key.
      const other = await serverOwnedDevice(bob.userId);
      server.accountKeys.set(bob.userId, toBase64(other.account.publicKey));
      await maintain(alice, id);

      expect(
        await on(alice, () =>
          alice.engine.acceptKeyChange(bob.userId, shown!.key),
        ),
      ).toBe(false);
      expect(alice.engine.keyChanged(bob.userId)).toBe(true);
      const now = await on(alice, () =>
        alice.engine.securityCode(id, bob.userId),
      );
      expect(now?.key).toBe(toBase64(other.account.publicKey));
      expect(now?.key).not.toBe(toBase64(swap.account.publicKey));
    });

    it("accepts no key whose code it did not show", async () => {
      const { alice, bob, id } = await swappedKey();
      const now = await on(alice, () =>
        alice.engine.securityCode(id, bob.userId),
      );
      expect(
        await on(alice, () =>
          alice.engine.acceptKeyChange(bob.userId, now!.key),
        ),
      ).toBe(false);
      expect(alice.engine.keyChanged(bob.userId)).toBe(true);
    });

    it("keeps the code shown until the new one is shown, when the server shows yet another key", async () => {
      const { alice, bob, id, swap } = await swappedKey();
      const first = await on(alice, () =>
        alice.engine.securityCode(id, bob.userId),
      );
      expect(
        await on(alice, () =>
          alice.engine.showSecurityCode(bob.userId, first!.key),
        ),
      ).toBe(true);

      const other = await serverOwnedDevice(bob.userId);
      server.accountKeys.set(bob.userId, toBase64(other.account.publicKey));
      await maintain(alice, id);

      // The page, reloaded or not, still has the code it showed.
      const shown = await on(alice, () =>
        alice.engine.shownSecurityCode(id, bob.userId),
      );
      expect(shown).toEqual(first);
      expect(shown?.key).toBe(toBase64(swap.account.publicKey));
      // Neither the code shown nor the new one is accepted yet.
      for (const key of [first!.key, toBase64(other.account.publicKey)]) {
        expect(
          await on(alice, () => alice.engine.acceptKeyChange(bob.userId, key)),
        ).toBe(false);
      }
      // Only a shown code can be recorded, and only the key waiting.
      expect(
        await on(alice, () =>
          alice.engine.showSecurityCode(bob.userId, first!.key),
        ),
      ).toBe(false);
      const latest = await on(alice, () =>
        alice.engine.securityCode(id, bob.userId),
      );
      await on(alice, () =>
        alice.engine.showSecurityCode(bob.userId, latest!.key),
      );
      expect(
        await on(alice, () =>
          alice.engine.acceptKeyChange(bob.userId, latest!.key),
        ),
      ).toBe(true);
      expect(alice.engine.keyChanged(bob.userId)).toBe(false);
      expect(
        await on(alice, () => alice.engine.shownSecurityCode(id, bob.userId)),
      ).toBeNull();
    });

    it("says nothing is from someone a page shows instead of the one the group is with", async () => {
      const alice = await startChat();
      const bob = await startChat();
      const carol = await startChat();
      const id = await conversationBetween(alice, bob);
      expect(
        await on(alice, () => alice.engine.counterpart(id, [bob.userId])),
      ).toEqual({ userId: bob.userId, elsewhere: false });
      expect(
        await on(alice, () => alice.engine.counterpart(id, [carol.userId])),
      ).toEqual({ userId: null, elsewhere: true });
      // Once marked, the conversation stays so.
      expect(
        (await on(alice, () => alice.engine.status(id, [bob.userId]))).problem,
      ).toBe("other_person");
    });

    it("gives no code for someone who is not in the conversation", async () => {
      const alice = await startChat();
      const bob = await startChat();
      const carol = await startChat();
      const withBob = await conversationBetween(alice, bob);
      await conversationBetween(alice, carol);
      expect(
        await on(alice, () => alice.engine.securityCode(withBob, bob.userId)),
      ).toMatchObject({ pending: false });
      expect(
        await on(alice, () => alice.engine.securityCode(withBob, carol.userId)),
      ).toBeNull();
    });
  });

  describe("whom the page shows the conversation is with", () => {
    it("sends nothing when the page shows someone else than the group is with", async () => {
      const alice = await startChat();
      const bob = await startChat();
      const carol = await startChat();
      const id = await conversationBetween(alice, bob);
      expect(await send(alice, id, "til Bob")).toBe(true);

      // The server tells the page the conversation is with Carol; the
      // group, and the directory, are still Bob's.
      server.conversationFilter = (conversation) => ({
        ...conversation,
        others: conversation.others.map((other) => ({
          ...other,
          userId: carol.userId,
        })),
      });
      const before = server.log.length;
      expect(await send(alice, id, "til den som vises")).toBe(false);
      await sync(alice);
      expect(server.log.slice(before).map((e) => e.type)).not.toContain(
        "application",
      );

      const status = await on(alice, async () =>
        alice.engine.status(id, await shown(alice, id)),
      );
      expect(status.problem).toBe("other_person");
      expect(
        await on(alice, () => alice.engine.securityCode(id, carol.userId)),
      ).toBeNull();

      // Not even when the page shows Bob again: the conversation is marked,
      // and its group is left as it is.
      server.conversationFilter = null;
      expect(await send(alice, id, "senere")).toBe(false);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + chatTuning.rotateAfterMs + 60_000);
      await maintain(alice, id);
      await sync(alice);
      vi.useRealTimers();
      expect(server.log.slice(before)).toEqual([]);
    });
  });

  describe("history a device is given keeps whom it is with", () => {
    /** Alice wrote to Bob, and Bob back if `bobWrites`; it is backed up. */
    async function aliceAndBob(bobWrites: boolean) {
      const alice = await startChat();
      const bob = await startChat();
      const carol = await startChat();
      const id = await conversationBetween(alice, bob);
      await send(alice, id, "fra Alice");
      await sync(bob);
      if (bobWrites) {
        await send(bob, id, "fra Bob");
        await sync(alice);
      }
      const code = await createRecoveryKey(alice);
      await on(alice, () => alice.engine.backUp());
      return { alice, bob, carol, id, code };
    }

    /**
     * From now on the server names Carol in Bob's place: to the page, and
     * in the directory with her own account and devices.
     */
    async function carolInBobsPlace(
      alice: TestDevice,
      bob: TestDevice,
      carol: TestDevice,
    ) {
      const theirs = await conversationBetween(alice, carol);
      const carolAccount = (
        await on(alice, () => server.api.directory(theirs))
      ).accounts.find((account) => account.userId === carol.userId)!;
      server.conversationFilter = (conversation) => ({
        ...conversation,
        others: conversation.others.map((other) =>
          other.userId === bob.userId
            ? { ...other, userId: carol.userId }
            : other,
        ),
      });
      server.directoryFilter = (directory) => ({
        ...directory,
        accounts: directory.accounts.map((account) =>
          account.userId === bob.userId ? carolAccount : account,
        ),
      });
    }

    const given = {
      backup: async (alice: TestDevice, code: string) => {
        const device = await restore(alice.userId, code);
        await on(device, () => device.engine.resumeHistory());
        return device;
      },
      device: (alice: TestDevice) => link(alice, true),
    };

    const senders = async (device: TestDevice, id: string) =>
      (await on(device, () => device.engine.history(id))).map((entry) =>
        entry.own ? "own" : entry.senderUserId,
      );

    for (const from of ["backup", "device"] as const) {
      for (const bobWrites of [true, false]) {
        const what = `${bobWrites ? "history" : "history of only own messages"} from the ${from}`;

        it(`names whom ${what} is with before the device is in its group`, async () => {
          const { alice, bob, id, code } = await aliceAndBob(bobWrites);
          const device = await given[from](alice, code);
          expect(
            await on(device, () => device.engine.counterpart(id, [bob.userId])),
          ).toEqual({ userId: bob.userId, elsewhere: false });
          const status = await on(device, () =>
            device.engine.status(id, [bob.userId]),
          );
          expect(status.joined).toBe(false);
          expect(await senders(device, id)).toEqual(
            bobWrites ? ["own", bob.userId] : ["own"],
          );
        });

        it(`names no one else for ${what}, whatever the server says`, async () => {
          const { alice, bob, carol, id, code } = await aliceAndBob(bobWrites);
          await carolInBobsPlace(alice, bob, carol);
          const device = await given[from](alice, code);
          const shows = await shown(device, id);
          expect(shows).toEqual([carol.userId]);

          // No group here yet: only the history says whom it is with.
          expect(
            await on(device, () => device.engine.counterpart(id, shows)),
          ).toEqual({ userId: null, elsewhere: true });

          // Nor once the device has heard from the server.
          await maintain(device, id).catch(() => undefined);
          await sync(device);
          expect(
            await on(device, () => device.engine.counterpart(id, shows)),
          ).toEqual({ userId: null, elsewhere: true });
          expect(
            await on(device, () =>
              device.engine.securityCode(id, carol.userId),
            ),
          ).toBeNull();
          expect(
            (await on(device, () => device.engine.status(id, shows))).problem,
          ).not.toBeNull();
          expect(await senders(device, id)).toEqual(
            bobWrites ? ["own", bob.userId] : ["own"],
          );
          const before = server.log.length;
          await send(device, id, "til den som vises").catch(() => false);
          await sync(device);
          expect(server.log.slice(before)).toEqual([]);
        });
      }
    }

    it("keeps whom the history is with when the server settled someone else first", async () => {
      const { alice, bob, carol, id, code } = await aliceAndBob(false);
      await carolInBobsPlace(alice, bob, carol);
      const device = await restore(alice.userId, code);
      // The page is opened before the history is here.
      await maintain(device, id).catch(() => undefined);
      await on(device, () => device.engine.resumeHistory());

      // Bob is the one the history is with; the conversation is out of
      // step, so nothing is sent in it, and Carol is named for nothing.
      server.conversationFilter = null;
      expect(
        await on(device, () => device.engine.counterpart(id, [bob.userId])),
      ).toEqual({ userId: bob.userId, elsewhere: false });
      const status = await on(device, () =>
        device.engine.status(id, [bob.userId]),
      );
      expect(status).toMatchObject({ joined: false, problem: "out_of_sync" });
      expect(
        await on(device, () => device.engine.counterpart(id, [carol.userId])),
      ).toEqual({ userId: null, elsewhere: true });
    });

    it("keeps whom the history is with in the backup a device with none makes", async () => {
      const { alice, bob, carol, id, code } = await aliceAndBob(false);
      const linked = await link(alice, false);
      await carolInBobsPlace(alice, bob, carol);
      // The new device settles Carol from the server, then backs up.
      await maintain(linked, id).catch(() => undefined);
      await on(linked, () => linked.engine.backUp()).catch(() => undefined);
      server.conversationFilter = null;
      server.directoryFilter = null;
      const device = await given.backup(alice, code);
      expect(
        await on(device, () => device.engine.counterpart(id, [bob.userId])),
      ).toEqual({ userId: bob.userId, elsewhere: false });
    });

    for (const from of ["backup", "device"] as const) {
      it(`names no one and sends nothing while the history from the ${from} is still to come`, async () => {
        const { alice, bob, carol, id, code } = await aliceAndBob(true);
        await carolInBobsPlace(alice, bob, carol);
        server.failArchiveReads = true;
        const device = await given[from](alice, code);
        expect(await texts(device, id)).toEqual([]);
        const shows = await shown(device, id);

        // The server alone says Carol, so nothing is said to be with her.
        await maintain(device, id).catch(() => undefined);
        await sync(device);
        expect(
          await on(device, () => device.engine.counterpart(id, shows)),
        ).toEqual({ userId: null, elsewhere: false });
        expect(
          await on(device, () => device.engine.securityCode(id, carol.userId)),
        ).toBeUndefined();
        expect(
          (await on(device, () => device.engine.status(id, shows))).joined,
        ).toBe(false);
        const before = server.log.length;
        await send(device, id, "til den som vises").catch(() => false);
        await sync(device);
        expect(server.log.slice(before)).toEqual([]);

        // Once it is in, it is with Bob, and Carol is named for nothing.
        server.failArchiveReads = false;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + chatTuning.historyRetryMs + 1_000);
        await on(device, () => device.engine.resumeHistory());
        vi.useRealTimers();
        expect(await texts(device, id)).toEqual([
          "fra Alice",
          "fra Bob",
          "til den som vises",
        ]);
        expect(
          await on(device, () => device.engine.counterpart(id, shows)),
        ).toEqual({ userId: null, elsewhere: true });
        expect(
          await on(device, () => device.engine.counterpart(id, [bob.userId])),
        ).toEqual({ userId: bob.userId, elsewhere: false });
        await sync(device);
        expect(server.log.slice(before)).toEqual([]);
      });
    }

    for (const from of ["backup", "device"] as const) {
      it(`names no one else for a conversation with no messages from the ${from}`, async () => {
        const alice = await startChat();
        const bob = await startChat();
        const carol = await startChat();
        const id = await conversationBetween(alice, bob);
        const code = await createRecoveryKey(alice);
        await on(alice, () => alice.engine.backUp());
        await carolInBobsPlace(alice, bob, carol);
        const device = await given[from](alice, code);
        const shows = await shown(device, id);

        await maintain(device, id).catch(() => undefined);
        await sync(device);
        expect(
          await on(device, () => device.engine.counterpart(id, shows)),
        ).toEqual({ userId: null, elsewhere: true });
        expect(
          await on(device, () => device.engine.counterpart(id, [bob.userId])),
        ).toEqual({ userId: bob.userId, elsewhere: false });
        const before = server.log.length;
        await send(device, id, "til den som vises").catch(() => false);
        await sync(device);
        expect(server.log.slice(before)).toEqual([]);
      });
    }

    it("still opens history whose device kept a wrong list of whom", async () => {
      const { alice, bob, id } = await aliceAndBob(false);
      const record = `conversation:${id}`;
      storedJson.set(alice, record, {
        ...storedJson.get<object>(alice, record),
        participants: [alice.userId, bob.userId, crypto.randomUUID()],
      });
      const device = await link(await reload(alice), true);
      expect(await texts(device, id)).toEqual(["fra Alice"]);
      expect(
        await on(device, () => device.engine.counterpart(id, [bob.userId])),
      ).toEqual({ userId: null, elsewhere: false });
    });

    describe("an archive from before it kept whom", () => {
      const v1 = (id: string, history: object[]) =>
        utf8(
          JSON.stringify({
            v: 1,
            conversations: [{ id, history, seen: null }],
          }),
        );
      const entry = (senderUserId: string | null, own: boolean) => ({
        id: crypto.randomUUID(),
        senderUserId,
        own,
        text: own ? "fra Alice" : "fra Bob",
        sentAt: new Date().toISOString(),
      });

      it("takes whom from the messages verified to be from the other", async () => {
        const { alice, bob, carol, id, code } = await aliceAndBob(true);
        await pointBackupTo(
          alice,
          code,
          v1(id, [entry(alice.userId, true), entry(bob.userId, false)]),
        );
        const device = await given.backup(alice, code);
        expect(await texts(device, id)).toEqual(["fra Alice", "fra Bob"]);
        expect(
          await on(device, () => device.engine.counterpart(id, [bob.userId])),
        ).toEqual({ userId: bob.userId, elsewhere: false });
        expect(
          await on(device, () => device.engine.counterpart(id, [carol.userId])),
        ).toEqual({ userId: null, elsewhere: true });
      });

      it("takes whom from readable messages only, and only from the other", async () => {
        const { alice, bob, carol, id, code } = await aliceAndBob(true);
        await pointBackupTo(
          alice,
          code,
          v1(id, [
            entry(alice.userId, true),
            // Not read here: said to be from no one, so it names no one.
            { ...entry(carol.userId, false), text: null },
            { ...entry(null, false), text: null },
            // Not own, yet from this account: not the other.
            { ...entry(alice.userId, false), text: "fra Alice" },
            entry(bob.userId, false),
          ]),
        );
        const device = await given.backup(alice, code);
        expect(
          await on(device, () => device.engine.counterpart(id, [bob.userId])),
        ).toEqual({ userId: bob.userId, elsewhere: false });
      });

      it("names no one when the messages are from more than one other", async () => {
        const { alice, bob, carol, id, code } = await aliceAndBob(true);
        await pointBackupTo(
          alice,
          code,
          v1(id, [entry(bob.userId, false), entry(carol.userId, false)]),
        );
        const device = await given.backup(alice, code);
        for (const shows of [[bob.userId], [carol.userId]]) {
          expect(
            await on(device, () => device.engine.counterpart(id, shows)),
          ).toEqual({ userId: null, elsewhere: false });
        }
      });

      it("takes whom from the messages verified to be from the other in moved history", async () => {
        const { alice, bob, carol, id } = await aliceAndBob(true);
        // The approving device's own record, as one from before it kept whom.
        const record = `conversation:${id}`;
        storedJson.set(alice, record, {
          ...storedJson.get<object>(alice, record),
          participants: [],
        });
        const device = await link(await reload(alice), true);
        expect(await texts(device, id)).toEqual(["fra Alice", "fra Bob"]);
        expect(
          await on(device, () => device.engine.counterpart(id, [bob.userId])),
        ).toEqual({ userId: bob.userId, elsewhere: false });
        expect(
          await on(device, () => device.engine.counterpart(id, [carol.userId])),
        ).toEqual({ userId: null, elsewhere: true });
      });

      it("names no one for only own messages until the device settles whom", async () => {
        const { alice, bob, id, code } = await aliceAndBob(false);
        await pointBackupTo(alice, code, v1(id, [entry(alice.userId, true)]));
        const device = await given.backup(alice, code);
        expect(await texts(device, id)).toEqual(["fra Alice"]);
        expect(
          await on(device, () => device.engine.counterpart(id, [bob.userId])),
        ).toEqual({ userId: null, elsewhere: false });
      });
    });
  });

  describe("linking without history", () => {
    async function aliceWithBackup() {
      const alice = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice, bob);
      await send(alice, id, "før koblingen");
      await sync(bob);
      await createRecoveryKey(alice);
      await on(alice, () => alice.engine.backUp());
      return { alice, bob, id };
    }

    it("gives the new device no key to the backup's history", async () => {
      const { alice, id } = await aliceWithBackup();
      const linked = await link(alice, false);

      expect(linked.engine.hasRecoveryKey).toBe(false);
      expect(storedRecord(linked, "recovery")).toBeUndefined();
      expect(await texts(linked, id)).toEqual([]);

      // Whatever it holds, the backup it can fetch does not open with it.
      const recovery = storedRecord(linked, "recovery");
      if (recovery) {
        const backup = await on(linked, () => server.api.recoveryBackup());
        await expect(
          openRecoveryBackup(
            importRecoveryKey(recovery),
            linked.userId,
            fromBase64(backup.backup),
          ),
        ).rejects.toThrow();
      }
    });

    it("still moves the history and the backup key when the user chose it", async () => {
      const { alice, id } = await aliceWithBackup();
      const linked = await link(alice, true);
      expect(linked.engine.hasRecoveryKey).toBe(true);
      expect(await texts(linked, id)).toEqual(["før koblingen"]);
      // It holds the key, so a new key of its own asks nothing.
      await createRecoveryKey(linked);
    });

    it("asks before a new key there ends the backed-up history", async () => {
      const { alice, id } = await aliceWithBackup();
      const linked = await link(alice, false);
      const backup = () => on(alice, () => server.api.recoveryBackup());
      const before = await backup();

      const asked = await on(linked, () => linked.engine.createRecoveryKey());
      if (!("dropsHistory" in asked)) throw new Error("not asked");
      expect(await backup()).toEqual(before);
      expect(alice.engine.hasRecoveryKey).toBe(true);

      // The answer is for that backup: a newer one is asked about again.
      await send(alice, id, "etter spørsmålet");
      await on(alice, () => alice.engine.backUp());
      const again = await on(linked, () =>
        linked.engine.createRecoveryKey(asked.dropsHistory),
      );
      if (!("dropsHistory" in again)) throw new Error("not asked again");
      expect(again.dropsHistory).not.toBe(asked.dropsHistory);

      const made = await on(linked, () =>
        linked.engine.createRecoveryKey(again.dropsHistory),
      );
      expect(made).toEqual({
        code: expect.any(String),
        keyId: expect.any(String),
      });
      expect(linked.engine.hasRecoveryKey).toBe(false);
      await expect(
        activate(linked, shownKey(made), again.dropsHistory),
      ).resolves.toEqual({
        active: true,
      });
      expect(linked.engine.hasRecoveryKey).toBe(true);
    });
  });

  describe("welcomes the server delivers again", () => {
    it("does not take the group back to an earlier epoch", async () => {
      const alice = await startChat();
      const bob = await startChat();
      server.lastResortOnly = true;
      const id = await conversationBetween(alice, bob);
      const [welcome] = server.welcomes.filter(
        (w) => w.to === bob.engine.deviceId,
      );

      // The group moves on: Bob's key rotation, then a message.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + chatTuning.rotateAfterMs + 60_000);
      await maintain(bob, id);
      await sync(alice);
      vi.useRealTimers();

      server.inject(bob.engine.deviceId, welcome!);
      await sync(bob);

      await send(alice, id, "etter gjentatt velkomst");
      await sync(bob);
      expect(await texts(bob, id)).toContain("etter gjentatt velkomst");
    });
  });

  describe("a group state newer than its record", () => {
    it("refuses a welcome to an epoch the stored group has passed", async () => {
      const alice = await startChat();
      const bob = await startChat();
      server.lastResortOnly = true;
      const id = await conversationBetween(alice, bob);
      const [welcome] = server.welcomes.filter(
        (w) => w.to === bob.engine.deviceId,
      );
      const name = `conversation:${id}`;

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + chatTuning.rotateAfterMs + 60_000);
      await maintain(bob, id);
      await sync(alice);
      vi.useRealTimers();
      await sync(bob);

      // The record says less than the group, as if from before the welcome:
      // a write of the one without the other, before they were written
      // together, could leave that.
      storedJson.set(bob, name, {
        ...storedJson.get<object>(bob, name),
        epoch: 0,
      });
      const reloaded = await reload(bob);

      server.inject(bob.engine.deviceId, welcome!);
      await sync(reloaded);
      await send(alice, id, "etter avbrudd og gjentatt velkomst");
      await sync(reloaded);
      expect(await texts(reloaded, id)).toContain(
        "etter avbrudd og gjentatt velkomst",
      );
    });
  });

  describe("sending only when the group is settled", () => {
    it("sends nothing while a contact's changed key is not accepted", async () => {
      const alice = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice, bob);
      // Bob resets private chat on a new device: a new account key.
      const reset = context(bob.userId);
      const bobAgain = {
        ...reset,
        engine: await on(reset, () => createChat(bob.userId, true)),
      };
      await maintain(alice, id);
      expect(alice.engine.keyChanged(bob.userId)).toBe(true);
      const before = server.log.length;

      expect(await send(alice, id, "venter")).toBe(false);
      await sync(alice);
      expect(server.log.slice(before).map((e) => e.type)).not.toContain(
        "application",
      );
      expect(
        (await on(alice, () => alice.engine.history(id))).at(-1)?.unsent,
      ).toBe(true);

      // Once the user accepts the key they were shown, it goes.
      const shown = await on(alice, () =>
        alice.engine.securityCode(id, bob.userId),
      );
      await on(alice, () =>
        alice.engine.showSecurityCode(bob.userId, shown!.key),
      );
      await on(alice, () =>
        alice.engine.acceptKeyChange(bob.userId, shown!.key),
      );
      await sync(bobAgain);
      await sync(alice);
      expect(server.log.slice(before).map((e) => e.type)).toContain(
        "application",
      );
      await sync(bobAgain);
      expect(await texts(bobAgain, id)).toEqual(["venter"]);
    });

    it("removes a revoked device before encrypting to the group", async () => {
      const alice = await startChat();
      const bob1 = await startChat();
      const bob2 = await link(bob1, false);
      const id = await conversationBetween(alice, bob1);
      await sync(bob2);

      // Bob revokes his second device; the server keeps it in the group
      // and passes on the revocation only when asked for the directory.
      server.hideRevocations = false;
      await on(bob1, () => bob1.engine.revokeDevice(bob2.engine.deviceId));
      const revoked = server.devices.get(bob2.engine.deviceId)!;
      server.conversations.get(id)!.members.add(bob2.engine.deviceId);

      await send(alice, id, "ikke til den tapte enheten");
      const sent = server.log.filter((e) => e.type === "application").at(-1)!;

      // A malicious server hands the ciphertext to the revoked device.
      server.revive(revoked.deviceId, bob2.session);
      server.inject(bob2.engine.deviceId, {
        conversationId: id,
        generation: 1,
        type: "application",
        ciphertext: sent.ciphertext,
      });
      await sync(bob2);
      expect(await texts(bob2, id)).not.toContain("ikke til den tapte enheten");
    });
  });

  describe("revocations a new device starts with", () => {
    /**
     * Alice revoked her second device; the server hides that from everyone
     * and leaves the device in the group, where it writes as Alice.
     */
    async function hiddenRevocation() {
      const alice1 = await startChat();
      const alice2 = await link(alice1, false);
      const bob = await startChat();
      const id = await conversationBetween(alice1, bob);
      await sync(alice2);
      server.hideRevocations = true;
      await on(alice1, () =>
        alice1.engine.revokeDevice(alice2.engine.deviceId),
      );
      server.revive(alice2.engine.deviceId, alice2.session);
      return { alice1, alice2, bob, id };
    }

    it("keeps the revocations the approving device knew", async () => {
      const { alice1, alice2, bob, id } = await hiddenRevocation();
      const alice3 = await link(alice1, false);
      await maintain(bob, id);
      await sync(alice3);

      await send(alice2, id, "fra den tilbakekalte enheten");
      await sync(alice3);
      expect(await texts(alice3, id)).not.toContain(
        "fra den tilbakekalte enheten",
      );
    });

    it("keeps the revocations it signed when restoring", async () => {
      const alice1 = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice1, bob);
      const code = await createRecoveryKey(alice1);
      await on(alice1, () => alice1.engine.backUp());

      // Restored elsewhere; the server keeps the old device in the group.
      server.hideRevocations = true;
      const restored = context(alice1.userId);
      const engine = await on(restored, () => restoreChat(alice1.userId, code));
      if (engine === "wrong_key") throw new Error("wrong key");
      const alice2 = { ...restored, engine };
      server.revive(alice1.engine.deviceId, alice1.session);
      await maintain(bob, id);
      await sync(alice2);

      await send(alice1, id, "fra den gamle enheten");
      await sync(alice2);
      expect(await texts(alice2, id)).not.toContain("fra den gamle enheten");
    });

    it("does not let an older backup drop a revocation another device knew", async () => {
      const alice1 = await startChat();
      const bob1 = await startChat();
      const bob2 = await link(bob1, false);
      const id = await conversationBetween(alice1, bob1);
      await sync(bob2);
      await createRecoveryKey(alice1);
      const alice2 = await link(alice1, true);

      // Alice's first device learns that Bob's second was revoked and
      // backs up; then her second, which has not seen it, backs up.
      await on(bob1, () => bob1.engine.revokeDevice(bob2.engine.deviceId));
      await maintain(alice1, id);
      await on(alice1, () => alice1.engine.backUp());
      await on(alice2, () => alice2.engine.backUp());

      const backup = await on(alice2, () => server.api.recoveryBackup());
      const opened = await openRecoveryBackup(
        importRecoveryKey(storedRecord(alice2, "recovery")!),
        alice2.userId,
        fromBase64(backup.backup),
      );
      expect(opened.revoked).toContain(
        JSON.stringify([bob1.userId, bob2.engine.deviceId]),
      );
    });
  });

  describe("a backup that does not lose revocations", () => {
    async function backedUp() {
      const alice = await startChat();
      await createRecoveryKey(alice);
      await on(alice, () => alice.engine.backUp());
      return alice;
    }

    it("does not replace a backup it cannot read", async () => {
      const alice = await backedUp();
      const before = server.recovery.get(alice.userId);

      server.failBackupRead = "network";
      await expect(on(alice, () => alice.engine.backUp())).rejects.toThrow();
      server.failBackupRead = null;
      expect(server.recovery.get(alice.userId)).toEqual(before);

      // Nor one under its key that does not open (changed on the server).
      const changed = {
        ...before!,
        backup: toBase64(crypto.getRandomValues(new Uint8Array(64))),
      };
      server.recovery.set(alice.userId, changed);
      await expect(on(alice, () => alice.engine.backUp())).rejects.toThrow();
      expect(server.recovery.get(alice.userId)).toEqual(changed);
      expect(alice.engine.hasRecoveryKey).toBe(true);
    });

    it("keeps a revocation when another device backs up at the same time", async () => {
      const alice1 = await startChat();
      const bob1 = await startChat();
      const bob2 = await link(bob1, false);
      const id = await conversationBetween(alice1, bob1);
      await sync(bob2);
      await createRecoveryKey(alice1);
      const alice2 = await link(alice1, true);

      // Alice's first device learns that Bob's second was revoked, and
      // backs up while her second, which has not heard of it, does too.
      await on(bob1, () => bob1.engine.revokeDevice(bob2.engine.deviceId));
      await maintain(alice1, id);
      server.beforeBackUp = () => on(alice1, () => alice1.engine.backUp());
      await on(alice2, () => alice2.engine.backUp());

      const backup = await on(alice2, () => server.api.recoveryBackup());
      const opened = await openRecoveryBackup(
        importRecoveryKey(storedRecord(alice2, "recovery")!),
        alice2.userId,
        fromBase64(backup.backup),
      );
      expect(opened.revoked).toContain(
        JSON.stringify([bob1.userId, bob2.engine.deviceId]),
      );
      expect(alice2.engine.hasRecoveryKey).toBe(true);
    });
  });

  describe("the history a backup keeps", () => {
    it("keeps what the backup had when a device with less backs up", async () => {
      const { alice2, id, code } = await laggingDevice();
      await on(alice2, () => alice2.engine.backUp());
      expect(await restored(alice2.userId, code, id)).toEqual(["før", "etter"]);
    });

    it("keeps the backed-up history when a device with less makes a new key", async () => {
      const { alice2, id } = await laggingDevice();
      const code = await createRecoveryKey(alice2);
      expect(await restored(alice2.userId, code, id)).toEqual(["før", "etter"]);
    });

    it("keeps both devices' history when they back up at the same time", async () => {
      const { alice1, alice2, id, code } = await laggingDevice();
      server.beforeBackUp = () => on(alice1, () => alice1.engine.backUp());
      await on(alice2, () => alice2.engine.backUp());
      expect(await restored(alice2.userId, code, id)).toEqual(["før", "etter"]);
    });

    it("backs up again when its archive expired before the backup", async () => {
      const { alice2, id, code } = await laggingDevice();
      server.beforeBackUp = async () => server.expireArchives();
      await on(alice2, () => alice2.engine.backUp());
      expect(await restored(alice2.userId, code, id)).toEqual(["før", "etter"]);
    });

    it("keeps the backup as it was when a new key does not get through", async () => {
      const { alice2, id, code } = await laggingDevice();
      server.failArchives = true;
      await expect(createRecoveryKey(alice2)).rejects.toThrow();
      server.failArchives = false;
      expect(await restored(alice2.userId, code, id)).toEqual(["før"]);
    });

    it("keeps the backed-up history when the answer to a new key is lost", async () => {
      const { alice2, id } = await laggingDevice();
      server.loseNextRecoveryAnswer = true;
      await expect(createRecoveryKey(alice2)).rejects.toThrow();
      // The page closes; the user makes the key again.
      const again = await reload(alice2);
      const code = await createRecoveryKey(again);
      expect(await restored(again.userId, code, id)).toEqual(["før", "etter"]);
    });

    it("keeps the backed-up history if the connection goes as a new key is made", async () => {
      const { alice1, id } = await laggingDevice();
      const code = await createRecoveryKey(alice1);
      // The backup that follows the new key does not get through.
      server.failArchives = true;
      await on(alice1, () => alice1.engine.backUp()).catch(() => undefined);
      server.failArchives = false;
      expect(await restored(alice1.userId, code, id)).toEqual(["før", "etter"]);
    });
  });

  describe("a new key and the code the user keeps", () => {
    const backupOf = (device: TestDevice) =>
      server.recovery.get(device.userId)!;

    it("puts a new key to use only once the user has kept its code", async () => {
      const { alice2 } = await laggingDevice();
      const before = backupOf(alice2).keyId;
      const made = shownKey(await prepare(alice2));
      expect(backupOf(alice2).keyId).toBe(before);
      await activate(alice2, made);
      expect(backupOf(alice2).keyId).not.toBe(before);
    });

    it("restores with the kept code when the answer was lost and the device is gone", async () => {
      const { alice2, id } = await laggingDevice();
      const made = shownKey(await prepare(alice2));
      server.loseNextRecoveryAnswer = true;
      await expect(activate(alice2, made)).rejects.toThrow();
      expect(await restored(alice2.userId, made.code, id)).toEqual([
        "før",
        "etter",
      ]);
    });

    it("keeps backing up under a key the server took though the answer was lost", async () => {
      const { alice2, bob, id } = await laggingDevice();
      const made = shownKey(await prepare(alice2));
      server.loseNextRecoveryAnswer = true;
      await expect(activate(alice2, made)).rejects.toThrow();
      const again = await reload(alice2);
      await send(bob, id, "senere");
      await sync(again);
      await on(again, () => again.engine.backUp());
      expect(again.engine.hasRecoveryKey).toBe(true);
      expect(await restored(again.userId, made.code, id)).toEqual([
        "før",
        "etter",
        "senere",
      ]);
    });

    it("puts to use only the key whose code was shown when two are made at once", async () => {
      const { alice2, id } = await laggingDevice();
      const [first, second] = (
        await Promise.all([prepare(alice2), prepare(alice2)])
      ).map(shownKey);
      await activate(alice2, first!);
      expect(await restored(alice2.userId, first!.code, id)).toEqual([
        "før",
        "etter",
      ]);
      await expect(restored(alice2.userId, second!.code, id)).rejects.toThrow(
        "wrong key",
      );
      // The other code is no longer one that can be put to use.
      await expect(activate(alice2, second!)).rejects.toThrow();
      expect(backupOf(alice2).keyId).toBe(first!.keyId);
    });

    it("puts to use no key whose code it did not show", async () => {
      const { alice2 } = await laggingDevice();
      const before = backupOf(alice2).keyId;
      shownKey(await prepare(alice2));
      await expect(
        activate(alice2, { keyId: toBase64(new Uint8Array(16)) }),
      ).rejects.toThrow();
      expect(backupOf(alice2).keyId).toBe(before);
    });

    it("settles a first key the server took though the answer was lost, once reloaded", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const alice = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice, bob);
      await send(alice, id, "før");
      await sync(bob);
      const made = shownKey(await prepare(alice));
      server.loseNextRecoveryAnswer = true;
      await expect(activate(alice, made)).rejects.toThrow();
      // The server took it.
      expect(backupOf(alice).keyId).toBe(made.keyId);
      expect(backupOf(alice).archiveId).toBeNull();

      // The page is reloaded; the user does nothing.
      const again = await reload(alice);
      await sync(again);
      await vi.waitFor(() => {
        expect(again.engine.hasRecoveryKey).toBe(true);
        expect(backupOf(again).archiveId).not.toBeNull();
      });
      expect(storedNames(again, "recovery-pending:")).toEqual([]);

      // Later history is backed up when due, under the kept code.
      await send(bob, id, "senere");
      vi.setSystemTime(Date.now() + chatTuning.backupEveryMs);
      const backedUp = backupOf(again).archiveId;
      await sync(again);
      await vi.waitFor(() =>
        expect(backupOf(again).archiveId).not.toBe(backedUp),
      );
      expect(await restored(again.userId, made.code, id)).toEqual([
        "før",
        "senere",
      ]);
    });

    it("keeps a key whose request is still on its way when the device tries again", async () => {
      const { alice2, id } = await laggingDevice();
      server.holdNextRecoveryKey = true;
      await expect(createRecoveryKey(alice2)).rejects.toThrow();
      // The page is reloaded and the key made again; the first request is
      // taken right after the second try read the backup.
      const again = await reload(alice2);
      server.afterBackupRead = () => server.heldRecoveryKey!();
      const code = await createRecoveryKey(again);
      expect(await restored(again.userId, code, id)).toEqual(["før", "etter"]);
    });

    it("finishes when an earlier try of the same key is taken late", async () => {
      const { alice2, id } = await laggingDevice();
      const made = shownKey(await prepare(alice2));
      server.holdNextRecoveryKey = true;
      await expect(activate(alice2, made)).rejects.toThrow();
      // The user tries again; the first try is taken after the backup is read.
      server.afterBackupRead = () => server.heldRecoveryKey!();
      await expect(activate(alice2, made)).resolves.toEqual({ active: true });
      expect(await restored(alice2.userId, made.code, id)).toEqual([
        "før",
        "etter",
      ]);
    });

    it("keeps a key sent without an answer until the server can no longer take it", async () => {
      const { alice2 } = await laggingDevice();
      server.holdNextRecoveryKey = true;
      await expect(createRecoveryKey(alice2)).rejects.toThrow();
      const pending = () => storedNames(alice2, "recovery-pending:");
      expect(pending()).toHaveLength(1);
      const again = await reload(alice2);
      // A backup reads the backup the request was sent to replace: it may
      // still be taken.
      await on(again, () => again.engine.backUp());
      expect(pending()).toHaveLength(1);
      await createRecoveryKey(again);
      // Only now can it never be taken.
      await expect(server.heldRecoveryKey!()).rejects.toThrow();
      await on(again, () => again.engine.backUp());
      expect(pending()).toEqual([]);
    });

    it("asks before replacing a backup it cannot open, whatever the server says of its history", async () => {
      const alice1 = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice1, bob);
      await send(alice1, id, "før");
      await createRecoveryKey(alice1);
      await on(alice1, () => alice1.engine.backUp());
      const linked = await link(alice1, false);
      server.hideBackupArchive = true;
      const made = await prepare(linked);
      expect("dropsHistory" in made).toBe(true);
    });

    it("backs up and makes a new key on the same device one at a time", async () => {
      const { alice2, id } = await laggingDevice();
      const [, code] = await Promise.all([
        on(alice2, () => alice2.engine.backUp()),
        createRecoveryKey(alice2),
      ]);
      expect(await restored(alice2.userId, code, id)).toEqual(["før", "etter"]);
    });
  });

  describe("a backup whose history does not open", () => {
    for (const [problem, plaintext] of [
      ["does not decrypt", null],
      ["is not in the expected form", utf8('{"v":2}')],
    ] as const) {
      it(`replaces no backup whose history ${problem}`, async () => {
        const { alice2, code } = await laggingDevice();
        // Any backup the last sync started is done first.
        await on(alice2, () => alice2.engine.backUp());
        const sealed = await pointBackupTo(alice2, code, plaintext);
        await expect(
          on(alice2, () => alice2.engine.backUp()),
        ).rejects.toThrow();
        const made = await prepare(alice2);
        if ("code" in made) {
          await expect(activate(alice2, made)).rejects.toThrow();
        }
        expect(server.recovery.get(alice2.userId)!.backup).toBe(sealed);
      });
    }
  });

  describe("priority 2", () => {
    it("replaces its own keys on schedule, not only when it adds a device", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const alice = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice, bob);
      const commitsBy = (device: TestDevice) =>
        server.log.filter(
          (e) => e.type === "commit" && e.deviceId === device.engine.deviceId,
        ).length;

      // Eight days on, Bob links a device and Alice adds it: no new keys
      // of her own in that commit.
      vi.setSystemTime(Date.now() + 8 * 24 * 3600_000);
      await link(bob, false);
      await maintain(alice, id);
      const afterAdd = commitsBy(alice);

      // A sync now replaces her keys: the last time was eight days ago.
      await sync(alice);
      expect(commitsBy(alice)).toBe(afterAdd + 1);
    });

    it("keeps a commit the server took when the answer was lost", async () => {
      const alice = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice, bob);
      const bob2 = await link(bob, false);

      server.loseNextCommitAnswer = true;
      await expect(maintain(alice, id)).rejects.toThrow();
      // The page is reloaded before the next try.
      const reloaded = await on(alice, () => loadChat(alice.userId));
      if (reloaded.setup !== "ready") throw new Error(reloaded.setup);
      const again = { ...alice, engine: reloaded.engine };
      await sync(bob2);

      await send(bob2, id, "etter avbruddet");
      await sync(again);
      expect(await texts(again, id)).toContain("etter avbruddet");
    });

    it("carries the contacts it writes with when it pins too many to carry", async () => {
      const alice = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice, bob);
      await send(alice, id, "hei");

      // The server makes Alice pin more accounts than a package carries.
      const many = Object.fromEntries(
        await Promise.all(
          Array.from({ length: 1001 }, async () => {
            const { account } = await serverOwnedDevice(crypto.randomUUID());
            return [account.accountId, toBase64(account.publicKey)] as const;
          }),
        ),
      );
      const trust = JSON.parse(fromUtf8(storedRecord(alice, "trust")!)) as {
        accountKeys: Record<string, string>;
      };
      Object.assign(trust.accountKeys, many);
      await on(alice, async () => {
        const store = await (
          await import("./store")
        ).openChatStore(alice.userId);
        await store.putJson("trust", trust);
      });
      const reloaded = await on(alice, () => loadChat(alice.userId));
      if (reloaded.setup !== "ready") throw new Error(reloaded.setup);
      const alice1 = { ...alice, engine: reloaded.engine };

      const alice2 = await link(alice1, false);
      const swap = await serverOwnedDevice(bob.userId);
      server.accountKeys.set(bob.userId, toBase64(swap.account.publicKey));
      await maintain(alice2, id);
      expect(alice2.engine.keyChanged(bob.userId)).toBe(true);
    });
  });
});

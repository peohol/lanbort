import {
  createAccountKey,
  createDevice,
  importRecoveryKey,
  openRecoveryBackup,
} from "@lanbort/e2ee";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromBase64, fromUtf8, toBase64 } from "./bytes";
import {
  type DeviceContext,
  FakeChatServer,
  fake,
  on,
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
const send = (device: TestDevice, id: string, text: string) =>
  on(device, () => device.engine.send(id, text));
const texts = async (device: TestDevice, id: string) =>
  (await on(device, () => device.engine.history(id))).map((e) => e.text);

/** Two accounts in one conversation, every device in the group. */
async function conversationBetween(a: TestDevice, b: TestDevice) {
  const id = server.startConversation(a.userId, b.userId);
  await maintain(a, id);
  await sync(b);
  return id;
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

    it("gives no code for someone who is not in the conversation", async () => {
      const alice = await startChat();
      const bob = await startChat();
      const carol = await startChat();
      const withBob = await conversationBetween(alice, bob);
      await conversationBetween(alice, carol);
      expect(
        await on(alice, () => alice.engine.securityCode(withBob, carol.userId)),
      ).toBeUndefined();
      expect(
        await on(alice, () => alice.engine.securityCode(withBob, bob.userId)),
      ).toMatchObject({ pending: false });
    });
  });

  describe("linking without history", () => {
    async function aliceWithBackup() {
      const alice = await startChat();
      const bob = await startChat();
      const id = await conversationBetween(alice, bob);
      await send(alice, id, "før koblingen");
      await sync(bob);
      await on(alice, () => alice.engine.createRecoveryKey());
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
      const code = await on(alice1, () => alice1.engine.createRecoveryKey());
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
      await on(alice1, () => alice1.engine.createRecoveryKey());
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

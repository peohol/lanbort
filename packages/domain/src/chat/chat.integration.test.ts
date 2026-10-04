import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { deleteOwnAccount } from "../account/deletion";
import { systemActor, type UserActor } from "../actor";
import { executeCommand } from "../commands/command";
import { executeQuery } from "../commands/query";
import { notificationGenerator } from "../notifications/generator";
import { ConsumerRegistry } from "../outbox/consumer";
import { restoreActor } from "../restore/replays";
import { blockUser, liftUserBlock } from "../social/commands";
import {
  encodePrivateMessage,
  encodeWelcome,
  type TestChatAccount,
  type TestChatDevice,
  testChatAccount,
  testChatDevice,
} from "../testing/chat";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { deliverAll } from "../testing/outbox";
import { askObjectQuestion } from "../questions/commands";
import {
  acknowledgeChatInbox,
  claimChatKeyPackages,
  hideChatConversation,
  listChatConversations,
  readChatConversation,
  readChatDirectory,
  readChatInbox,
  sendChatMessage,
  startChatConversation,
  submitChatCommit,
} from "./conversations";
import {
  approveChatLink,
  finishChatLink,
  listChatLinkRequests,
  publishChatKeyPackages,
  readChatLinkStatus,
  readOwnChatDevices,
  registerChatAccount,
  requestChatLink,
  resetChatAccount,
  revokeChatDevice,
} from "./devices";
import {
  chatSessionEnding,
  purgeExpiredChat,
  restartChatGroups,
} from "./maintenance";
import { groupIdOf } from "./model";
import { chatRetentionProcess } from "./policies";

/**
 * WP-43: the server side of private chat (ADR-0010). The server sees only
 * ciphertext; these tests check what it decides: who may act through which
 * device, who may start a conversation, the one-commit-per-epoch order and
 * who gets what delivered — and just as much who does not.
 *
 * The clock starts far ahead, so the group restart and retention jobs here
 * act on this file's rows and not on anything other files make at once
 * (and `pnpm ops:restore finish` in another package leaves these alone).
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const consumers = new ConsumerRegistry([
  chatSessionEnding({ db: () => db }),
  notificationGenerator({ db: () => db }),
]);
const kit = loanTestKit(db, { startInDays: 2000, consumers });
const { run, tick, user, friends } = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const invalid = { code: "invalid_input" };

interface ChatUser {
  actor: UserActor;
  account: TestChatAccount;
  device: TestChatDevice;
}

/** Another sign-in session of the same account. */
const newSession = (actor: UserActor): UserActor => ({
  ...actor,
  authentication: { ...actor.authentication, sessionId: randomUUID() },
});

/** A session the sign-in provider holds, so ending it can be seen. */
async function providerSession(actor: UserActor): Promise<UserActor> {
  const session = newSession(actor);
  const authUser = randomUUID();
  await sql`insert into auth.users (id) values (${authUser}::uuid)`.execute(db);
  await sql`insert into auth.sessions (id, user_id) values (${session.authentication.sessionId}::uuid, ${authUser}::uuid)`.execute(
    db,
  );
  return session;
}

const sessionLives = async (actor: UserActor) =>
  (
    await sql<{
      id: string;
    }>`select id from auth.sessions where id = ${actor.authentication.sessionId}::uuid`.execute(
      db,
    )
  ).rows.length === 1;

async function chatUser(actor?: UserActor): Promise<ChatUser> {
  const me = actor ?? (await user());
  const account = testChatAccount(me.userId);
  const device = testChatDevice(account);
  await run(registerChatAccount, me, {
    accountKey: account.accountKey,
    certificate: device.certificate,
  });

  return { actor: me, account, device };
}

const publish = (who: ChatUser, count = 1) =>
  run(publishChatKeyPackages, who.actor, {
    keyPackages: Array.from({ length: count }, () => who.device.keyPackage()),
  });

const start = (actor: UserActor, other: UserActor, context?: object) =>
  run(startChatConversation, actor, {
    userId: other.userId,
    ...(context ? { context } : {}),
  });

const read = (actor: UserActor, conversationId: string) =>
  executeQuery(tick(), readChatConversation, {
    actor,
    input: { conversationId },
  });

const list = async (actor: UserActor) =>
  (
    await executeQuery(tick(), listChatConversations, { actor, input: {} })
  ).conversations.map(({ conversationId }) => conversationId);

const inbox = async (actor: UserActor) =>
  (await executeQuery(tick(), readChatInbox, { actor, input: {} })).items;

const acknowledge = async (actor: UserActor) => {
  const items = await inbox(actor);
  if (items.length > 0) {
    await run(acknowledgeChatInbox, actor, {
      positions: items.map(({ position }) => position),
    });
  }
  return items;
};

async function commit(
  by: ChatUser,
  conversationId: string,
  options: {
    generation?: number;
    epoch: number;
    add?: string[];
    remove?: string[];
  },
) {
  const generation = options.generation ?? 1;
  const add = options.add ?? [];

  return run(submitChatCommit, by.actor, {
    conversationId,
    generation,
    commit: encodePrivateMessage(
      groupIdOf(conversationId, generation),
      options.epoch,
      "commit",
    ),
    welcome: add.length > 0 ? encodeWelcome() : null,
    addedDeviceIds: add,
    removedDeviceIds: options.remove ?? [],
  });
}

const send = (
  by: ChatUser,
  conversationId: string,
  epoch: number,
  options: { generation?: number; type?: "application" | "commit" } = {},
) =>
  run(sendChatMessage, by.actor, {
    conversationId,
    generation: options.generation ?? 1,
    ciphertext: encodePrivateMessage(
      groupIdOf(conversationId, options.generation ?? 1),
      epoch,
      options.type ?? "application",
    ),
  });

/** Two friends with a device each, in a conversation whose group has both. */
async function pairInConversation() {
  const alice = await chatUser();
  const bob = await chatUser();
  await friends(alice.actor, bob.actor);
  const { conversationId } = await start(alice.actor, bob.actor);
  await publish(bob);
  // The group's first device starts it with the commit that adds the rest.
  const { keyPackages } = await run(claimChatKeyPackages, alice.actor, {
    conversationId,
  });
  expect(keyPackages.map(({ deviceId }) => deviceId)).toEqual([
    bob.device.deviceId,
  ]);
  await commit(alice, conversationId, {
    epoch: 0,
    add: [bob.device.deviceId],
  });
  await acknowledge(bob.actor);

  return { alice, bob, conversationId };
}

describe("devices and the account key (ADR-0010 §3, §5)", () => {
  it("registers the first device in this session, and only once", async () => {
    const alice = await chatUser();

    expect(
      await executeQuery(tick(), readOwnChatDevices, {
        actor: alice.actor,
        input: {},
      }),
    ).toEqual({
      accountKey: alice.account.accountKey,
      currentDeviceId: alice.device.deviceId,
      devices: [
        expect.objectContaining({
          deviceId: alice.device.deviceId,
          certificate: alice.device.certificate,
          revocation: null,
        }),
      ],
    });

    const again = testChatDevice(alice.account);
    await expect(
      run(registerChatAccount, newSession(alice.actor), {
        accountKey: alice.account.accountKey,
        certificate: again.certificate,
      }),
    ).rejects.toMatchObject(conflict);
  });

  it("refuses a certificate not signed by the key it names, or for someone else", async () => {
    const actor = await user();
    const account = testChatAccount(actor.userId);
    const stranger = testChatAccount(actor.userId);
    const forged = {
      ...testChatDevice(stranger).certificate,
      accountKey: account.accountKey,
    };

    await expect(
      run(registerChatAccount, actor, {
        accountKey: account.accountKey,
        certificate: forged,
      }),
    ).rejects.toMatchObject(invalid);

    const other = testChatAccount(randomUUID());
    await expect(
      run(registerChatAccount, actor, {
        accountKey: other.accountKey,
        certificate: testChatDevice(other).certificate,
      }),
    ).rejects.toMatchObject(invalid);
  });

  it("links a new session's device through an existing one", async () => {
    const alice = await chatUser();
    const laptop = newSession(alice.actor);
    const deviceId = randomUUID();
    const deviceKey = testChatDevice(alice.account).deviceKey;
    const linkKey = testChatDevice(alice.account).deviceKey;

    const { linkRequestId, package: none } = await run(
      requestChatLink,
      laptop,
      {
        deviceId,
        deviceKey,
        linkKey,
      },
    );
    expect(none).toBeNull();

    // Only the account's own devices see the request.
    const bob = await chatUser();
    expect(
      await executeQuery(tick(), listChatLinkRequests, {
        actor: bob.actor,
        input: {},
      }),
    ).toEqual({ requests: [] });
    await expect(
      run(approveChatLink, bob.actor, {
        linkRequestId,
        certificate: bob.account.certify(deviceId, deviceKey),
        package: "c2VhbGVk",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      executeQuery(tick(), readChatLinkStatus, {
        actor: alice.actor,
        input: { linkRequestId },
      }),
    ).rejects.toMatchObject(notFound);

    const { requests } = await executeQuery(tick(), listChatLinkRequests, {
      actor: alice.actor,
      input: {},
    });
    expect(requests).toEqual([
      expect.objectContaining({ linkRequestId, deviceId, deviceKey, linkKey }),
    ]);

    // The certificate must be for exactly the requested device and key.
    await expect(
      run(approveChatLink, alice.actor, {
        linkRequestId,
        certificate: alice.account.certify(deviceId, linkKey),
        package: "c2VhbGVk",
      }),
    ).rejects.toMatchObject(invalid);

    await run(approveChatLink, alice.actor, {
      linkRequestId,
      certificate: alice.account.certify(deviceId, deviceKey),
      package: "c2VhbGVk",
    });
    expect(
      await executeQuery(tick(), readChatLinkStatus, {
        actor: laptop,
        input: { linkRequestId },
      }),
    ).toMatchObject({ linkRequestId, package: "c2VhbGVk" });
    await run(finishChatLink, laptop, { linkRequestId });

    const own = await executeQuery(tick(), readOwnChatDevices, {
      actor: laptop,
      input: {},
    });
    expect(own.currentDeviceId).toBe(deviceId);
    expect(own.devices.map((device) => device.deviceId).sort()).toEqual(
      [alice.device.deviceId, deviceId].sort(),
    );

    // A session with a device asks for no link.
    await expect(
      run(requestChatLink, laptop, {
        deviceId: randomUUID(),
        deviceKey,
        linkKey,
      }),
    ).rejects.toMatchObject(conflict);
  });

  it("keeps only key packages the device made for itself", async () => {
    const alice = await chatUser();
    const bob = await chatUser();

    expect(await publish(alice, 3)).toEqual({
      available: 3,
      lastResort: false,
    });
    await expect(
      run(publishChatKeyPackages, alice.actor, {
        keyPackages: [bob.device.keyPackage()],
      }),
    ).rejects.toMatchObject(invalid);
    expect(
      await run(publishChatKeyPackages, alice.actor, {
        keyPackages: [],
        lastResort: alice.device.keyPackage(),
      }),
    ).toEqual({ available: 3, lastResort: true });

    // A session without a device publishes nothing.
    await expect(
      run(publishChatKeyPackages, newSession(alice.actor), {
        keyPackages: [alice.device.keyPackage()],
      }),
    ).rejects.toMatchObject(forbidden);
  });
});

describe("first contact (PS-COM-006, PS-USR-005–006)", () => {
  it("lets friends start one conversation per pair", async () => {
    const alice = await user();
    const bob = await user();
    const eve = await user();

    await expect(start(alice, bob)).rejects.toMatchObject(forbidden);
    await friends(alice, bob);

    const { conversationId } = await start(alice, bob);
    expect(await start(bob, alice)).toEqual({ conversationId });
    expect(await list(bob)).toEqual([conversationId]);
    await expect(read(eve, conversationId)).rejects.toMatchObject(notFound);
    await expect(start(alice, alice)).rejects.toMatchObject(notFound);
    await expect(
      start(alice, { ...eve, userId: randomUUID() }),
    ).rejects.toMatchObject(notFound);
  });

  it("lets a lender answer a loan request in chat, but not the borrower start one", async () => {
    const { owner, borrower, objectId, environmentId } = await kit.published();
    const { requestId } = await kit.ask(
      borrower,
      objectId,
      kit.environmentOrigin(environmentId),
    );
    const context = { kind: "loan_request", requestId };

    await expect(start(borrower, owner, context)).rejects.toMatchObject(
      forbidden,
    );
    const outsider = await user();
    await expect(start(outsider, borrower, context)).rejects.toMatchObject(
      forbidden,
    );

    const { conversationId } = await start(owner, borrower, context);
    // Once it exists, either may come back to it.
    expect(await start(borrower, owner)).toEqual({ conversationId });
  });

  it("lets an owner answer an object question in chat", async () => {
    const { owner, borrower, objectId, environmentId } = await kit.published();
    const { questionId } = await run(askObjectQuestion, borrower, {
      environmentId,
      objectId,
      body: "Følger det med lader?",
    });
    const context = { kind: "object_question", questionId };

    await expect(start(borrower, owner, context)).rejects.toMatchObject(
      forbidden,
    );
    await expect(start(owner, borrower, context)).resolves.toMatchObject({
      conversationId: expect.any(String),
    });
  });

  it("treats a blocked person as no one, and closes the conversation", async () => {
    const { alice, bob, conversationId } = await pairInConversation();

    await run(blockUser, bob.actor, { userId: alice.actor.userId });
    await expect(start(alice.actor, bob.actor)).rejects.toMatchObject(notFound);
    await expect(send(alice, conversationId, 1)).rejects.toMatchObject(
      forbidden,
    );
    // Both still see the conversation they had.
    expect(await read(alice.actor, conversationId)).toMatchObject({
      open: false,
    });

    await run(liftUserBlock, bob.actor, { userId: alice.actor.userId });
    expect(await read(alice.actor, conversationId)).toMatchObject({
      open: true,
    });
    await expect(send(alice, conversationId, 1)).resolves.toMatchObject({
      position: expect.any(String),
    });
  });
});

describe("the group's order and delivery (ADR-0010 §9)", () => {
  it("delivers welcomes, commits and messages only to the group's devices", async () => {
    const alice = await chatUser();
    const bob = await chatUser();
    const eve = await chatUser();
    await friends(alice.actor, bob.actor);
    const { conversationId } = await start(alice.actor, bob.actor);

    await publish(bob, 2);
    const { keyPackages } = await run(claimChatKeyPackages, alice.actor, {
      conversationId,
    });
    expect(keyPackages).toEqual([
      { deviceId: bob.device.deviceId, keyPackage: expect.any(String) },
    ]);

    // Someone else's device is never added, and no device twice.
    await expect(
      commit(alice, conversationId, { epoch: 0, add: [eve.device.deviceId] }),
    ).rejects.toMatchObject(invalid);
    await expect(
      commit(alice, conversationId, {
        epoch: 0,
        add: [bob.device.deviceId, bob.device.deviceId],
      }),
    ).rejects.toMatchObject(invalid);
    await commit(alice, conversationId, {
      epoch: 0,
      add: [bob.device.deviceId],
    });

    const welcomed = await inbox(bob.actor);
    expect(welcomed).toEqual([
      expect.objectContaining({
        conversationId,
        generation: 1,
        type: "welcome",
      }),
    ]);
    expect(await read(bob.actor, conversationId)).toMatchObject({
      epoch: 1,
      joined: true,
      waiting: true,
    });

    await send(alice, conversationId, 1);
    expect((await acknowledge(bob.actor)).map(({ type }) => type)).toEqual([
      "welcome",
      "application",
    ]);
    expect(await inbox(bob.actor)).toEqual([]);
    expect(await inbox(alice.actor)).toEqual([]);
    expect(await inbox(eve.actor)).toEqual([]);

    // A fetched message is gone from the server.
    const left = await db
      .selectFrom("app.chat_messages")
      .select("id")
      .where("conversation_id", "=", conversationId)
      .execute();
    expect(left).toEqual([]);

    await expect(send(eve, conversationId, 1)).rejects.toMatchObject(notFound);
    await expect(
      executeQuery(tick(), readChatDirectory, {
        actor: eve.actor,
        input: { conversationId },
      }),
    ).rejects.toMatchObject(notFound);
  });

  it("accepts exactly one commit per epoch", async () => {
    const { alice, bob, conversationId } = await pairInConversation();

    await commit(bob, conversationId, { epoch: 1 });
    await expect(
      commit(alice, conversationId, { epoch: 1 }),
    ).rejects.toMatchObject(conflict);
    await expect(send(alice, conversationId, 1)).rejects.toMatchObject(
      conflict,
    );

    expect((await acknowledge(alice.actor)).map(({ type }) => type)).toEqual([
      "commit",
    ]);
    await expect(commit(alice, conversationId, { epoch: 2 })).resolves.toEqual({
      generation: 1,
      epoch: 3,
    });
  });

  it("refuses messages for another group, a proposal or a commit sent as a message", async () => {
    const { alice, conversationId } = await pairInConversation();
    const other = randomUUID();

    await expect(
      run(sendChatMessage, alice.actor, {
        conversationId,
        generation: 1,
        ciphertext: encodePrivateMessage(groupIdOf(other, 1), 1, "application"),
      }),
    ).rejects.toMatchObject(invalid);
    await expect(
      send(alice, conversationId, 1, { type: "commit" }),
    ).rejects.toMatchObject(invalid);
    await expect(
      run(sendChatMessage, alice.actor, {
        conversationId,
        generation: 1,
        ciphertext: encodePrivateMessage(
          groupIdOf(conversationId, 1),
          1,
          "proposal",
        ),
      }),
    ).rejects.toMatchObject(invalid);
    await expect(
      run(sendChatMessage, alice.actor, {
        conversationId,
        generation: 1,
        ciphertext: encodePrivateMessage(
          groupIdOf(conversationId, 1),
          1,
          "application",
          64 * 1024,
        ),
      }),
    ).rejects.toMatchObject(invalid);
  });

  it("hides a conversation for one participant until a new message", async () => {
    const { alice, bob, conversationId } = await pairInConversation();

    await run(hideChatConversation, bob.actor, { conversationId });
    expect(await list(bob.actor)).toEqual([]);
    expect(await list(alice.actor)).toEqual([conversationId]);

    await send(alice, conversationId, 1);
    expect(await list(bob.actor)).toEqual([conversationId]);
  });
});

describe("revoking and resetting (ADR-0010 §7–8)", () => {
  it("shuts a revoked device out at once", async () => {
    const { alice, bob, conversationId } = await pairInConversation();
    const revocation = bob.account.revoke(bob.device.deviceId);

    await expect(
      run(revokeChatDevice, alice.actor, { revocation }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(revokeChatDevice, bob.actor, {
        revocation: alice.account.revoke(bob.device.deviceId),
      }),
    ).rejects.toMatchObject(invalid);

    await send(alice, conversationId, 1);
    await run(revokeChatDevice, bob.actor, { revocation });

    await expect(inbox(bob.actor)).rejects.toMatchObject(forbidden);
    await expect(send(bob, conversationId, 1)).rejects.toMatchObject(forbidden);
    const left = await db
      .selectFrom("app.chat_deliveries")
      .select("message_id")
      .where("device_id", "=", bob.device.deviceId)
      .execute();
    expect(left).toEqual([]);

    const directory = await executeQuery(tick(), readChatDirectory, {
      actor: alice.actor,
      input: { conversationId },
    });
    expect(directory.members).toEqual([alice.device.deviceId]);
    expect(
      directory.accounts
        .find(({ userId }) => userId === bob.actor.userId)
        ?.devices.map(({ revocation: r }) => r),
    ).toEqual([revocation]);
  });

  it("signs a revoked device's session out, and keeps a session with a new device", async () => {
    const phone = await providerSession(await user());
    const alice = await chatUser(phone);
    const laptop = await providerSession(phone);
    const laptopDevice = testChatDevice(alice.account);
    const { linkRequestId } = await run(requestChatLink, laptop, {
      deviceId: laptopDevice.deviceId,
      deviceKey: laptopDevice.deviceKey,
      linkKey: laptopDevice.deviceKey,
    });
    await run(approveChatLink, phone, {
      linkRequestId,
      certificate: laptopDevice.certificate,
      package: "c2VhbGVk",
    });

    await run(revokeChatDevice, phone, {
      revocation: alice.account.revoke(laptopDevice.deviceId),
    });
    await deliverAll(db, consumers);
    expect(await sessionLives(laptop)).toBe(false);
    expect(await sessionLives(phone)).toBe(true);

    // A reset from this session gives it a new device; the session stays.
    const account = testChatAccount(phone.userId);
    await run(resetChatAccount, phone, {
      accountKey: account.accountKey,
      certificate: testChatDevice(account).certificate,
    });
    await deliverAll(db, consumers);
    expect(await sessionLives(phone)).toBe(true);

    // The account is told, by the app and by e-mail (ADR-0010 §8).
    const told = await db
      .selectFrom("app.notifications")
      .select(["kind", "level"])
      .where("recipient_id", "=", phone.userId)
      .execute();
    expect(told).toEqual([
      { kind: "chat.account_key_reset", level: "required" },
    ]);
  });

  it("signs a revoked device's session out even if it resets first", async () => {
    const phone = await providerSession(await user());
    const alice = await chatUser(phone);
    const stolen = await providerSession(phone);
    const stolenDevice = testChatDevice(alice.account);
    const { linkRequestId } = await run(requestChatLink, stolen, {
      deviceId: stolenDevice.deviceId,
      deviceKey: stolenDevice.deviceKey,
      linkKey: stolenDevice.deviceKey,
    });
    await run(approveChatLink, phone, {
      linkRequestId,
      certificate: stolenDevice.certificate,
      package: "c2VhbGVk",
    });
    await run(revokeChatDevice, phone, {
      revocation: alice.account.revoke(stolenDevice.deviceId),
    });

    // Before the session is ended, the stolen session resets the account.
    const account = testChatAccount(phone.userId);
    await run(resetChatAccount, stolen, {
      accountKey: account.accountKey,
      certificate: testChatDevice(account).certificate,
    });
    await deliverAll(db, consumers);
    expect(await sessionLives(stolen)).toBe(false);
  });

  it("replaces the account key, shuts out every device, and lets the group restart", async () => {
    const { alice, bob, conversationId } = await pairInConversation();

    await expect(
      run(resetChatAccount, alice.actor, {
        accountKey: alice.account.accountKey,
        certificate: testChatDevice(alice.account).certificate,
      }),
    ).rejects.toMatchObject(conflict);

    const resets = async (who: ChatUser) => {
      const account = testChatAccount(who.actor.userId);
      const device = testChatDevice(account);
      await run(resetChatAccount, who.actor, {
        accountKey: account.accountKey,
        certificate: device.certificate,
      });
      return { actor: who.actor, account, device };
    };

    const alice2 = await resets(alice);
    // Bob is still in the group: he adds Alice's new device, removing the old.
    await publish(alice2);
    await commit(bob, conversationId, {
      epoch: 1,
      add: [alice2.device.deviceId],
      remove: [alice.device.deviceId],
    });
    expect((await inbox(alice2.actor)).map(({ type }) => type)).toEqual([
      "welcome",
    ]);

    // With no live device left, a device starts the next generation.
    const bob2 = await resets(bob);
    await resets(alice2);
    await expect(
      commit(bob2, conversationId, { epoch: 2 }),
    ).rejects.toMatchObject(conflict);
    await publish(bob2);
    await expect(
      commit(bob2, conversationId, { generation: 2, epoch: 0 }),
    ).resolves.toEqual({ generation: 2, epoch: 1 });
  });
});

describe("retention and restore (ADR-0010 §8–9)", () => {
  it("deletes what no device fetched in time, and restarts groups after a restore", async () => {
    const { alice, bob, conversationId } = await pairInConversation();
    await send(alice, conversationId, 1);

    kit.advanceDays(31);
    await executeCommand(tick(), purgeExpiredChat, {
      actor: systemActor(chatRetentionProcess),
      input: {},
    });
    expect(await inbox(bob.actor)).toEqual([]);

    await executeCommand(tick(), restartChatGroups, {
      actor: restoreActor,
      input: {},
    });
    expect(await read(alice.actor, conversationId)).toMatchObject({
      generation: 2,
      epoch: 0,
      joined: false,
    });
    await expect(
      commit(alice, conversationId, { generation: 2, epoch: 0 }),
    ).resolves.toEqual({ generation: 2, epoch: 1 });
  });

  it("deletes a deleted account's chat identity, leaving the conversation", async () => {
    const { alice, bob, conversationId } = await pairInConversation();
    await send(alice, conversationId, 1);

    await run(deleteOwnAccount, bob.actor, {});

    const devices = await db
      .selectFrom("app.chat_devices")
      .select("id")
      .where("user_id", "=", bob.actor.userId)
      .execute();
    expect(devices).toEqual([]);
    expect(await read(alice.actor, conversationId)).toMatchObject({
      conversationId,
      open: false,
    });
  });
});

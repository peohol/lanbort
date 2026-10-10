import { randomBytes, randomUUID } from "node:crypto";
import { chatLimits } from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { deleteOwnAccount } from "../account/deletion";
import { systemActor, type UserActor } from "../actor";
import { executeCommand } from "../commands/command";
import { executeQuery } from "../commands/query";
import { readNotificationCentre } from "../notification-centre/queries";
import { setNotificationPreference } from "../notifications/commands";
import { notificationGenerator } from "../notifications/generator";
import { chatMessageEmailDelayMs } from "../notifications/store";
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
import {
  connectAdminTestDatabase,
  connectTestDatabase,
} from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { deliverAll } from "../testing/outbox";
import { askObjectQuestion } from "../questions/commands";
import {
  acknowledgeChatInbox,
  claimChatKeyPackages,
  hideChatConversation,
  listChatConversations,
  muteChatConversation,
  readChatContact,
  readChatConversation,
  readChatDirectory,
  readChatInbox,
  readChatMessageNotifications,
  sendChatMessage,
  startChatConversation,
  submitChatCommit,
} from "./conversations";
import {
  createChatArchive,
  deleteChatArchive,
  putChatArchivePart,
  readChatArchivePart,
} from "./archives";
import {
  approveChatLink,
  declineChatLink,
  finishChatLink,
  listChatLinkRequests,
  publishChatKeyPackages,
  readChatLinkStatus,
  readOwnChatDevices,
  renewChatSession,
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
import {
  answerChatRecoveryPrompt,
  backUpChatHistory,
  createChatRecoveryKey,
  readChatRecoveryBackup,
  restoreChatAccount,
} from "./recovery";
import { chatRetention, groupIdOf } from "./model";
import { chatRetentionProcess } from "./policies";

/** A link request's commitment; the server stores it as it is (ADR-0010 §5). */
const linkCommitment = Buffer.alloc(32, 7).toString("base64");

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
// Auth's sessions are out of the server role's reach.
const admin = connectAdminTestDatabase();
afterAll(() => Promise.all([db.destroy(), admin.destroy()]));

const consumers = new ConsumerRegistry([
  chatSessionEnding({ db: () => db }),
  notificationGenerator({ db: () => db }),
]);
const kit = loanTestKit(db, { startInDays: 2000, consumers });
const { run, tick, now, user, friends } = kit;

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
  await sql`insert into auth.users (id) values (${authUser}::uuid)`.execute(
    admin,
  );
  await sql`insert into auth.sessions (id, user_id) values (${session.authentication.sessionId}::uuid, ${authUser}::uuid)`.execute(
    admin,
  );
  return session;
}

const sessionLives = async (actor: UserActor) =>
  (
    await sql<{
      id: string;
    }>`select id from auth.sessions where id = ${actor.authentication.sessionId}::uuid`.execute(
      admin,
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

const contact = (
  actor: UserActor,
  other: UserActor,
  context?: Record<string, string>,
) =>
  executeQuery(tick(), readChatContact, {
    actor,
    input: { userId: other.userId, ...(context && { context }) },
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
      recovery: null,
      recoveryReminder: false,
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

  it("keeps the device when a re-authentication renews the session, and ends the old one", async () => {
    const old = await providerSession(await user());
    const alice = await chatUser(old);
    const renewed = newSession(alice.actor);
    const current = (actor: UserActor) =>
      executeQuery(tick(), readOwnChatDevices, { actor, input: {} }).then(
        ({ currentDeviceId }) => currentDeviceId,
      );
    const deviceId = await current(old);
    expect(deviceId).not.toBeNull();

    await renewChatSession(
      db,
      alice.actor.userId,
      old.authentication.sessionId,
      renewed.authentication.sessionId,
    );

    expect(await current(renewed)).toBe(deviceId);
    expect(await current(old)).toBeNull();
    expect(await sessionLives(old)).toBe(false);

    // Another account's device in a session of the same id stays put.
    const bob = await chatUser();
    await renewChatSession(
      db,
      alice.actor.userId,
      bob.actor.authentication.sessionId,
      randomUUID(),
    );
    expect(await current(bob.actor)).not.toBeNull();
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
        commitment: linkCommitment,
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

    // An approved device always alerts its owner, even though the owner
    // authorized it. Redelivering the outbox cannot create another notice.
    await deliverAll(db, consumers);
    await deliverAll(db, consumers);
    const security = await db
      .selectFrom("app.notifications")
      .select(["kind", "level", "target_type", "target_id"])
      .where("recipient_id", "=", alice.actor.userId)
      .where("kind", "=", "chat.device_linked")
      .execute();
    expect(security).toEqual([
      {
        kind: "chat.device_linked",
        level: "required",
        target_type: "chat_device",
        target_id: deviceId,
      },
    ]);
    const unrelated = await db
      .selectFrom("app.notifications")
      .select("id")
      .where("recipient_id", "=", bob.actor.userId)
      .where("kind", "=", "chat.device_linked")
      .execute();
    expect(unrelated).toEqual([]);
    const queuedEmail = await db
      .selectFrom("app.notification_deliveries as delivery")
      .innerJoin(
        "app.notifications as notice",
        "notice.id",
        "delivery.notification_id",
      )
      .select("delivery.channel")
      .where("notice.recipient_id", "=", alice.actor.userId)
      .where("notice.kind", "=", "chat.device_linked")
      .execute();
    expect(queuedEmail).toEqual([{ channel: "email" }]);

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
        commitment: linkCommitment,
      }),
    ).rejects.toMatchObject(conflict);
  });

  it("declines a device that waits to be linked, which may then ask again", async () => {
    const alice = await chatUser();
    const laptop = newSession(alice.actor);
    const deviceId = randomUUID();
    const deviceKey = testChatDevice(alice.account).deviceKey;
    const ask = () =>
      run(requestChatLink, laptop, {
        deviceId,
        deviceKey,
        linkKey: deviceKey,
        commitment: linkCommitment,
      });
    const status = (linkRequestId: string) =>
      executeQuery(tick(), readChatLinkStatus, {
        actor: laptop,
        input: { linkRequestId },
      });
    const pending = async () =>
      (
        await executeQuery(tick(), listChatLinkRequests, {
          actor: alice.actor,
          input: {},
        })
      ).requests.map((request) => request.linkRequestId);

    const { linkRequestId, declined } = await ask();
    expect(declined).toBe(false);

    // Only a device of the same account declines, and not the new one
    // itself, which has no device yet.
    const bob = await chatUser();
    await expect(
      run(declineChatLink, bob.actor, { linkRequestId, deviceId }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(declineChatLink, laptop, { linkRequestId, deviceId }),
    ).rejects.toMatchObject(forbidden);

    await run(declineChatLink, alice.actor, { linkRequestId, deviceId });
    expect(await status(linkRequestId)).toMatchObject({
      package: null,
      declined: true,
    });
    expect(await pending()).toEqual([]);
    // Declined twice is declined once.
    await run(declineChatLink, alice.actor, { linkRequestId, deviceId });

    // It can no longer be approved, nor get a history archive.
    await expect(
      run(approveChatLink, alice.actor, {
        linkRequestId,
        certificate: alice.account.certify(deviceId, deviceKey),
        package: "c2VhbGVk",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(createChatArchive, alice.actor, {
        purpose: "link",
        linkRequestId,
        partCount: 1,
      }),
    ).rejects.toMatchObject(conflict);

    // A new code is a new request, which can be approved.
    const again = await ask();
    expect(again.declined).toBe(false);
    expect(await pending()).toEqual([again.linkRequestId]);
    await run(approveChatLink, alice.actor, {
      linkRequestId: again.linkRequestId,
      certificate: alice.account.certify(deviceId, deviceKey),
      package: "c2VhbGVk",
    });
    // One approved meanwhile, say from another device while the sheet was
    // open, is not declined, and says so instead of looking declined.
    await expect(
      run(declineChatLink, alice.actor, {
        linkRequestId: again.linkRequestId,
        deviceId,
      }),
    ).rejects.toMatchObject(conflict);
    expect(await status(again.linkRequestId)).toMatchObject({
      package: "c2VhbGVk",
      declined: false,
    });
    // The database keeps a request to one answer.
    await expect(
      sql`update app.chat_link_requests set declined_at = now()
          where id = ${again.linkRequestId}`.execute(db),
    ).rejects.toThrow(/chat_link_requests_one_answer/);
    // Linked, the request is gone, and the device still says it was
    // approved, to its own account only.
    await run(finishChatLink, laptop, { linkRequestId: again.linkRequestId });
    await expect(
      run(declineChatLink, alice.actor, {
        linkRequestId: again.linkRequestId,
        deviceId,
      }),
    ).rejects.toMatchObject(conflict);
    await expect(
      run(declineChatLink, bob.actor, {
        linkRequestId: again.linkRequestId,
        deviceId,
      }),
    ).rejects.toMatchObject(notFound);

    // One that expired unanswered is gone, and was never approved.
    const tablet = randomUUID();
    await run(requestChatLink, newSession(alice.actor), {
      deviceId: tablet,
      deviceKey,
      linkKey: deviceKey,
      commitment: linkCommitment,
    });
    const [expired] = await pending();
    kit.advance(chatRetention.linkRequestMs + 1);
    await expect(
      run(declineChatLink, alice.actor, {
        linkRequestId: expired!,
        deviceId: tablet,
      }),
    ).rejects.toMatchObject(notFound);
  });

  it("links no more devices than a restore can revoke at once", async () => {
    const alice = await chatUser();
    const { account_key_id } = await db
      .selectFrom("app.chat_devices")
      .select("account_key_id")
      .where("id", "=", alice.device.deviceId)
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.chat_devices")
      .values(
        Array.from({ length: chatLimits.devicesPerAccount - 1 }, () => ({
          id: randomUUID(),
          user_id: alice.actor.userId,
          account_key_id,
          session_id: randomUUID(),
          device_key: randomBytes(32),
          certificate_signature: randomBytes(64),
        })),
      )
      .execute();

    const laptop = newSession(alice.actor);
    const deviceId = randomUUID();
    const deviceKey = testChatDevice(alice.account).deviceKey;
    const { linkRequestId } = await run(requestChatLink, laptop, {
      deviceId,
      deviceKey,
      linkKey: deviceKey,
      commitment: linkCommitment,
    });
    await expect(
      run(approveChatLink, alice.actor, {
        linkRequestId,
        certificate: alice.account.certify(deviceId, deviceKey),
        package: "c2VhbGVk",
      }),
    ).rejects.toMatchObject(conflict);
  });

  it("moves the history to a new device through an archive only it can fetch", async () => {
    const alice = await chatUser();
    const laptop = newSession(alice.actor);
    const deviceId = randomUUID();
    const deviceKey = testChatDevice(alice.account).deviceKey;
    const part = (byte: number) => Buffer.alloc(32, byte).toString("base64");
    const readPart = (actor: UserActor, archiveId: string, index: number) =>
      executeQuery(tick(), readChatArchivePart, {
        actor,
        input: { archiveId, part: index },
      });

    const forLink = (linkRequestId: string, partCount: number) => ({
      purpose: "link" as const,
      linkRequestId,
      partCount,
    });

    // An archive is only for a device that waits to be linked.
    await expect(
      run(createChatArchive, alice.actor, forLink(randomUUID(), 2)),
    ).rejects.toMatchObject(conflict);
    const { linkRequestId } = await run(requestChatLink, laptop, {
      deviceId,
      deviceKey,
      linkKey: deviceKey,
      commitment: linkCommitment,
    });
    await expect(
      run(createChatArchive, laptop, forLink(linkRequestId, 2)),
    ).rejects.toMatchObject(forbidden);
    const { archiveId: replaced } = await run(
      createChatArchive,
      alice.actor,
      forLink(linkRequestId, 1),
    );
    const { archiveId } = await run(
      createChatArchive,
      alice.actor,
      forLink(linkRequestId, 2),
    );
    await expect(
      run(putChatArchivePart, alice.actor, {
        archiveId: replaced,
        part: 0,
        data: part(1),
      }),
    ).rejects.toMatchObject(notFound);

    // Someone else neither writes, reads nor removes it, nor makes one
    // for this account's link request.
    const bob = await chatUser();
    await expect(
      run(createChatArchive, bob.actor, forLink(linkRequestId, 1)),
    ).rejects.toMatchObject(conflict);
    await expect(
      run(putChatArchivePart, bob.actor, { archiveId, part: 0, data: part(9) }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(deleteChatArchive, bob.actor, { archiveId }),
    ).rejects.toMatchObject(notFound);

    await expect(
      run(putChatArchivePart, alice.actor, {
        archiveId,
        part: 0,
        data: part(1),
      }),
    ).resolves.toEqual({ complete: false });
    await expect(
      run(putChatArchivePart, alice.actor, {
        archiveId,
        part: 0,
        data: part(2),
      }),
    ).rejects.toMatchObject(conflict);
    await expect(
      run(putChatArchivePart, alice.actor, {
        archiveId,
        part: 2,
        data: part(2),
      }),
    ).rejects.toMatchObject(notFound);
    // Nothing can be read before every part is in.
    await expect(readPart(alice.actor, archiveId, 0)).rejects.toMatchObject(
      notFound,
    );
    await expect(
      run(putChatArchivePart, alice.actor, {
        archiveId,
        part: 1,
        data: part(2),
      }),
    ).resolves.toEqual({ complete: true });
    await expect(
      run(putChatArchivePart, alice.actor, {
        archiveId,
        part: 1,
        data: part(3),
      }),
    ).rejects.toMatchObject(notFound);

    await run(approveChatLink, alice.actor, {
      linkRequestId,
      certificate: alice.account.certify(deviceId, deviceKey),
      package: "c2VhbGVk",
    });
    await expect(readPart(bob.actor, archiveId, 0)).rejects.toMatchObject(
      notFound,
    );
    await expect(readPart(laptop, archiveId, 0)).resolves.toEqual({
      data: part(1),
    });
    await expect(readPart(laptop, archiveId, 1)).resolves.toEqual({
      data: part(2),
    });
    await run(deleteChatArchive, laptop, { archiveId });
    await expect(readPart(laptop, archiveId, 0)).rejects.toMatchObject(
      notFound,
    );
  });

  it("keeps each device's archive when two are linked at the same time", async () => {
    const alice = await chatUser();
    const linking = await Promise.all(
      [newSession(alice.actor), newSession(alice.actor)].map(async (actor) => {
        const deviceId = randomUUID();
        const deviceKey = testChatDevice(alice.account).deviceKey;
        const { linkRequestId } = await run(requestChatLink, actor, {
          deviceId,
          deviceKey,
          linkKey: deviceKey,
          commitment: linkCommitment,
        });
        return { actor, deviceId, deviceKey, linkRequestId };
      }),
    );

    // The first is approved with its archive before the second gets one.
    const archives: string[] = [];
    for (const [index, link] of linking.entries()) {
      const { archiveId } = await run(createChatArchive, alice.actor, {
        purpose: "link",
        linkRequestId: link.linkRequestId,
        partCount: 1,
      });
      await run(putChatArchivePart, alice.actor, {
        archiveId,
        part: 0,
        data: Buffer.alloc(16, index).toString("base64"),
      });
      await run(approveChatLink, alice.actor, {
        linkRequestId: link.linkRequestId,
        certificate: alice.account.certify(link.deviceId, link.deviceKey),
        package: "c2VhbGVk",
      });
      archives.push(archiveId);
    }

    for (const [index, link] of linking.entries()) {
      await expect(
        executeQuery(tick(), readChatArchivePart, {
          actor: link.actor,
          input: { archiveId: archives[index]!, part: 0 },
        }),
      ).resolves.toEqual({ data: Buffer.alloc(16, index).toString("base64") });
    }
  });

  it("lets a history archive expire with the retention job", async () => {
    const alice = await chatUser();
    const laptop = newSession(alice.actor);
    const deviceKey = testChatDevice(alice.account).deviceKey;
    const { linkRequestId } = await run(requestChatLink, laptop, {
      deviceId: randomUUID(),
      deviceKey,
      linkKey: deviceKey,
      commitment: linkCommitment,
    });
    const { archiveId } = await run(createChatArchive, alice.actor, {
      purpose: "link",
      linkRequestId,
      partCount: 1,
    });

    kit.advanceDays(1);
    await expect(
      run(putChatArchivePart, alice.actor, {
        archiveId,
        part: 0,
        data: Buffer.alloc(16).toString("base64"),
      }),
    ).rejects.toMatchObject(notFound);
    await executeCommand(tick(), purgeExpiredChat, {
      actor: systemActor(chatRetentionProcess),
      input: {},
    });
    const left = await db
      .selectFrom("app.chat_archives")
      .select("id")
      .where("id", "=", archiveId)
      .execute();
    expect(left).toEqual([]);
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

  it("tells a page where the caller can write, by the same rules", async () => {
    const none = { conversationId: null, canStart: false };
    const alice = await user();
    const bob = await user();

    expect(await contact(alice, bob)).toEqual(none);
    expect(await contact(alice, alice)).toEqual(none);
    await friends(alice, bob);
    expect(await contact(alice, bob)).toEqual({
      conversationId: null,
      canStart: true,
    });
    const { conversationId } = await start(alice, bob);
    expect(await contact(bob, alice)).toEqual({
      conversationId,
      canStart: false,
    });

    // A received request lets the lender start it, never the borrower.
    const { owner, borrower, objectId, environmentId } = await kit.published();
    const { requestId } = await kit.ask(
      borrower,
      objectId,
      kit.environmentOrigin(environmentId),
    );
    const context = { kind: "loan_request", requestId };
    expect(await contact(borrower, owner, context)).toEqual(none);
    expect(await contact(owner, borrower)).toEqual(none);
    expect(await contact(owner, borrower, context)).toEqual({
      conversationId: null,
      canStart: true,
    });

    // A block either way hides even the conversation they had.
    await run(blockUser, bob, { userId: alice.userId });
    expect(await contact(alice, bob)).toEqual(none);
    expect(await contact(bob, alice)).toEqual(none);
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

    // A live device is never removed, the other's or one's own.
    for (const live of [alice.device.deviceId, bob.device.deviceId]) {
      await expect(
        commit(bob, conversationId, { epoch: 1, remove: [live] }),
      ).rejects.toMatchObject(invalid);
    }
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
      commitment: linkCommitment,
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

    // The key reset gets its own alert, in addition to the earlier notice
    // about linking a new device (PS-COM-016, ADR-0010 §8).
    const told = await db
      .selectFrom("app.notifications")
      .select(["kind", "level"])
      .where("recipient_id", "=", phone.userId)
      .where("kind", "=", "chat.account_key_reset")
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
      commitment: linkCommitment,
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

describe("the recovery key (ADR-0010 §8, PS-COM-019)", () => {
  const bytes = (length: number, byte: number) =>
    Buffer.alloc(length, byte).toString("base64");
  const keyA = bytes(16, 1);
  const keyB = bytes(16, 2);
  const backup = (byte: number) => bytes(64, byte);
  const purge = () =>
    executeCommand(tick(), purgeExpiredChat, {
      actor: systemActor(chatRetentionProcess),
      input: {},
    });
  const archiveExists = async (archiveId: string) =>
    (await db
      .selectFrom("app.chat_archives")
      .select("id")
      .where("id", "=", archiveId)
      .executeTakeFirst()) !== undefined;
  const readBackup = (actor: UserActor) =>
    executeQuery(tick(), readChatRecoveryBackup, { actor, input: {} });
  const devices = (actor: UserActor) =>
    executeQuery(tick(), readOwnChatDevices, { actor, input: {} });

  /** A complete backup archive of one part, from the user's device. */
  async function backupArchive(who: ChatUser) {
    const { archiveId } = await run(createChatArchive, who.actor, {
      partCount: 1,
      purpose: "backup",
    });
    await run(putChatArchivePart, who.actor, {
      archiveId,
      part: 0,
      data: bytes(32, 7),
    });
    return archiveId;
  }

  it("is made on a device and its backup kept up to date by the key's devices", async () => {
    const alice = await chatUser();
    await expect(
      run(createChatRecoveryKey, newSession(alice.actor), {
        keyId: keyA,
        backup: backup(1),
      }),
    ).rejects.toMatchObject(forbidden);
    // A backup archive is only for an account with a key.
    await expect(
      run(createChatArchive, alice.actor, { partCount: 1, purpose: "backup" }),
    ).rejects.toMatchObject(conflict);
    expect((await devices(alice.actor)).recovery).toBeNull();

    await run(createChatRecoveryKey, alice.actor, {
      keyId: keyA,
      backup: backup(1),
    });
    expect((await devices(alice.actor)).recovery).toMatchObject({
      createdAt: expect.any(String),
    });
    await expect(readBackup(alice.actor)).resolves.toEqual({
      keyId: keyA,
      backup: backup(1),
      archive: null,
    });

    // Only a complete backup archive of the account's own, under the key.
    const { archiveId: unfinished } = await run(
      createChatArchive,
      alice.actor,
      {
        partCount: 2,
        purpose: "backup",
      },
    );
    await expect(
      run(backUpChatHistory, alice.actor, {
        keyId: keyA,
        backup: backup(2),
        archiveId: unfinished,
      }),
    ).rejects.toMatchObject(notFound);
    const archiveId = await backupArchive(alice);
    const bob = await chatUser();
    await expect(
      run(backUpChatHistory, bob.actor, {
        keyId: keyA,
        backup: backup(2),
        archiveId,
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(backUpChatHistory, alice.actor, {
        keyId: keyB,
        backup: backup(2),
        archiveId,
      }),
    ).rejects.toMatchObject(conflict);
    await run(backUpChatHistory, alice.actor, {
      keyId: keyA,
      backup: backup(2),
      archiveId,
    });
    await expect(readBackup(alice.actor)).resolves.toEqual({
      keyId: keyA,
      backup: backup(2),
      archive: { archiveId, parts: 1 },
    });
    // The unfinished one was replaced; the attached one outlives its expiry.
    expect(await archiveExists(unfinished)).toBe(false);
    kit.advanceDays(1);
    await purge();
    await run(deleteChatArchive, alice.actor, { archiveId });
    expect(await archiveExists(archiveId)).toBe(true);
    await expect(
      executeQuery(tick(), readChatArchivePart, {
        actor: alice.actor,
        input: { archiveId, part: 0 },
      }),
    ).resolves.toEqual({ data: bytes(32, 7) });

    // A newer backup replaces the older archive.
    const newer = await backupArchive(alice);
    await run(backUpChatHistory, alice.actor, {
      keyId: keyA,
      backup: backup(3),
      archiveId: newer,
    });
    expect(await archiveExists(archiveId)).toBe(false);

    // A new key replaces the old one, and its backup: the old key's
    // devices can no longer overwrite it.
    await run(createChatRecoveryKey, alice.actor, {
      keyId: keyB,
      backup: backup(4),
    });
    expect(await archiveExists(newer)).toBe(false);
    const stale = await backupArchive(alice);
    await expect(
      run(backUpChatHistory, alice.actor, {
        keyId: keyA,
        backup: backup(5),
        archiveId: stale,
      }),
    ).rejects.toMatchObject(conflict);
    await expect(readBackup(alice.actor)).resolves.toMatchObject({
      keyId: keyB,
      backup: backup(4),
    });
  });

  it("restores chat on a new session under the same key, shutting out every other device", async () => {
    const phone = await providerSession(await user());
    const alice = await chatUser(phone);
    const laptop = await providerSession(phone);
    const laptopDevice = testChatDevice(alice.account);
    const { linkRequestId } = await run(requestChatLink, laptop, {
      deviceId: laptopDevice.deviceId,
      deviceKey: laptopDevice.deviceKey,
      linkKey: laptopDevice.deviceKey,
      commitment: linkCommitment,
    });
    await run(approveChatLink, phone, {
      linkRequestId,
      certificate: laptopDevice.certificate,
      package: "c2VhbGVk",
    });
    await run(createChatRecoveryKey, phone, { keyId: keyA, backup: backup(1) });
    const archiveId = await backupArchive(alice);
    await run(backUpChatHistory, phone, {
      keyId: keyA,
      backup: backup(2),
      archiveId,
    });

    // Someone without a key has no backup to read.
    const bob = await chatUser();
    await expect(readBackup(bob.actor)).rejects.toMatchObject(notFound);
    await expect(
      run(restoreChatAccount, bob.actor, {
        certificate: bob.device.certificate,
        revocations: [],
      }),
    ).rejects.toMatchObject(notFound);

    const fresh = await providerSession(phone);
    await expect(readBackup(fresh)).resolves.toMatchObject({
      archive: { archiveId, parts: 1 },
    });
    const restored = testChatDevice(alice.account);
    const everyRevocation = [
      alice.account.revoke(alice.device.deviceId),
      alice.account.revoke(laptopDevice.deviceId),
    ];
    // Every other device must be shut out, with the account key's signature.
    await expect(
      run(restoreChatAccount, fresh, {
        certificate: restored.certificate,
        revocations: everyRevocation.slice(0, 1),
      }),
    ).rejects.toMatchObject(invalid);
    const other = testChatAccount(phone.userId);
    await expect(
      run(restoreChatAccount, fresh, {
        certificate: restored.certificate,
        revocations: [
          other.revoke(alice.device.deviceId),
          other.revoke(laptopDevice.deviceId),
        ],
      }),
    ).rejects.toMatchObject(invalid);
    await expect(
      run(restoreChatAccount, fresh, {
        certificate: testChatDevice(other).certificate,
        revocations: everyRevocation,
      }),
    ).rejects.toMatchObject(invalid);
    // A session that already has chat links instead.
    await expect(
      run(restoreChatAccount, laptop, {
        certificate: restored.certificate,
        revocations: everyRevocation,
      }),
    ).rejects.toMatchObject(conflict);

    await expect(
      run(restoreChatAccount, fresh, {
        certificate: restored.certificate,
        revocations: everyRevocation,
      }),
    ).resolves.toEqual({ deviceId: restored.deviceId });
    const after = await devices(fresh);
    expect(after.currentDeviceId).toBe(restored.deviceId);
    expect(after.accountKey).toBe(alice.account.accountKey);
    expect(
      after.devices
        .filter(({ revokedAt }) => revokedAt === null)
        .map(({ deviceId }) => deviceId),
    ).toEqual([restored.deviceId]);
    await deliverAll(db, consumers);
    expect(await sessionLives(phone)).toBe(false);
    expect(await sessionLives(laptop)).toBe(false);
    expect(await sessionLives(fresh)).toBe(true);
    const told = await db
      .selectFrom("app.notifications")
      .select("kind")
      .where("recipient_id", "=", phone.userId)
      .where("target_id", "=", restored.deviceId)
      .execute();
    expect(told).toEqual([{ kind: "chat.device_linked" }]);

    // The restored device fetches the backed-up history.
    await expect(
      executeQuery(tick(), readChatArchivePart, {
        actor: fresh,
        input: { archiveId, part: 0 },
      }),
    ).resolves.toEqual({ data: bytes(32, 7) });
    await expect(
      run(restoreChatAccount, fresh, {
        certificate: testChatDevice(alice.account).certificate,
        revocations: [],
      }),
    ).rejects.toMatchObject(conflict);
  });

  it("goes with a reset and with the account", async () => {
    const alice = await chatUser();
    await run(createChatRecoveryKey, alice.actor, {
      keyId: keyA,
      backup: backup(1),
    });
    const account = testChatAccount(alice.actor.userId);
    await run(resetChatAccount, alice.actor, {
      accountKey: account.accountKey,
      certificate: testChatDevice(account).certificate,
    });
    await expect(readBackup(alice.actor)).rejects.toMatchObject(notFound);

    const bob = await chatUser();
    await run(createChatRecoveryKey, bob.actor, {
      keyId: keyA,
      backup: backup(1),
    });
    await run(answerChatRecoveryPrompt, bob.actor, { prompt: "offer" });
    await run(deleteOwnAccount, bob.actor, {});
    for (const table of [
      "app.chat_recovery_keys",
      "app.chat_recovery_prompts",
    ] as const) {
      const left = await db
        .selectFrom(table)
        .select("user_id")
        .where("user_id", "=", bob.actor.userId)
        .execute();
      expect(left).toEqual([]);
    }
  });

  it("is offered once and recalled once, only to someone who said «Ikke nå»", async () => {
    const alice = await chatUser();
    const reminder = async () => (await devices(alice.actor)).recoveryReminder;
    expect(await reminder()).toBe(false);

    await run(answerChatRecoveryPrompt, alice.actor, { prompt: "offer" });
    expect(await reminder()).toBe(true);
    await run(answerChatRecoveryPrompt, alice.actor, { prompt: "reminder" });
    expect(await reminder()).toBe(false);
    // Answering the offer again does not bring the reminder back.
    await run(answerChatRecoveryPrompt, alice.actor, { prompt: "offer" });
    expect(await reminder()).toBe(false);

    const bob = await chatUser();
    await run(answerChatRecoveryPrompt, bob.actor, { prompt: "offer" });
    await run(createChatRecoveryKey, bob.actor, {
      keyId: keyA,
      backup: backup(1),
    });
    expect((await devices(bob.actor)).recoveryReminder).toBe(false);
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

describe("notifications of new messages (PS-COM-018)", () => {
  const messageNotifications = (recipientId: string, conversationId: string) =>
    db
      .selectFrom("app.notifications")
      .select(["id", "level", "detail", "target_type", "position", "read_at"])
      .where("recipient_id", "=", recipientId)
      .where("kind", "=", "chat.new_messages")
      .where("target_id", "=", conversationId)
      .orderBy("position")
      .execute();

  const emails = (notificationId: string) =>
    db
      .selectFrom("app.notification_deliveries")
      .select(["status", "available_at"])
      .where("notification_id", "=", notificationId)
      .execute();

  it("counts new messages in one notification until the conversation is read", async () => {
    const { alice, bob, conversationId } = await pairInConversation();

    await send(alice, conversationId, 1);
    const [first] = await messageNotifications(
      bob.actor.userId,
      conversationId,
    );
    expect(first).toMatchObject({
      level: "information",
      detail: "messages_1",
      target_type: "chat_conversation",
      read_at: null,
    });

    await send(alice, conversationId, 1);
    const [counted, ...more] = await messageNotifications(
      bob.actor.userId,
      conversationId,
    );
    // The same notification, at the top of the list again.
    expect(more).toEqual([]);
    expect(counted).toMatchObject({ id: first!.id, detail: "messages_2" });
    expect(BigInt(counted!.position)).toBeGreaterThan(BigInt(first!.position));
    // The sender is told nothing about their own messages.
    expect(
      await messageNotifications(alice.actor.userId, conversationId),
    ).toEqual([]);

    await run(readChatMessageNotifications, bob.actor, { conversationId });
    expect(
      (await messageNotifications(bob.actor.userId, conversationId))[0]!
        .read_at,
    ).not.toBeNull();

    await send(alice, conversationId, 1);
    const after = await messageNotifications(bob.actor.userId, conversationId);
    expect(after).toHaveLength(2);
    expect(after[1]).toMatchObject({ detail: "messages_1", read_at: null });
  });

  it("is named by the one who wrote in the reader's centre, never by what", async () => {
    const { alice, bob, conversationId } = await pairInConversation();

    await send(alice, conversationId, 1);
    await send(alice, conversationId, 1);
    const { notifications } = await executeQuery(
      tick(),
      readNotificationCentre,
      { actor: bob.actor, input: {} },
    );

    expect(
      notifications.filter(({ kind }) => kind === "chat.new_messages"),
    ).toEqual([
      expect.objectContaining({
        detail: "messages_2",
        target: { type: "chat_conversation", id: conversationId },
        about: {
          thing: null,
          picture: null,
          person: expect.any(String),
          place: null,
        },
      }),
    ]);
  });

  it("tells no one who muted the conversation, until they unmute it", async () => {
    const { alice, bob, conversationId } = await pairInConversation();

    await run(muteChatConversation, bob.actor, {
      conversationId,
      muted: true,
    });
    expect(await read(bob.actor, conversationId)).toMatchObject({
      muted: true,
    });
    // Only for the one who muted it.
    expect(await read(alice.actor, conversationId)).toMatchObject({
      muted: false,
    });

    await send(alice, conversationId, 1);
    expect(
      await messageNotifications(bob.actor.userId, conversationId),
    ).toEqual([]);
    expect((await acknowledge(bob.actor)).map(({ type }) => type)).toEqual([
      "application",
    ]);

    await run(muteChatConversation, bob.actor, {
      conversationId,
      muted: false,
    });
    await send(alice, conversationId, 1);
    expect(
      await messageNotifications(bob.actor.userId, conversationId),
    ).toHaveLength(1);
  });

  it("follows the recipient's own choices for new messages", async () => {
    const { alice, bob, conversationId } = await pairInConversation();

    // E-mail for information in general does not send these.
    await run(setNotificationPreference, bob.actor, {
      level: "information",
      channel: "email",
      enabled: true,
    });
    await send(alice, conversationId, 1);
    const [notification] = await messageNotifications(
      bob.actor.userId,
      conversationId,
    );
    expect(await emails(notification!.id)).toEqual([]);
    await run(readChatMessageNotifications, bob.actor, { conversationId });

    // Their own e-mail choice sends one, later, for the whole batch.
    await run(setNotificationPreference, bob.actor, {
      kind: "chat.new_messages",
      channel: "email",
      enabled: true,
    });
    await send(alice, conversationId, 1);
    const sentAt = now();
    await send(alice, conversationId, 1);
    const unread = (
      await messageNotifications(bob.actor.userId, conversationId)
    ).at(-1)!;
    expect(unread.detail).toBe("messages_2");
    expect(await emails(unread.id)).toEqual([
      {
        status: "pending",
        available_at: new Date(sentAt.getTime() + chatMessageEmailDelayMs),
      },
    ]);
    await run(readChatMessageNotifications, bob.actor, { conversationId });

    // Chosen while a notification waits unread: its e-mail comes too.
    await run(setNotificationPreference, bob.actor, {
      kind: "chat.new_messages",
      channel: "email",
      enabled: false,
    });
    await send(alice, conversationId, 1);
    await run(setNotificationPreference, bob.actor, {
      kind: "chat.new_messages",
      channel: "email",
      enabled: true,
    });
    await send(alice, conversationId, 1);
    const waiting = (
      await messageNotifications(bob.actor.userId, conversationId)
    ).at(-1)!;
    expect(await emails(waiting.id)).toEqual([
      expect.objectContaining({ status: "pending" }),
    ]);
    await run(readChatMessageNotifications, bob.actor, { conversationId });

    // Off in the app: nothing at all.
    await run(setNotificationPreference, bob.actor, {
      kind: "chat.new_messages",
      channel: "in_app",
      enabled: false,
    });
    const before = await messageNotifications(bob.actor.userId, conversationId);
    await send(alice, conversationId, 1);
    expect(
      await messageNotifications(bob.actor.userId, conversationId),
    ).toEqual(before);
  });

  it("lets only the participants mute or read", async () => {
    const { conversationId } = await pairInConversation();
    const eve = await chatUser();

    await expect(
      run(muteChatConversation, eve.actor, { conversationId, muted: true }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(readChatMessageNotifications, eve.actor, { conversationId }),
    ).rejects.toMatchObject(notFound);
  });
});

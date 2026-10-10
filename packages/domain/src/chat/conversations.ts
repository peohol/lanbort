import {
  acknowledgeChatInboxSchema,
  type ChatContext,
  chatAcknowledgedSchema,
  chatClaimedKeyPackagesSchema,
  chatContactSchema,
  chatCommitAcceptedSchema,
  chatConversationListSchema,
  chatConversationStartedSchema,
  chatConversationTargetSchema,
  chatDirectorySchema,
  chatDoneSchema,
  chatInboxQuerySchema,
  chatInboxSchema,
  chatLimits,
  chatMessageSentSchema,
  muteChatConversationSchema,
  sendChatMessageSchema,
  startChatConversationSchema,
  submitChatCommitSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Transaction } from "kysely";
import { z } from "zod";
import { rateLimits } from "../abuse/rate-limits";
import { takesNewActivity } from "../account/model";
import { accountStatuses, realNames } from "../account/store";
import { linkIn, type PersonLinks, personLinks } from "../people/queries";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import { loadLenderScope, visibleToLender } from "../loans/store";
import { actingUserId } from "../objects/state";
import { loadQuestion, seesQuestion } from "../questions/store";
import {
  markChatMessagesRead,
  recordChatMessage,
} from "../notifications/store";
import { loadPair, lockPair } from "../social/pair";
import { chatConversationStarted } from "./events";
import { readPrivateMessage, readWelcome } from "./mls";
import { conversationKinds, groupIdOf } from "./model";
import {
  acknowledgeChatInboxPolicy,
  claimChatKeyPackagesPolicy,
  hideChatConversationPolicy,
  listChatConversationsPolicy,
  muteChatConversationPolicy,
  readChatContactPolicy,
  readChatConversationPolicy,
  readChatDirectoryPolicy,
  readChatInboxPolicy,
  readChatMessageNotificationsPolicy,
  sendChatMessagePolicy,
  startChatConversationPolicy,
  submitChatCommitPolicy,
} from "./policies";
import { fromBase64, toBase64 } from "./signatures";
import {
  type ChatDeviceRecord,
  type ConversationRecord,
  conversationOpen,
  currentAccountKey,
  devicesOf,
  dropDelivered,
  groupMembers,
  loadConversation,
  presentDevice,
  sessionDevice,
} from "./store";

type Db = Kysely<Database>;
type Tx = Transaction<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

function invalid(field: string): never {
  throw new DomainError("invalid_input", `Invalid ${field}`, [field]);
}

const orderedPair = (a: string, b: string): [string, string] =>
  a < b ? [a, b] : [b, a];

/**
 * PS-COM-006, PS-USR-005: a non-friend's first contact is the structured
 * one the product already has. Only the person who received it may open a
 * free conversation from it, so the sender cannot turn it into a stream of
 * messages:
 * - a loan request: the caller sees it as a lender, and the other is its
 *   borrower;
 * - an object question: the caller owns the object and sees the question
 *   there, and the other asked it.
 */
async function invitedByContext(
  tx: Db,
  callerId: string,
  otherId: string,
  context: ChatContext | undefined,
  now: Date,
): Promise<boolean> {
  switch (context?.kind) {
    case undefined:
      return false;
    case "loan_request": {
      const scope = await loadLenderScope(tx, callerId, now);
      const row = await tx
        .selectFrom("app.loan_requests as request")
        .select("request.id")
        .where("request.id", "=", context.requestId)
        .where("request.borrower_user_id", "=", otherId)
        .where(visibleToLender(scope))
        .executeTakeFirst();

      return row !== undefined;
    }
    case "object_question": {
      const question = await loadQuestion(tx, context.questionId);

      if (question?.askedByUserId !== otherId) {
        return false;
      }

      const owner = await tx
        .selectFrom("app.object_owners")
        .select("user_id")
        .where("object_id", "=", question.objectId)
        .where("user_id", "=", callerId)
        .executeTakeFirst();

      return (
        owner !== undefined && (await seesQuestion(tx, question, callerId, now))
      );
    }
  }
}

async function existingConversation(
  db: Db,
  a: string,
  b: string,
): Promise<string | null> {
  const [low, high] = orderedPair(a, b);
  const row = await db
    .selectFrom("app.chat_conversations")
    .select("id")
    .where("kind", "=", "private")
    .where("user_low_id", "=", low)
    .where("user_high_id", "=", high)
    .executeTakeFirst();

  return row?.id ?? null;
}

/**
 * How the caller relates to someone they want to write to: whether they
 * are reachable, may write by friendship or an existing conversation, or
 * received the structured contact `context` names; and the conversation
 * they already have. Null for the caller themselves or no one.
 */
async function contactWith(
  db: Db,
  callerId: string,
  input: z.infer<typeof startChatConversationSchema>,
  now: Date,
) {
  if (input.userId === callerId) {
    return null;
  }

  const pair = await loadPair(db, callerId, input.userId);

  if (!pair) {
    return null;
  }

  const status = (await accountStatuses(db, [input.userId])).get(input.userId);
  const reachable =
    pair.otherActive &&
    status !== undefined &&
    takesNewActivity(status) &&
    !pair.blockedByActor &&
    !pair.blockedByOther;
  const existing = await existingConversation(db, callerId, input.userId);
  const friends = pair.openFriendship?.status === "active";

  return {
    reachable,
    friends: friends || existing !== null,
    invitedByContext:
      reachable &&
      !friends &&
      (await invitedByContext(db, callerId, input.userId, input.context, now)),
    existing,
    openedVia: friends ? ("friendship" as const) : input.context?.kind,
  };
}

/**
 * Starts a private conversation with a friend, or with someone whose
 * structured contact the caller received (PS-COM-006). There is one per
 * pair: asking again returns it, and shows it again in the caller's list.
 * A block in either direction, or a person who is not there, looks like no
 * one (PS-USR-006).
 */
export const startChatConversation = defineCommand({
  name: "chat.start_conversation",
  input: startChatConversationSchema,
  output: chatConversationStartedSchema,
  policy: startChatConversationPolicy,
  rateLimit: rateLimits.contact,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    const callerId = actingUserId(actor);

    if (input.userId !== callerId) {
      await lockPair(tx, callerId, input.userId);
    }

    const resource = await contactWith(tx, callerId, input, now);
    return resource && { resource, context: undefined };
  },
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const callerId = actingUserId(actor);

    if (resource.existing) {
      await tx
        .updateTable("app.chat_participants")
        .set({ hidden_at: null })
        .where("conversation_id", "=", resource.existing)
        .where("user_id", "=", callerId)
        .execute();

      return { conversationId: resource.existing };
    }

    const openedVia = resource.openedVia!;
    const [low, high] = orderedPair(callerId, input.userId);
    const { id } = await tx
      .insertInto("app.chat_conversations")
      .values({
        kind: "private",
        user_low_id: low,
        user_high_id: high,
        opened_via: openedVia,
        created_by_user_id: callerId,
        created_at: now,
        last_activity_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("app.chat_participants")
      .values([low, high].map((user_id) => ({ conversation_id: id, user_id })))
      .execute();

    events.record(chatConversationStarted, {
      resourceId: id,
      payload: { openedVia },
    });

    return { conversationId: id };
  },
});

/**
 * Where a page about someone lets the caller write to them (PS-COM-017):
 * the conversation they have, or the offer to start one by the same rules
 * as starting it (PS-COM-006). It tells nothing about anyone the caller
 * could not start a conversation with.
 */
export const readChatContact = defineQuery({
  name: "chat.read_contact",
  input: startChatConversationSchema,
  policy: readChatContactPolicy,
  load: async ({ db, actor, input, now }) => ({
    resource: await contactWith(db, actingUserId(actor), input, now),
    context: undefined,
  }),
  present: ({ resource }) =>
    chatContactSchema.parse(
      resource?.reachable
        ? {
            conversationId: resource.existing,
            canStart:
              resource.existing === null &&
              (resource.friends || resource.invitedByContext),
          }
        : { conversationId: null, canStart: false },
    ),
});

/**
 * A conversation as the caller relates to it, loaded inside the deciding
 * transaction. `lock` holds the conversation for update, so its commits and
 * messages are decided one at a time.
 */
async function loadAccess(
  db: Db,
  actor: Actor,
  conversationId: string,
  options: { lock?: boolean } = {},
) {
  const conversation = await loadConversation(db, conversationId, options);
  const participant =
    conversation !== null &&
    actor.kind === "user" &&
    conversation.participantIds.includes(actor.userId);
  const device = participant ? await sessionDevice(db, actor, options) : null;

  return {
    participant,
    hasDevice: device !== null,
    open: participant && (await conversationOpen(db, conversation!, options)),
    conversation: conversation!,
    device,
  };
}

const conversationLoad =
  <I extends { conversationId: string } = { conversationId: string }>(
    options: { lock?: boolean } = {},
  ) =>
  async ({
    tx,
    db,
    actor,
    input,
  }: {
    tx?: Db;
    db?: Db;
    actor: Actor;
    input: I;
  }) => ({
    resource: await loadAccess(tx ?? db!, actor, input.conversationId, options),
    context: undefined,
  });

/** The participants of `conversation` other than `viewerId`. */
const othersIn = (conversation: ConversationRecord, viewerId: string) =>
  conversation.participantIds.filter((id) => id !== viewerId);

/**
 * The conversation as one participant sees it, with `links` to the other
 * participants' pages and pictures (from {@link personLinks}).
 */
async function presentConversation(
  db: Db,
  conversation: ConversationRecord,
  viewerId: string,
  device: ChatDeviceRecord | null,
  open: boolean,
  links: PersonLinks,
) {
  const others = othersIn(conversation, viewerId);
  const [names, members, waiting, participant] = await Promise.all([
    realNames(db, others),
    groupMembers(db, conversation.id, conversation.generation),
    device
      ? db
          .selectFrom("app.chat_deliveries as delivery")
          .innerJoin(
            "app.chat_messages as message",
            "message.id",
            "delivery.message_id",
          )
          .select("delivery.message_id")
          .where("delivery.device_id", "=", device.id)
          .where("message.conversation_id", "=", conversation.id)
          .limit(1)
          .executeTakeFirst()
      : undefined,
    db
      .selectFrom("app.chat_participants")
      .select("muted_at")
      .where("conversation_id", "=", conversation.id)
      .where("user_id", "=", viewerId)
      .executeTakeFirst(),
  ]);

  return {
    conversationId: conversation.id,
    kind: conversation.kind,
    generation: conversation.generation,
    epoch: Number(conversation.epoch),
    others: others.map((userId) => ({
      userId,
      realName: names.get(userId) ?? null,
      ...linkIn(links, userId),
    })),
    loanId: conversation.loanLogistics?.loanId ?? null,
    open,
    joined: device !== null && members.includes(device.id),
    waiting: waiting !== undefined,
    muted: (participant?.muted_at ?? null) !== null,
    startedAt: conversation.createdAt.toISOString(),
    lastActivityAt: conversation.lastActivityAt.toISOString(),
  };
}

export const readChatConversation = defineQuery({
  name: "chat.read_conversation",
  input: chatConversationTargetSchema,
  policy: readChatConversationPolicy,
  load: async ({ db, actor, input, now }) => {
    const access = await loadAccess(db, actor, input.conversationId);
    const present = async (viewerId: string) =>
      presentConversation(
        db,
        access.conversation,
        viewerId,
        access.device,
        access.open,
        await personLinks(
          db,
          viewerId,
          othersIn(access.conversation, viewerId),
          now,
        ),
      );

    return {
      resource: {
        ...access,
        presented: access.participant
          ? await present(actingUserId(actor))
          : null,
      },
      context: undefined,
    };
  },
  present: ({ resource }) => resource.presented!,
});

/** At most this many conversations are listed, most recent first. */
const conversationListSize = 200;

/**
 * The caller's conversations, most recent first. One the caller removed
 * from their list (PS-COM-009) comes back when a new message arrives.
 */
export const listChatConversations = defineQuery({
  name: "chat.list_conversations",
  input: z.strictObject({}),
  policy: listChatConversationsPolicy,
  load: async ({ db, actor, now }) => {
    const userId = actingUserId(actor);
    const rows = await db
      .selectFrom("app.chat_participants as participant")
      .innerJoin(
        "app.chat_conversations as conversation",
        "conversation.id",
        "participant.conversation_id",
      )
      .select("conversation.id")
      .where("participant.user_id", "=", userId)
      .where((eb) =>
        eb.or([
          eb("participant.hidden_at", "is", null),
          eb(
            "conversation.last_activity_at",
            ">",
            eb.ref("participant.hidden_at"),
          ),
        ]),
      )
      .orderBy("conversation.last_activity_at", "desc")
      .orderBy("conversation.id")
      .limit(conversationListSize)
      .execute();
    const device = await sessionDevice(db, actor);
    const loaded = [];

    for (const { id } of rows) {
      loaded.push((await loadConversation(db, id))!);
    }

    // Everyone the list names, looked up once for the whole list.
    const links = await personLinks(
      db,
      userId,
      [
        ...new Set(
          loaded.flatMap((conversation) => othersIn(conversation, userId)),
        ),
      ],
      now,
    );
    const conversations = [];

    for (const conversation of loaded) {
      conversations.push(
        await presentConversation(
          db,
          conversation,
          userId,
          device,
          await conversationOpen(db, conversation),
          links,
        ),
      );
    }

    return { resource: { conversations }, context: undefined };
  },
  present: ({ resource }) => chatConversationListSchema.parse(resource),
});

/**
 * Everyone's account key and devices, live and revoked, with their
 * certificates and revocations, and the devices in the current group. The
 * device decides for itself whom to trust (ADR-0010 §3); this is only what
 * the server has.
 */
export const readChatDirectory = defineQuery({
  name: "chat.read_directory",
  input: chatConversationTargetSchema,
  policy: readChatDirectoryPolicy,
  load: async ({ db, actor, input }) => {
    const access = await loadAccess(db, actor, input.conversationId);

    if (!access.participant) {
      return { resource: { ...access, directory: null }, context: undefined };
    }

    const { conversation } = access;
    const [devices, members] = await Promise.all([
      devicesOf(db, conversation.participantIds),
      groupMembers(db, conversation.id, conversation.generation),
    ]);
    const accounts = [];

    for (const userId of conversation.participantIds) {
      const key = await currentAccountKey(db, userId);
      accounts.push({
        userId,
        accountKey: key ? toBase64(key.publicKey) : null,
        devices: devices
          .filter((device) => device.userId === userId)
          .map(presentDevice),
      });
    }

    return {
      resource: { ...access, directory: { accounts, members } },
      context: undefined,
    };
  },
  present: ({ resource }) => chatDirectorySchema.parse(resource.directory),
});

/**
 * Removes the conversation from the caller's own list (PS-COM-009). Nothing
 * is deleted for anyone, and the other participant sees no difference.
 */
export const hideChatConversation = defineCommand({
  name: "chat.hide_conversation",
  input: chatConversationTargetSchema,
  output: chatDoneSchema,
  policy: hideChatConversationPolicy,
  idempotency: "required",
  load: conversationLoad(),
  execute: async ({ tx, actor, input, now }) => {
    await tx
      .updateTable("app.chat_participants")
      .set({ hidden_at: now })
      .where("conversation_id", "=", input.conversationId)
      .where("user_id", "=", actingUserId(actor))
      .execute();

    return {};
  },
});

/**
 * «Demp samtalen» (PS-COM-018): no notifications of new messages in this
 * conversation for the caller, or again after unmuting. Nothing else
 * changes, and the other participant sees no difference.
 */
export const muteChatConversation = defineCommand({
  name: "chat.mute_conversation",
  input: muteChatConversationSchema,
  output: chatDoneSchema,
  policy: muteChatConversationPolicy,
  idempotency: "required",
  load: conversationLoad<z.infer<typeof muteChatConversationSchema>>(),
  execute: async ({ tx, actor, input, now }) => {
    await tx
      .updateTable("app.chat_participants")
      .set({ muted_at: input.muted ? now : null })
      .where("conversation_id", "=", input.conversationId)
      .where("user_id", "=", actingUserId(actor))
      .execute();

    return {};
  },
});

/**
 * The caller opened the conversation: its notification of new messages is
 * read (PS-COM-018). Only the caller's own notification; nothing is told to
 * anyone else (PS-COM-004).
 */
export const readChatMessageNotifications = defineCommand({
  name: "chat.read_message_notifications",
  input: chatConversationTargetSchema,
  output: chatDoneSchema,
  policy: readChatMessageNotificationsPolicy,
  idempotency: "none",
  load: conversationLoad(),
  execute: async ({ tx, actor, input, now }) => {
    await markChatMessagesRead(
      tx,
      actingUserId(actor),
      input.conversationId,
      now,
    );

    return {};
  },
});

/**
 * Whether the caller's device may change the group: it is a member, or the
 * group has no live member left, so the caller's device starts it anew.
 */
function requireMembership(
  members: readonly string[],
  device: ChatDeviceRecord,
): void {
  if (members.length > 0 && !members.includes(device.id)) {
    conflict("This device is not in the conversation yet");
  }
}

/**
 * One unused key package for each participant device that is not in the
 * group yet, for the caller's device to add them (ADR-0010 §4, §6). Each
 * one-time package is handed out once; when a device has none left, its
 * last-resort package is used.
 */
export const claimChatKeyPackages = defineCommand({
  name: "chat.claim_key_packages",
  input: chatConversationTargetSchema,
  output: chatClaimedKeyPackagesSchema,
  policy: claimChatKeyPackagesPolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: conversationLoad<z.infer<typeof chatConversationTargetSchema>>({
    lock: true,
  }),
  execute: async ({ tx, resource, now }) => {
    const { conversation } = resource;
    const device = resource.device!;
    const members = await groupMembers(
      tx,
      conversation.id,
      conversation.generation,
    );
    requireMembership(members, device);

    const missing = (await devicesOf(tx, conversation.participantIds)).filter(
      (candidate) =>
        candidate.revokedAt === null &&
        candidate.id !== device.id &&
        !members.includes(candidate.id),
    );
    const keyPackages = [];

    for (const candidate of missing) {
      const { rows } = await sql<{ key_package: Buffer }>`
        with chosen as (
          select id, last_resort from app.chat_key_packages
          where device_id = ${candidate.id} and expires_at > ${now}
          order by last_resort, created_at
          limit 1
          for update skip locked
        ), used as (
          delete from app.chat_key_packages
          where id in (select id from chosen where not last_resort)
        )
        select key_package from app.chat_key_packages
        where id in (select id from chosen)
      `.execute(tx);
      const found = rows[0];

      if (found) {
        keyPackages.push({
          deviceId: candidate.id,
          keyPackage: toBase64(found.key_package),
        });
      }
    }

    return { keyPackages };
  },
});

/**
 * PS-COM-018: whoever got the message on a device of theirs is told, unless
 * they muted the conversation. Who writes to whom, and when, is what the
 * server knows already; nothing of the message itself is used.
 */
async function notifyNewMessage(
  tx: Tx,
  message: {
    conversationId: string;
    position: string;
    senderId: string;
    deviceIds: readonly string[];
    now: Date;
  },
): Promise<void> {
  const [devices, muted] = await Promise.all([
    tx
      .selectFrom("app.chat_devices")
      .select("user_id")
      .where("id", "in", [...message.deviceIds])
      .execute(),
    tx
      .selectFrom("app.chat_participants")
      .select("user_id")
      .where("conversation_id", "=", message.conversationId)
      .where("muted_at", "is not", null)
      .execute(),
  ]);
  const quiet = new Set([message.senderId, ...muted.map((row) => row.user_id)]);

  await recordChatMessage(tx, {
    conversationId: message.conversationId,
    messageKey: message.position,
    recipientIds: [
      ...new Set(
        devices.map((row) => row.user_id).filter((id) => !quiet.has(id)),
      ),
    ],
    occurredAt: message.now,
  });
}

async function deliver(
  tx: Tx,
  message: {
    conversationId: string;
    generation: number;
    epoch: bigint;
    contentType: "application" | "commit" | "welcome";
    ciphertext: Uint8Array;
    now: Date;
  },
  recipients: readonly string[],
): Promise<string | null> {
  if (recipients.length === 0) {
    return null;
  }

  const { id } = await tx
    .insertInto("app.chat_messages")
    .values({
      conversation_id: message.conversationId,
      generation: message.generation,
      epoch: message.epoch.toString(),
      content_type: message.contentType,
      ciphertext: Buffer.from(message.ciphertext),
      created_at: message.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await tx
    .insertInto("app.chat_deliveries")
    .values(recipients.map((device_id) => ({ device_id, message_id: id })))
    .execute();

  return id;
}

/**
 * Places a commit in the conversation's order (ADR-0010 §9): it is accepted
 * only for the current epoch, so exactly one commit wins each epoch, and
 * the device that loses fetches the winner and tries again. Its welcome
 * goes to the devices it adds, which must be participants' live devices; removed
 * devices get nothing more. When no live device is left in the group, the
 * caller's device starts a new generation of it.
 */
export const submitChatCommit = defineCommand({
  name: "chat.submit_commit",
  input: submitChatCommitSchema,
  output: chatCommitAcceptedSchema,
  policy: submitChatCommitPolicy,
  rateLimit: rateLimits.chatMessages,
  idempotency: "required",
  load: conversationLoad<z.infer<typeof submitChatCommitSchema>>({
    lock: true,
  }),
  execute: async ({ tx, input, resource, now }) => {
    const { conversation } = resource;
    const device = resource.device!;
    let { generation, epoch } = conversation;
    const members = await groupMembers(tx, conversation.id, generation);

    if (members.length === 0 && input.generation === generation + 1) {
      generation = input.generation;
      epoch = 0n;
    } else if (input.generation !== generation) {
      conflict("Another generation of the group");
    } else if (members.length === 0 && epoch !== 0n) {
      // Every device in the group is gone; its keys went with them.
      conflict("Start the next generation of the group");
    }

    const commit = fromBase64(input.commit);
    const header = readPrivateMessage(commit);

    if (
      header.contentType !== "commit" ||
      header.groupId !== groupIdOf(conversation.id, generation)
    ) {
      invalid("commit");
    }

    if (header.epoch !== epoch) {
      conflict("Another commit won this epoch");
    }

    requireMembership(members, device);

    const live = new Set(
      (await devicesOf(tx, conversation.participantIds))
        .filter((candidate) => candidate.revokedAt === null)
        .map((candidate) => candidate.id),
    );
    const added = input.addedDeviceIds;
    const removed = input.removedDeviceIds;
    const welcome = input.welcome === null ? null : fromBase64(input.welcome);

    if (
      new Set(added).size !== added.length ||
      added.some(
        (id) => !live.has(id) || members.includes(id) || id === device.id,
      )
    ) {
      invalid("addedDeviceIds");
    }

    if ((welcome === null) !== (added.length === 0)) {
      invalid("welcome");
    }

    // Only a device the server already shut out (revoked, reset or deleted)
    // is removed: the commit still takes it out of the MLS group. A live
    // device stays, so no participant can cut another's device off.
    if (
      new Set(removed).size !== removed.length ||
      removed.some(
        (id) => id === device.id || added.includes(id) || live.has(id),
      )
    ) {
      invalid("removedDeviceIds");
    }

    if (welcome !== null) {
      readWelcome(welcome);
    }

    await deliver(
      tx,
      {
        conversationId: conversation.id,
        generation,
        epoch,
        contentType: "commit",
        ciphertext: commit,
        now,
      },
      members.filter((id) => id !== device.id && !removed.includes(id)),
    );

    if (welcome !== null) {
      await deliver(
        tx,
        {
          conversationId: conversation.id,
          generation,
          epoch: epoch + 1n,
          contentType: "welcome",
          ciphertext: welcome,
          now,
        },
        added,
      );
    }

    const joining = [...(members.length === 0 ? [device.id] : []), ...added];

    if (joining.length > 0) {
      await tx
        .insertInto("app.chat_group_members")
        .values(
          joining.map((device_id) => ({
            conversation_id: conversation.id,
            generation,
            device_id,
            added_at: now,
          })),
        )
        .execute();
    }

    if (removed.length > 0) {
      await tx
        .deleteFrom("app.chat_group_members")
        .where("conversation_id", "=", conversation.id)
        .where("generation", "=", generation)
        .where("device_id", "in", removed)
        .execute();
    }

    await tx
      .updateTable("app.chat_conversations")
      .set({ generation, epoch: (epoch + 1n).toString() })
      .where("id", "=", conversation.id)
      .execute();

    return { generation, epoch: Number(epoch + 1n) };
  },
});

/**
 * Passes an encrypted message to the other devices in the group. It must be
 * for the current epoch, so it always follows the commits before it. The
 * server never reads it and records no event for it (ADR-0010 §12).
 */
export const sendChatMessage = defineCommand({
  name: "chat.send_message",
  input: sendChatMessageSchema,
  output: chatMessageSentSchema,
  policy: sendChatMessagePolicy,
  rateLimit: rateLimits.chatMessages,
  idempotency: "required",
  load: conversationLoad<z.infer<typeof sendChatMessageSchema>>({ lock: true }),
  execute: async ({ tx, actor, input, resource, now }) => {
    const { conversation } = resource;
    const device = resource.device!;

    if (input.generation !== conversation.generation) {
      conflict("Another generation of the group");
    }

    const ciphertext = fromBase64(input.ciphertext);
    const header = readPrivateMessage(ciphertext);
    const rules = conversationKinds[conversation.kind];

    if (
      header.contentType !== "application" ||
      header.groupId !== groupIdOf(conversation.id, conversation.generation) ||
      ciphertext.length > rules.maxMessageBytes ||
      (rules.maxContentBytes !== null &&
        header.contentBytes > rules.maxContentBytes)
    ) {
      invalid("ciphertext");
    }

    if (header.epoch !== conversation.epoch) {
      conflict("The group has moved to another epoch");
    }

    const members = await groupMembers(
      tx,
      conversation.id,
      conversation.generation,
    );

    if (!members.includes(device.id)) {
      conflict("This device is not in the conversation yet");
    }

    const recipients = members.filter((id) => id !== device.id);
    const position = await deliver(
      tx,
      {
        conversationId: conversation.id,
        generation: conversation.generation,
        epoch: conversation.epoch,
        contentType: "application",
        ciphertext,
        now,
      },
      recipients,
    );

    if (position !== null) {
      await notifyNewMessage(tx, {
        conversationId: conversation.id,
        position,
        senderId: actingUserId(actor),
        deviceIds: recipients,
        now,
      });
    }

    // A new message shows the conversation again for anyone who removed it
    // from their list (PS-COM-009).
    await tx
      .updateTable("app.chat_conversations")
      .set({ last_activity_at: now })
      .where("id", "=", conversation.id)
      .execute();
    await tx
      .updateTable("app.chat_participants")
      .set({ hidden_at: null })
      .where("conversation_id", "=", conversation.id)
      .execute();

    return { position, sentAt: now.toISOString() };
  },
});

/**
 * What waits for this session's device, in the server's order: commits,
 * welcomes and messages. Nothing about who has read what (PS-COM-004).
 */
export const readChatInbox = defineQuery({
  name: "chat.read_inbox",
  input: chatInboxQuerySchema,
  policy: readChatInboxPolicy,
  load: async ({ db, actor }) => {
    const device = await sessionDevice(db, actor);
    const query = db
      .selectFrom("app.chat_deliveries as delivery")
      .innerJoin(
        "app.chat_messages as message",
        "message.id",
        "delivery.message_id",
      )
      .select([
        "message.id",
        "message.conversation_id",
        "message.generation",
        "message.content_type",
        "message.ciphertext",
        "message.created_at",
      ])
      .where("delivery.device_id", "=", device?.id ?? null)
      .orderBy("message.id")
      .limit(chatLimits.inboxPageSize + 1);

    const rows = device ? await query.execute() : [];

    return {
      resource: { hasDevice: device !== null, rows },
      context: undefined,
    };
  },
  present: ({ resource }) =>
    chatInboxSchema.parse({
      items: resource.rows.slice(0, chatLimits.inboxPageSize).map((row) => ({
        position: row.id,
        conversationId: row.conversation_id,
        generation: row.generation,
        type: row.content_type,
        ciphertext: toBase64(row.ciphertext),
        sentAt: row.created_at.toISOString(),
      })),
      more: resource.rows.length > chatLimits.inboxPageSize,
    }),
});

/**
 * The device has handled these items; what no other device still waits
 * for is deleted (ADR-0010 §8). The other participants are
 * never told (PS-COM-004).
 */
export const acknowledgeChatInbox = defineCommand({
  name: "chat.acknowledge",
  input: acknowledgeChatInboxSchema,
  output: chatAcknowledgedSchema,
  policy: acknowledgeChatInboxPolicy,
  idempotency: "none",
  load: async ({ tx, actor }) => {
    const device = await sessionDevice(tx, actor, { lock: true });

    return {
      resource: { hasDevice: device !== null, device },
      context: undefined,
    };
  },
  execute: async ({ tx, input, resource }) => {
    const fetched = await tx
      .deleteFrom("app.chat_deliveries")
      .where("device_id", "=", resource.device!.id)
      .where("message_id", "in", input.positions)
      .returning("message_id")
      .execute();
    await dropDelivered(
      tx,
      fetched.map((row) => row.message_id),
    );

    return { acknowledged: fetched.length };
  },
});

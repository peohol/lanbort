import type {
  ChatConversationKind,
  ChatDevice,
  DeviceCertificateWire,
  DeviceRevocationWire,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { takesNewActivity } from "../account/model";
import { accountStatuses } from "../account/store";
import type { Actor } from "../actor";
import { findChannel } from "../loans/logistics-store";
import { blockedWithAny } from "../social/pair";
import { toBase64 } from "./signatures";

type Db = Kysely<Database>;

export interface ChatDeviceRecord {
  readonly id: string;
  readonly userId: string;
  readonly accountKeyId: string;
  readonly accountKey: Uint8Array;
  readonly deviceKey: Uint8Array;
  readonly certificateSignature: Uint8Array;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
  readonly revocationSignature: Uint8Array | null;
}

const deviceColumns = [
  "device.id",
  "device.user_id",
  "device.account_key_id",
  "account_key.public_key",
  "device.device_key",
  "device.certificate_signature",
  "device.created_at",
  "device.revoked_at",
  "device.revocation_signature",
] as const;

const devices = (db: Db) =>
  db
    .selectFrom("app.chat_devices as device")
    .innerJoin(
      "app.chat_account_keys as account_key",
      "account_key.id",
      "device.account_key_id",
    )
    .select(deviceColumns);

type DeviceRow = Awaited<
  ReturnType<ReturnType<typeof devices>["executeTakeFirstOrThrow"]>
>;

const toDevice = (row: DeviceRow): ChatDeviceRecord => ({
  id: row.id,
  userId: row.user_id,
  accountKeyId: row.account_key_id,
  accountKey: row.public_key,
  deviceKey: row.device_key,
  certificateSignature: row.certificate_signature,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
  revocationSignature: row.revocation_signature,
});

/**
 * The live device of the caller's sign-in session, or null. A device acts
 * only through the session it was registered or linked in (ADR-0010 §5).
 * `lock` holds it for share, so a revocation waits for the caller or is
 * seen by it.
 */
export async function sessionDevice(
  db: Db,
  actor: Actor,
  options: { lock?: boolean } = {},
): Promise<ChatDeviceRecord | null> {
  if (actor.kind !== "user") {
    return null;
  }

  let query = devices(db)
    .where("device.user_id", "=", actor.userId)
    .where("device.session_id", "=", actor.authentication.sessionId)
    .where("device.revoked_at", "is", null);

  if (options.lock) {
    query = query.forShare("device");
  }

  const row = await query.executeTakeFirst();

  return row ? toDevice(row) : null;
}

export async function loadDevice(
  db: Db,
  deviceId: string,
  options: { lock?: boolean } = {},
): Promise<ChatDeviceRecord | null> {
  let query = devices(db).where("device.id", "=", deviceId);

  if (options.lock) {
    query = query.forUpdate("device");
  }

  const row = await query.executeTakeFirst();

  return row ? toDevice(row) : null;
}

/** Every device of the accounts, live and revoked, oldest first. */
export async function devicesOf(
  db: Db,
  userIds: readonly string[],
): Promise<ChatDeviceRecord[]> {
  if (userIds.length === 0) {
    return [];
  }

  const rows = await devices(db)
    .where("device.user_id", "in", [...userIds])
    .orderBy("device.created_at")
    .orderBy("device.id")
    .execute();

  return rows.map(toDevice);
}

export async function currentAccountKey(
  db: Db,
  userId: string,
): Promise<{ id: string; publicKey: Uint8Array } | null> {
  const row = await db
    .selectFrom("app.chat_account_keys")
    .select(["id", "public_key"])
    .where("user_id", "=", userId)
    .where("replaced_at", "is", null)
    .executeTakeFirst();

  return row ? { id: row.id, publicKey: row.public_key } : null;
}

/**
 * Serializes changes to one account's chat identity (first device, reset,
 * links, revocations), whichever of its sessions makes them.
 */
export async function lockChatAccount(tx: Db, userId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`chat_account:${userId}`}, 0))`.execute(
    tx,
  );
}

export const certificateOf = (
  device: ChatDeviceRecord,
): DeviceCertificateWire => ({
  v: 1,
  accountId: device.userId,
  deviceId: device.id,
  deviceKey: toBase64(device.deviceKey),
  accountKey: toBase64(device.accountKey),
  signature: toBase64(device.certificateSignature),
});

export const revocationOf = (
  device: ChatDeviceRecord,
): DeviceRevocationWire | null =>
  device.revocationSignature
    ? {
        v: 1,
        accountId: device.userId,
        deviceId: device.id,
        accountKey: toBase64(device.accountKey),
        signature: toBase64(device.revocationSignature),
      }
    : null;

export const presentDevice = (device: ChatDeviceRecord): ChatDevice => ({
  deviceId: device.id,
  certificate: certificateOf(device),
  createdAt: device.createdAt.toISOString(),
  revokedAt: device.revokedAt?.toISOString() ?? null,
  revocation: revocationOf(device),
});

export interface ConversationRecord {
  readonly id: string;
  readonly kind: ChatConversationKind;
  readonly generation: number;
  readonly epoch: bigint;
  readonly participantIds: readonly string[];
  readonly lastActivityAt: Date;
  /** A `loan_logistics` conversation's channel and loan (WP-44). */
  readonly loanLogistics: {
    readonly channelId: string;
    readonly loanId: string;
  } | null;
}

/**
 * The conversation and its participants. `lock` holds the conversation row
 * for update: every commit and message for it is decided one at a time, so
 * exactly one commit wins each epoch (ADR-0010 §9).
 */
export async function loadConversation(
  db: Db,
  conversationId: string,
  options: { lock?: boolean } = {},
): Promise<ConversationRecord | null> {
  let query = db
    .selectFrom("app.chat_conversations as conversation")
    .select((eb) => [
      "conversation.id",
      "conversation.kind",
      "conversation.generation",
      "conversation.epoch",
      "conversation.last_activity_at",
      "conversation.loan_logistics_channel_id",
      eb
        .selectFrom("app.loan_logistics_channels as channel")
        .select("channel.loan_id")
        .whereRef(
          "channel.id",
          "=",
          "conversation.loan_logistics_channel_id",
        )
        .as("loan_id"),
    ])
    .where("conversation.id", "=", conversationId);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    return null;
  }

  const participants = await db
    .selectFrom("app.chat_participants")
    .select("user_id")
    .where("conversation_id", "=", conversationId)
    .orderBy("user_id")
    .execute();

  return {
    id: row.id,
    kind: row.kind as ChatConversationKind,
    generation: row.generation,
    epoch: BigInt(row.epoch),
    participantIds: participants.map((p) => p.user_id),
    lastActivityAt: row.last_activity_at,
    loanLogistics:
      row.loan_logistics_channel_id && row.loan_id
        ? { channelId: row.loan_logistics_channel_id, loanId: row.loan_id }
        : null,
  };
}

/**
 * Whether the conversation takes messages now. Every participant's account
 * must take new activity (PS-ADM-001), and then:
 * - private chat: no two of them have blocked each other (PS-USR-006,
 *   PS-COM-007); a lifted block opens it again;
 * - loan logistics: its channel is open (WP-44). A block is what the channel
 *   is for, so it does not close it. With `lock` the channel is held for
 *   share, so a closing waits until what this accepts is in.
 */
export async function conversationOpen(
  db: Db,
  conversation: ConversationRecord,
  options: { lock?: boolean } = {},
): Promise<boolean> {
  const statuses = await accountStatuses(db, conversation.participantIds);

  if (
    conversation.participantIds.some(
      (id) => !takesNewActivity(statuses.get(id) ?? "deleted"),
    )
  ) {
    return false;
  }

  if (conversation.loanLogistics) {
    const channel = await findChannel(
      db,
      conversation.loanLogistics.channelId,
      options.lock ? { lock: "share" } : {},
    );

    return channel?.closedAt === null;
  }

  const [first, ...rest] = conversation.participantIds;

  return first === undefined || !(await blockedWithAny(db, first, rest));
}

/** The devices the server delivers the generation's group to. */
export async function groupMembers(
  db: Db,
  conversationId: string,
  generation: number,
): Promise<string[]> {
  const rows = await db
    .selectFrom("app.chat_group_members as member")
    .innerJoin("app.chat_devices as device", "device.id", "member.device_id")
    .select("member.device_id")
    .where("member.conversation_id", "=", conversationId)
    .where("member.generation", "=", generation)
    .where("device.revoked_at", "is", null)
    .orderBy("member.device_id")
    .execute();

  return rows.map((row) => row.device_id);
}

/**
 * Deletes the messages no device still has to fetch: once every receiving
 * device has it, the server keeps nothing (ADR-0010 §8).
 */
export async function dropDelivered(
  db: Db,
  messageIds: readonly string[],
): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }

  await db
    .deleteFrom("app.chat_messages as message")
    .where("message.id", "in", [...messageIds])
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("app.chat_deliveries as delivery")
            .select("delivery.message_id")
            .whereRef("delivery.message_id", "=", "message.id"),
        ),
      ),
    )
    .execute();
}

/**
 * Shuts a device out: it is revoked, gets nothing more, and is taken out of
 * every group, with what was waiting for it.
 */
export async function shutOut(
  db: Db,
  deviceIds: readonly string[],
  now: Date,
  revocationSignature?: Uint8Array,
): Promise<void> {
  if (deviceIds.length === 0) {
    return;
  }

  await db
    .updateTable("app.chat_devices")
    .set({
      revoked_at: now,
      ...(revocationSignature && {
        revocation_signature: Buffer.from(revocationSignature),
      }),
    })
    .where("id", "in", [...deviceIds])
    .where("revoked_at", "is", null)
    .execute();
  await db
    .deleteFrom("app.chat_key_packages")
    .where("device_id", "in", [...deviceIds])
    .execute();
  await db
    .deleteFrom("app.chat_group_members")
    .where("device_id", "in", [...deviceIds])
    .execute();
  const waiting = await db
    .deleteFrom("app.chat_deliveries")
    .where("device_id", "in", [...deviceIds])
    .returning("message_id")
    .execute();
  await dropDelivered(
    db,
    waiting.map((row) => row.message_id),
  );
}

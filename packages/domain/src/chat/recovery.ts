import { createHash } from "node:crypto";
import {
  answerChatRecoveryPromptSchema,
  backUpChatHistorySchema,
  chatDeviceRegisteredSchema,
  chatDoneSchema,
  chatRecoveryBackupSchema,
  createChatRecoveryKeySchema,
  restoreChatAccountSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { rateLimits } from "../abuse/rate-limits";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import type { Actor } from "../actor";
import { actingUserId } from "../objects/state";
import {
  archiveResource,
  completeBackup,
  replacedBackups,
  unattachedArchives,
} from "./archives";
import {
  checkCertificate,
  deviceIdTaken,
  insertDevice,
  revokes,
  sessionOf,
} from "./devices";
import { chatAccountRestored, chatDeviceRevoked } from "./events";
import {
  answerChatRecoveryPromptPolicy,
  backUpChatHistoryPolicy,
  createChatRecoveryKeyPolicy,
  readChatRecoveryBackupPolicy,
  restoreChatAccountPolicy,
} from "./policies";
import { fromBase64, toBase64 } from "./signatures";
import {
  currentAccountKey,
  devicesOf,
  lockChatAccount,
  sessionDevice,
  shutOut,
} from "./store";

/**
 * The recovery key (ADR-0010 §8, PS-COM-019). The key itself never leaves
 * the user: a device seals the account key and the history archive's key
 * under a key derived from it, and the server keeps that backup and the
 * archive as ciphertext. With the key, a session without chat restores it
 * on a new device under the same account key, and every other device is
 * shut out; the contacts see no change of key.
 */

type Db = Kysely<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

async function loadRecovery(
  db: Db,
  userId: string,
  options: { lock?: boolean } = {},
) {
  let query = db
    .selectFrom("app.chat_recovery_keys as recovery")
    .leftJoin(
      "app.chat_archives as archive",
      "archive.id",
      "recovery.archive_id",
    )
    .select([
      "recovery.account_key_id",
      "recovery.key_id",
      "recovery.backup",
      "recovery.archive_id",
      "archive.part_count",
    ])
    .where("recovery.user_id", "=", userId);

  if (options.lock) {
    query = query.forUpdate("recovery");
  }

  return query.executeTakeFirst();
}

/**
 * Refuses to replace a backup other than the one the device read, so a
 * device never overwrites what another put in it since (revocations among
 * it), nor a backup it did not know was there.
 */
function checkReplaces(
  current: { backup: Uint8Array } | undefined,
  replaces: string | null,
) {
  const read = current
    ? replaces !== null &&
      createHash("sha256")
        .update(current.backup)
        .digest()
        .equals(fromBase64(replaces))
    : replaces === null;
  if (!read) conflict("The backup changed since it was read");
}

/**
 * Points the backup to its new archive, or none, if it replaces the backup
 * the device read. The archive the backup pointed to goes, with the
 * device's own unfinished ones; another device's stays until it is
 * attached or expires.
 */
async function replaceBackup(
  tx: Db,
  device: { id: string; userId: string; accountKeyId: string },
  input: {
    keyId: string;
    backup: string;
    archiveId: string | null;
    replaces: string | null;
  },
  now: Date,
  newKey: boolean,
) {
  const recovery = await loadRecovery(tx, device.userId, { lock: true });

  if (
    !newKey &&
    (!recovery || !Buffer.from(recovery.key_id).equals(fromBase64(input.keyId)))
  ) {
    conflict("A newer recovery key replaced this one");
  }
  checkReplaces(recovery, input.replaces);

  const backup = {
    backup: fromBase64(input.backup),
    archive_id: input.archiveId,
    backed_up_at: now,
  };
  const key = {
    account_key_id: device.accountKeyId,
    key_id: fromBase64(input.keyId),
    created_at: now,
  };

  await tx
    .insertInto("app.chat_recovery_keys")
    .values({ user_id: device.userId, ...key, ...backup })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet(newKey ? { ...key, ...backup } : backup),
    )
    .execute();
  await replacedBackups(
    tx,
    device.userId,
    device.id,
    recovery?.archive_id ?? null,
  ).execute();
}

/** The device, and the archive the backup is to point to, if any. */
async function backupResource(
  tx: Db,
  actor: Actor,
  archiveId: string | null,
  now: Date,
) {
  await lockChatAccount(tx, actingUserId(actor));

  if (archiveId !== null) {
    const { resource } = await archiveResource(
      tx,
      actor,
      archiveId,
      completeBackup(now),
      { lock: true },
    );
    return { resource, context: undefined };
  }

  const device = await sessionDevice(tx, actor, { lock: true });
  return {
    resource: { hasDevice: device !== null, device, own: true },
    context: undefined,
  };
}

/**
 * A new recovery key and its first backup, from one of the account's
 * devices. It replaces the earlier key, which stops working, and only the
 * backup the device read (none, if there was none), in the same step as
 * the archive of the history it held, so that history is never without a
 * backup.
 */
export const createChatRecoveryKey = defineCommand({
  name: "chat.create_recovery_key",
  input: createChatRecoveryKeySchema,
  output: chatDoneSchema,
  policy: createChatRecoveryKeyPolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: ({ tx, actor, input, now }) =>
    backupResource(tx, actor, input.archiveId, now),
  execute: async ({ tx, input, resource, now }) => {
    await replaceBackup(tx, resource.device!, input, now, true);

    return {};
  },
});

/**
 * A newer backup under the same key, pointing to a complete archive of the
 * device's history. A device whose key was replaced on another device is
 * refused, so it never overwrites the backup the newer key opens.
 */
export const backUpChatHistory = defineCommand({
  name: "chat.back_up_history",
  input: backUpChatHistorySchema,
  output: chatDoneSchema,
  policy: backUpChatHistoryPolicy,
  rateLimit: rateLimits.chatArchives,
  idempotency: "required",
  load: ({ tx, actor, input, now }) =>
    backupResource(tx, actor, input.archiveId, now),
  execute: async ({ tx, input, resource, now }) => {
    await replaceBackup(tx, resource.device!, input, now, false);

    return {};
  },
});

/** What a session needs to restore chat with the key: only ciphertext. */
export const readChatRecoveryBackup = defineQuery({
  name: "chat.read_recovery_backup",
  input: z.strictObject({}),
  policy: readChatRecoveryBackupPolicy,
  load: async ({ db, actor }) => {
    const recovery = await loadRecovery(db, actingUserId(actor));

    return {
      resource: { exists: recovery !== undefined, recovery },
      context: undefined,
    };
  },
  present: ({ resource }) => {
    const recovery = resource.recovery!;

    return chatRecoveryBackupSchema.parse({
      keyId: toBase64(recovery.key_id),
      backup: toBase64(recovery.backup),
      archive:
        recovery.archive_id && recovery.part_count
          ? { archiveId: recovery.archive_id, parts: recovery.part_count }
          : null,
    });
  },
});

/**
 * Restoring with the key (R3): this session's device under the account key
 * the backup held, and every other device shut out with a revocation that
 * key signed. Only someone who opened the backup can sign them.
 */
export const restoreChatAccount = defineCommand({
  name: "chat.restore_account",
  input: restoreChatAccountSchema,
  output: chatDeviceRegisteredSchema,
  policy: restoreChatAccountPolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: async ({ tx, actor }) => {
    const userId = actingUserId(actor);
    await lockChatAccount(tx, userId);
    const recovery = await loadRecovery(tx, userId, { lock: true });

    return {
      resource: { exists: recovery !== undefined, recovery },
      context: undefined,
    };
  },
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const userId = actingUserId(actor);

    if (await sessionDevice(tx, actor)) {
      conflict("This session already has a chat device");
    }

    const accountKey = await currentAccountKey(tx, userId);

    if (accountKey?.id !== resource.recovery!.account_key_id) {
      conflict("The backup holds an older account key");
    }

    checkCertificate(input.certificate, {
      userId,
      accountKey: accountKey.publicKey,
    });

    if (await deviceIdTaken(tx, input.certificate.deviceId)) {
      conflict("The device id is taken");
    }

    const live = (await devicesOf(tx, [userId])).filter(
      (device) => device.revokedAt === null,
    );

    for (const device of live) {
      const revocation = input.revocations.find((candidate) =>
        revokes(candidate, device),
      );

      if (!revocation) {
        throw new DomainError("invalid_input", "Invalid revocations", [
          "revocations",
        ]);
      }

      await shutOut(tx, [device.id], now, fromBase64(revocation.signature));
      events.record(chatDeviceRevoked, { resourceId: device.id, payload: {} });
    }

    // Whatever waited for the old devices is theirs, not this one's.
    await tx
      .deleteFrom("app.chat_link_requests")
      .where("user_id", "=", userId)
      .execute();
    await unattachedArchives(tx, userId)
      .where("purpose", "=", "link")
      .execute();
    await insertDevice(
      tx,
      input.certificate,
      accountKey.id,
      sessionOf(actor),
      input.description,
      now,
    );
    events.record(chatAccountRestored, {
      resourceId: input.certificate.deviceId,
      payload: {},
    });

    return { deviceId: input.certificate.deviceId };
  },
});

/**
 * «Ikke nå» to the offer, or an answer to the one reminder (PS-COM-019).
 * Each is kept from the first time, so neither comes back.
 */
export const answerChatRecoveryPrompt = defineCommand({
  name: "chat.answer_recovery_prompt",
  input: answerChatRecoveryPromptSchema,
  output: chatDoneSchema,
  policy: answerChatRecoveryPromptPolicy,
  idempotency: "required",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, actor, input, now }) => {
    const column =
      input.prompt === "offer" ? ("declined_at" as const) : "reminded_at";

    await tx
      .insertInto("app.chat_recovery_prompts")
      .values({ user_id: actingUserId(actor), [column]: now })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          [column]: sql<Date>`coalesce(${sql.ref(`app.chat_recovery_prompts.${column}`)}, ${sql.ref(`excluded.${column}`)})`,
        }),
      )
      .execute();

    return {};
  },
});

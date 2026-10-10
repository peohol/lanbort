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
import { actingUserId } from "../objects/state";
import { archiveLive, archiveResource, unattachedArchives } from "./archives";
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

/** The backup archives no backup points to: an older one, or a stray. */
const strayBackups = (db: Db, userId: string) =>
  unattachedArchives(db, userId).where("purpose", "=", "backup");

/**
 * A new recovery key and its first backup, from one of the account's
 * devices. It replaces the earlier key, which stops working.
 */
export const createChatRecoveryKey = defineCommand({
  name: "chat.create_recovery_key",
  input: createChatRecoveryKeySchema,
  output: chatDoneSchema,
  policy: createChatRecoveryKeyPolicy,
  rateLimit: rateLimits.chatKeys,
  idempotency: "required",
  load: async ({ tx, actor }) => {
    await lockChatAccount(tx, actingUserId(actor));
    const device = await sessionDevice(tx, actor, { lock: true });

    return {
      resource: { hasDevice: device !== null, device },
      context: undefined,
    };
  },
  execute: async ({ tx, input, resource, now }) => {
    const device = resource.device!;
    const row = {
      account_key_id: device.accountKeyId,
      key_id: fromBase64(input.keyId),
      backup: fromBase64(input.backup),
      archive_id: null,
      created_at: now,
      backed_up_at: now,
    };

    await tx
      .insertInto("app.chat_recovery_keys")
      .values({ user_id: device.userId, ...row })
      .onConflict((oc) => oc.column("user_id").doUpdateSet(row))
      .execute();
    await strayBackups(tx, device.userId).execute();

    return {};
  },
});

/**
 * A newer backup under the same key, pointing to a complete archive of the
 * device's history. The older archive goes. A device whose key was
 * replaced on another device is refused, so it never overwrites the
 * backup the newer key opens.
 */
export const backUpChatHistory = defineCommand({
  name: "chat.back_up_history",
  input: backUpChatHistorySchema,
  output: chatDoneSchema,
  policy: backUpChatHistoryPolicy,
  rateLimit: rateLimits.chatArchives,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    await lockChatAccount(tx, actingUserId(actor));

    return archiveResource(
      tx,
      actor,
      input.archiveId,
      (archive) =>
        archive.purpose === "backup" &&
        archive.completed_at !== null &&
        archiveLive(archive, now),
      { lock: true },
    );
  },
  execute: async ({ tx, actor, input, now }) => {
    const userId = actingUserId(actor);
    const recovery = await loadRecovery(tx, userId, { lock: true });

    if (
      !recovery ||
      !Buffer.from(recovery.key_id).equals(fromBase64(input.keyId))
    ) {
      conflict("A newer recovery key replaced this one");
    }

    await tx
      .updateTable("app.chat_recovery_keys")
      .set({
        backup: fromBase64(input.backup),
        archive_id: input.archiveId,
        backed_up_at: now,
      })
      .where("user_id", "=", userId)
      .execute();
    await strayBackups(tx, userId).execute();

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
    await insertDevice(tx, input.certificate, accountKey.id, sessionOf(actor));
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

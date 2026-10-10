import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import type { AccountDeletionStep } from "../account/deletion";
import { defineCommand } from "../commands/command";
import { defineConsumer } from "../outbox/consumer";
import { expiredArchives } from "./archives";
import { chatAccountKeyReset, chatDeviceRevoked } from "./events";
import { chatRetention } from "./model";
import { purgeChatDeliveryPolicy, restartChatGroupsPolicy } from "./policies";
import { dropDelivered } from "./store";

type Db = Kysely<Database>;

const countSchema = z.number().int().nonnegative();

async function deleted(query: {
  executeTakeFirst(): Promise<{ numDeletedRows: bigint }>;
}): Promise<number> {
  return Number((await query.executeTakeFirst()).numDeletedRows);
}

/**
 * Deletes what the delivery service may no longer keep (ADR-0010 §8):
 * ciphertext no device fetched in time, expired key packages, link
 * requests and history archives no backup points to. Run by the scheduled job `/api/internal/chat-retention`.
 */
export const purgeExpiredChat = defineCommand({
  name: "chat.purge_expired",
  input: z.strictObject({}),
  output: z.strictObject({
    messages: countSchema,
    keyPackages: countSchema,
    linkRequests: countSchema,
    archives: countSchema,
  }),
  policy: purgeChatDeliveryPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, now }) => ({
    messages: await deleted(
      tx
        .deleteFrom("app.chat_messages")
        .where(
          "created_at",
          "<",
          new Date(now.getTime() - chatRetention.ciphertextMs),
        ),
    ),
    keyPackages: await deleted(
      tx.deleteFrom("app.chat_key_packages").where("expires_at", "<=", now),
    ),
    linkRequests: await deleted(
      tx.deleteFrom("app.chat_link_requests").where("expires_at", "<=", now),
    ),
    archives: await deleted(expiredArchives(tx, now)),
  }),
});

/**
 * After a restore the server's epochs may lag the devices' (ADR-0010 §9).
 * Every conversation gets a new group generation, and the one-time key
 * packages, link requests, history archives and waiting ciphertext from
 * before are dropped; devices publish new packages and start the groups
 * anew. History on the devices stays. `pnpm ops:restore finish` runs it. It acts on what existed
 * when it runs, which after a restore is everything.
 */
export const restartChatGroups = defineCommand({
  name: "chat.restart_groups",
  input: z.strictObject({}),
  output: z.strictObject({ conversations: countSchema }),
  policy: restartChatGroupsPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, now }) => {
    await tx
      .deleteFrom("app.chat_messages")
      .where("created_at", "<=", now)
      .execute();
    await tx
      .deleteFrom("app.chat_group_members")
      .where("added_at", "<=", now)
      .execute();
    await tx
      .deleteFrom("app.chat_key_packages")
      .where("created_at", "<=", now)
      .execute();
    await tx
      .deleteFrom("app.chat_link_requests")
      .where("created_at", "<=", now)
      .execute();
    await tx
      .deleteFrom("app.chat_archives")
      .where("created_at", "<=", now)
      .execute();
    const restarted = await tx
      .updateTable("app.chat_conversations")
      .set((eb) => ({ generation: eb("generation", "+", 1), epoch: "0" }))
      .where("created_at", "<=", now)
      .executeTakeFirst();

    return { conversations: Number(restarted.numUpdatedRows) };
  },
});

/**
 * PS-ADM-006: a deleted account's chat identity goes with it: its account
 * keys, devices, key packages, recovery backup and what waited for them. The conversations
 * stay for the other participants, closed, without who the account was.
 */
export const chatAccountDeletionStep: AccountDeletionStep = {
  name: "chat",
  run: async (db, userId) => {
    const waiting = await db
      .deleteFrom("app.chat_deliveries")
      .where("device_id", "in", (eb) =>
        eb
          .selectFrom("app.chat_devices")
          .select("id")
          .where("user_id", "=", userId),
      )
      .returning("message_id")
      .execute();
    await db
      .deleteFrom("app.chat_link_requests")
      .where("user_id", "=", userId)
      .execute();
    for (const table of [
      "app.chat_recovery_keys",
      "app.chat_recovery_prompts",
      "app.chat_archives",
    ] as const) {
      await db.deleteFrom(table).where("user_id", "=", userId).execute();
    }
    await db
      .deleteFrom("app.chat_devices")
      .where("user_id", "=", userId)
      .execute();
    await db
      .deleteFrom("app.chat_account_keys")
      .where("user_id", "=", userId)
      .execute();
    await dropDelivered(
      db,
      waiting.map((row) => row.message_id),
    );
  },
};

/**
 * Ends the sign-in sessions of revoked devices (ADR-0010 §7), after commit:
 * a lost device is signed out as well as shut out of chat, even if its
 * session has since made a new device. After a reset, a session that
 * already has a new live device (the reset's own) stays.
 */
export function chatSessionEnding({ db }: { db: () => Db }) {
  return defineConsumer({
    name: "chat.end_device_sessions",
    eventTypes: [chatDeviceRevoked.type, chatAccountKeyReset.type],
    handle: async ({ event }) => {
      const revoked = db()
        .selectFrom("app.chat_devices as device")
        .select("device.session_id")
        .where("device.revoked_at", "is not", null);
      const rows = await (
        event.type === chatDeviceRevoked.type
          ? revoked.where("device.id", "=", event.resourceId)
          : revoked
              .where(
                "device.account_key_id",
                "=",
                chatAccountKeyReset.payload.parse(event.payload)
                  .previousAccountKeyId,
              )
              .where(({ not, exists, selectFrom }) =>
                not(
                  exists(
                    selectFrom("app.chat_devices as live")
                      .select("live.id")
                      .whereRef("live.session_id", "=", "device.session_id")
                      .where("live.revoked_at", "is", null),
                  ),
                ),
              )
      ).execute();

      if (rows.length > 0) {
        await sql`select app.end_auth_sessions(${rows.map((row) => row.session_id)}::text[])`.execute(
          db(),
        );
      }
    },
  });
}

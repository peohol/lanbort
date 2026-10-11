import {
  acknowledgeChatNoticeSchema,
  chatDoneSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { defineCommand } from "../commands/command";
import { actingUserId } from "../objects/state";
import { acknowledgeChatNoticePolicy } from "./policies";

/** Whether the account's owner confirmed the notice about chat (PS-COM-023). */
export async function chatNoticeAcknowledged(
  db: Kysely<Database>,
  userId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("app.chat_notice_acknowledgements")
    .select("user_id")
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return row !== undefined;
}

/**
 * The owner confirms having read that chat's encryption is tested internally
 * but not reviewed independently, before turning it on (PS-COM-023). The
 * first confirmation is kept; confirming again changes nothing.
 */
export const acknowledgeChatNotice = defineCommand({
  name: "chat.acknowledge_notice",
  input: acknowledgeChatNoticeSchema,
  output: chatDoneSchema,
  policy: acknowledgeChatNoticePolicy,
  idempotency: "required",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, actor, input, now }) => {
    await tx
      .insertInto("app.chat_notice_acknowledgements")
      .values({
        user_id: actingUserId(actor),
        notice: input.notice,
        acknowledged_at: now,
      })
      .onConflict((oc) => oc.column("user_id").doNothing())
      .execute();

    return {};
  },
});

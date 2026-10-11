import {
  acknowledgeChatNoticeSchema,
  chatDoneSchema,
  currentChatNotice,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { defineCommand } from "../commands/command";
import { actingUserId } from "../objects/state";
import { acknowledgeChatNoticePolicy } from "./policies";

/**
 * Whether the account's owner confirmed the notice about chat as it reads
 * now (PS-COM-023); an older wording does not count.
 */
export async function chatNoticeAcknowledged(
  db: Kysely<Database>,
  userId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("app.chat_notice_acknowledgements")
    .select("user_id")
    .where("user_id", "=", userId)
    .where("notice", "=", currentChatNotice)
    .executeTakeFirst();

  return row !== undefined;
}

/**
 * The owner confirms having read that chat's encryption is tested internally
 * but not reviewed independently, before turning it on (PS-COM-023). The
 * first confirmation of a notice is kept; confirming the same notice again
 * changes nothing, and a newer notice replaces an older confirmation.
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
      .onConflict((oc) =>
        oc
          .column("user_id")
          .doUpdateSet({
            notice: sql`excluded.notice`,
            acknowledged_at: sql`excluded.acknowledged_at`,
          })
          .whereRef(
            "app.chat_notice_acknowledgements.notice",
            "<>",
            "excluded.notice",
          ),
      )
      .execute();

    return {};
  },
});

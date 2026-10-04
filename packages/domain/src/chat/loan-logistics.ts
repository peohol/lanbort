import {
  chatConversationStartedSchema,
  startLoanLogisticsChatSchema,
} from "@lanbort/contracts";
import { defineCommand } from "../commands/command";
import { findChannel, joins } from "../loans/logistics-store";
import { actingUserId } from "../objects/state";
import { chatConversationStarted } from "./events";
import { startLoanLogisticsChatPolicy } from "./policies";

/**
 * WP-44 (PS-COM-007, ADR-0010): the encrypted conversation of a loan
 * logistics channel. It is a conversation of its own kind, never ordinary
 * chat, between exactly the channel's two people, and it takes messages,
 * commits and welcomes only while the channel is open (`conversationOpen`),
 * each message within one padding block (`conversationKinds`). Everything
 * else about it is the private chat's delivery service.
 *
 * Either party starts it; there is one per channel, so asking again gives
 * it back and shows it again in the caller's list. The channel is held
 * while deciding, so two parties starting at once get the same one, and a
 * closing channel waits.
 */
export const startLoanLogisticsChat = defineCommand({
  name: "chat.start_loan_logistics",
  input: startLoanLogisticsChatSchema,
  output: chatConversationStartedSchema,
  policy: startLoanLogisticsChatPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input }) => {
    const channel = await findChannel(tx, input.channelId, { lock: "update" });
    const party = channel !== null && joins(channel, actingUserId(actor));

    return {
      resource: {
        party,
        startable:
          party &&
          (channel.closedAt === null || channel.conversationId !== null),
        channel,
      },
      context: undefined,
    };
  },
  execute: async ({ tx, actor, resource, events, now }) => {
    const callerId = actingUserId(actor);
    const channel = resource.channel!;

    if (channel.conversationId) {
      await tx
        .updateTable("app.chat_participants")
        .set({ hidden_at: null })
        .where("conversation_id", "=", channel.conversationId)
        .where("user_id", "=", callerId)
        .execute();

      return { conversationId: channel.conversationId };
    }

    const { id } = await tx
      .insertInto("app.chat_conversations")
      .values({
        kind: "loan_logistics",
        loan_logistics_channel_id: channel.id,
        opened_via: "loan_logistics",
        created_by_user_id: callerId,
        created_at: now,
        last_activity_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await tx
      .insertInto("app.chat_participants")
      .values(
        [channel.borrowerUserId, channel.lenderUserId].map((user_id) => ({
          conversation_id: id,
          user_id,
        })),
      )
      .execute();

    events.record(chatConversationStarted, {
      resourceId: id,
      payload: { openedVia: "loan_logistics" },
    });

    return { conversationId: id };
  },
});

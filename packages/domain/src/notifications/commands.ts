import {
  markAllNotificationsReadSchema,
  markNotificationsReadSchema,
  type NotificationPreferences,
  notificationPreferencesSchema,
  notificationReadResultSchema,
  preferenceSubject,
  setNotificationPreferenceSchema,
} from "@lanbort/contracts";
import { sql } from "kysely";
import { defineCommand } from "../commands/command";
import { actingUserId } from "../objects/state";
import { presentPreferences } from "./model";
import {
  markAllNotificationsReadPolicy,
  markNotificationsReadPolicy,
  setNotificationPreferencePolicy,
} from "./policies";
import { countUnread, loadPreferences } from "./store";

/**
 * Marks the caller's notifications as read. Reading is the caller's own
 * matter: it changes nothing for anyone else and is never shown to them
 * (no read receipts, PS-COM-004), and it never hides a notification. Read
 * once stays read, so repeating it is harmless.
 */
export const markNotificationsRead = defineCommand({
  name: "notification.mark_read",
  input: markNotificationsReadSchema,
  output: notificationReadResultSchema,
  policy: markNotificationsReadPolicy,
  idempotency: "none",
  load: async ({ tx, input }) => {
    const ids = [...new Set(input.notificationIds)];
    const rows = await tx
      .selectFrom("app.notifications")
      .select("recipient_id")
      .where("id", "in", ids)
      .execute();

    // A missing id is answered like someone else's (PS-NFR-002).
    return rows.length === ids.length
      ? {
          resource: { recipientIds: rows.map((row) => row.recipient_id) },
          context: undefined,
        }
      : null;
  },
  execute: async ({ tx, actor, input, now }) => {
    const userId = actingUserId(actor);

    await tx
      .updateTable("app.notifications")
      .set({ read_at: now })
      .where("recipient_id", "=", userId)
      .where("id", "in", input.notificationIds)
      .where("read_at", "is", null)
      .execute();

    return { unreadCount: await countUnread(tx, userId) };
  },
});

/**
 * Marks everything up to and including `through`, the newest notification
 * the caller saw, as read. Notifications that arrived after it stay unread.
 */
export const markAllNotificationsRead = defineCommand({
  name: "notification.mark_all_read",
  input: markAllNotificationsReadSchema,
  output: notificationReadResultSchema,
  policy: markAllNotificationsReadPolicy,
  idempotency: "none",
  load: async ({ tx, input }) => {
    const row = await tx
      .selectFrom("app.notifications")
      .select("recipient_id")
      .where("id", "=", input.through)
      .executeTakeFirst();

    return row
      ? { resource: { recipientIds: [row.recipient_id] }, context: undefined }
      : null;
  },
  execute: async ({ tx, actor, input, now }) => {
    const userId = actingUserId(actor);

    await tx
      .updateTable("app.notifications")
      .set({ read_at: now })
      .where("recipient_id", "=", userId)
      .where("read_at", "is", null)
      .where(
        "position",
        "<=",
        sql<string>`(select position from app.notifications where id = ${input.through})`,
      )
      .execute();

    return { unreadCount: await countUnread(tx, userId) };
  },
});

/**
 * PS-COM-002/003: turns one configurable channel of one level, or of one
 * kind with its own choices (PS-COM-018), on or off.
 * It only decides how the caller is told from now on: no loan, case or
 * security status reads it, and required and action notifications stay in
 * the app whatever is chosen (the input and the database refuse anything
 * else). Setting the same value again changes nothing.
 */
export const setNotificationPreference = defineCommand({
  name: "notification.set_preference",
  input: setNotificationPreferenceSchema,
  output: notificationPreferencesSchema,
  policy: setNotificationPreferencePolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({
    tx,
    actor,
    input,
    now,
  }): Promise<NotificationPreferences> => {
    const userId = actingUserId(actor);

    await tx
      .insertInto("app.notification_preferences")
      .values({
        user_id: userId,
        level: preferenceSubject(input),
        channel: input.channel,
        enabled: input.enabled,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict
          .columns(["user_id", "level", "channel"])
          .doUpdateSet({ enabled: input.enabled, updated_at: now }),
      )
      .execute();

    return presentPreferences(
      (await loadPreferences(tx, [userId])).get(userId)!,
    );
  },
});

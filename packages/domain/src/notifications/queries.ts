import {
  type Notification,
  type NotificationKind,
  type NotificationList,
  notificationListQuerySchema,
  notificationPageSize,
  notificationReadQuerySchema,
  type NotificationPreferences,
  type NotificationReadResult,
  type NotificationTargetType,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { defineQuery } from "../commands/query";
import { actingUserId, inSnapshot } from "../objects/state";
import { presentPreferences } from "./model";
import {
  listNotificationsPolicy,
  readNotificationPolicy,
  readNotificationPreferencesPolicy,
} from "./policies";
import { countUnread, loadPreferences } from "./store";

type Db = Kysely<Database>;

/**
 * Rows before the cursor, newest first. Only the caller's own notification
 * is a cursor: any other id matches nothing and gives an empty page.
 */
function beforeCursor(userId: string, cursor: string | undefined) {
  return cursor === undefined
    ? sql<boolean>`true`
    : sql<boolean>`position < (
        select position from app.notifications
        where id = ${cursor} and recipient_id = ${userId}
      )`;
}

const notificationColumns = [
  "id",
  "kind",
  "level",
  "detail",
  "target_type",
  "target_id",
  "occurred_at",
  "read_at",
] as const;

function presentNotification(row: {
  id: string;
  kind: string;
  level: string;
  detail: string | null;
  target_type: string;
  target_id: string;
  occurred_at: Date;
  read_at: Date | null;
}): Notification {
  return {
    id: row.id,
    kind: row.kind as NotificationKind,
    level: row.level as Notification["level"],
    detail: row.detail,
    target: {
      type: row.target_type as NotificationTargetType,
      id: row.target_id,
    },
    occurredAt: row.occurred_at.toISOString(),
    readAt: row.read_at?.toISOString() ?? null,
  };
}

async function listPage(
  db: Db,
  userId: string,
  cursor: string | undefined,
): Promise<NotificationList> {
  const rows = await db
    .selectFrom("app.notifications")
    .select(notificationColumns)
    .where("recipient_id", "=", userId)
    .where(beforeCursor(userId, cursor))
    .orderBy("position", "desc")
    .limit(notificationPageSize + 1)
    .execute();
  const page = rows.slice(0, notificationPageSize);

  return {
    notifications: page.map(presentNotification),
    unreadCount: await countUnread(db, userId),
    nextCursor:
      rows.length > notificationPageSize ? (page.at(-1)?.id ?? null) : null,
  };
}

/**
 * The caller's notification centre, newest first (PS-COM-001, UX-IA-002):
 * what happened, how much it matters, and where it leads. Only the caller's
 * own notifications exist here.
 */
export const listNotifications = defineQuery({
  name: "notification.list",
  input: notificationListQuerySchema,
  policy: listNotificationsPolicy,
  load: ({ db, actor, input }) =>
    inSnapshot(db, async (tx) => ({
      resource: await listPage(tx, actingUserId(actor), input.cursor),
      context: undefined,
    })),
  present: ({ resource }): NotificationList => resource,
});

/**
 * One of the caller's own notifications, for the link in its e-mail
 * (UX-INT-010): it says where the notification leads. Anyone else's looks
 * like one that does not exist (PS-NFR-002).
 */
export const readNotification = defineQuery({
  name: "notification.read",
  input: notificationReadQuerySchema,
  policy: readNotificationPolicy,
  load: async ({ db, input }) => {
    const row = await db
      .selectFrom("app.notifications")
      .select([...notificationColumns, "recipient_id"])
      .where("id", "=", input.notificationId)
      .executeTakeFirst();

    if (!row) return null;
    const resource = { recipientIds: [row.recipient_id], row };

    return { resource, context: undefined };
  },
  present: ({ resource }): Notification => presentNotification(resource.row),
});

/**
 * Only the number of the caller's unread notifications, for the indicator
 * every page shows (UX-IA-002). Part of reading the notification centre.
 */
export const countUnreadNotifications = defineQuery({
  name: "notification.count_unread",
  input: z.strictObject({}),
  policy: listNotificationsPolicy,
  load: async ({ db, actor }) => ({
    resource: await countUnread(db, actingUserId(actor)),
    context: undefined,
  }),
  present: ({ resource }): NotificationReadResult => ({
    unreadCount: resource,
  }),
});

/** How the caller is told, per level and channel (PS-COM-003). */
export const readNotificationPreferences = defineQuery({
  name: "notification.read_preferences",
  input: z.strictObject({}),
  policy: readNotificationPreferencesPolicy,
  load: async ({ db, actor }) => {
    const userId = actingUserId(actor);
    const preferences = await loadPreferences(db, [userId]);

    return {
      resource: presentPreferences(preferences.get(userId)!),
      context: undefined,
    };
  },
  present: ({ resource }): NotificationPreferences => resource,
});

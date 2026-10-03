import type {
  NotificationChannel,
  NotificationLevel,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import {
  distinctDrafts,
  effectivePreferences,
  levelOf,
  type NotificationDraft,
  type PreferenceChoice,
  sendsEmail,
  shownInApp,
} from "./model";

type Db = Kysely<Database>;

/** The stored choices of each of `userIds`, over the pilot standard. */
export async function loadPreferences(db: Db, userIds: readonly string[]) {
  const rows =
    userIds.length === 0
      ? []
      : await db
          .selectFrom("app.notification_preferences")
          .select(["user_id", "level", "channel", "enabled"])
          .where("user_id", "in", [...userIds])
          .execute();

  return new Map(
    userIds.map((userId) => [
      userId,
      effectivePreferences(
        rows
          .filter((row) => row.user_id === userId)
          .map((row): PreferenceChoice => ({
            level: row.level as NotificationLevel,
            channel: row.channel as NotificationChannel,
            enabled: row.enabled,
          })),
      ),
    ]),
  );
}

/** What made a notification; unique per recipient. */
const sourceKeyOf = (source: string, draft: NotificationDraft) =>
  `${source}/${draft.kind}/${draft.target.id}`;

/**
 * Puts the drafts of one source (an event, or a deadline) in the recipients'
 * notification centres, as of `occurredAt`. A draft whose level the
 * recipient turned off in the app is left out (PS-COM-003). Each
 * notification is keyed by its source, kind and target, so making the same
 * source again (a redelivered event, a repeated job run) changes nothing.
 * This is the one way notifications are made. Those that also go out by
 * e-mail ({@link sendsEmail}) are queued for delivery here too; queueing
 * looks the notifications up by their keys, so a repeated run also queues
 * what an interrupted one did not.
 */
export async function recordNotifications(
  db: Db,
  source: string,
  occurredAt: Date,
  drafts: readonly NotificationDraft[],
): Promise<number> {
  const distinct = distinctDrafts(drafts);
  const preferences = await loadPreferences(db, [
    ...new Set(distinct.map((draft) => draft.recipientId)),
  ]);
  const chosen = (draft: NotificationDraft) =>
    preferences.get(draft.recipientId);
  const shown = distinct.filter((draft) => {
    const choices = chosen(draft);
    return choices !== undefined && shownInApp(levelOf(draft.kind), choices);
  });

  if (shown.length === 0) {
    return 0;
  }

  const inserted = await db
    .insertInto("app.notifications")
    .values(
      shown.map((draft) => ({
        recipient_id: draft.recipientId,
        kind: draft.kind,
        level: levelOf(draft.kind),
        detail: draft.detail ?? null,
        target_type: draft.target.type,
        target_id: draft.target.id,
        source_key: sourceKeyOf(source, draft),
        occurred_at: occurredAt,
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(["recipient_id", "source_key"]).doNothing(),
    )
    .returning("id")
    .execute();

  await queueEmails(
    db,
    source,
    shown.filter((draft) => sendsEmail(levelOf(draft.kind), chosen(draft)!)),
  );

  return inserted.length;
}

/** Queues one e-mail per notification made from these drafts, once. */
async function queueEmails(
  db: Db,
  source: string,
  drafts: readonly NotificationDraft[],
): Promise<void> {
  if (drafts.length === 0) {
    return;
  }

  await db
    .insertInto("app.notification_deliveries")
    .columns(["notification_id", "channel"])
    .expression((eb) =>
      eb
        .selectFrom("app.notifications")
        .select(["id", sql.lit("email").as("channel")])
        .where((where) =>
          where.or(
            drafts.map((draft) =>
              where.and([
                where("recipient_id", "=", draft.recipientId),
                where("source_key", "=", sourceKeyOf(source, draft)),
              ]),
            ),
          ),
        ),
    )
    .onConflict((conflict) =>
      conflict.columns(["notification_id", "channel"]).doNothing(),
    )
    .execute();
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const { count } = await db
    .selectFrom("app.notifications")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("recipient_id", "=", userId)
    .where("read_at", "is", null)
    .executeTakeFirstOrThrow();

  return Number(count);
}

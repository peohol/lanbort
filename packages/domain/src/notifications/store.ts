import type {
  NotificationChannel,
  NotificationLevel,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { accountStatuses } from "../account/store";
import {
  distinctDrafts,
  effectivePreferences,
  levelOf,
  type NotificationDraft,
  type PreferenceChoice,
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

/**
 * Puts the drafts of one source (an event, or a deadline) in the recipients'
 * notification centres, as of `occurredAt`. A draft whose level the
 * recipient turned off in the app is left out (PS-COM-003). Each
 * notification is keyed by its source, kind and target, so making the same
 * source again (a redelivered event, a repeated job run) changes nothing.
 * A deleted account is told nothing any more (PS-ADM-006). This is the one
 * way notifications are made; external delivery (WP-41) starts from what it
 * inserts.
 */
export async function recordNotifications(
  db: Db,
  source: string,
  occurredAt: Date,
  drafts: readonly NotificationDraft[],
): Promise<number> {
  const distinct = distinctDrafts(drafts);
  const recipients = [...new Set(distinct.map((draft) => draft.recipientId))];
  const preferences = await loadPreferences(db, recipients);
  const statuses = await accountStatuses(db, recipients);
  const shown = distinct.filter((draft) => {
    const chosen = preferences.get(draft.recipientId);
    const status = statuses.get(draft.recipientId);
    return (
      chosen !== undefined &&
      status !== undefined &&
      status !== "deleted" &&
      shownInApp(levelOf(draft.kind), chosen)
    );
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
        source_key: `${source}/${draft.kind}/${draft.target.id}`,
        occurred_at: occurredAt,
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(["recipient_id", "source_key"]).doNothing(),
    )
    .returning("id")
    .execute();

  return inserted.length;
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

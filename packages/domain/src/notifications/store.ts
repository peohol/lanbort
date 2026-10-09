import {
  chatMessageCountDetail,
  chatMessageCountOf,
  type NotificationChannel,
  type NotificationSubject,
  subjectOf,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { accountStatuses } from "../account/store";
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
            level: row.level as NotificationSubject,
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
 * A deleted account is told nothing any more (PS-ADM-006). This is the one
 * way notifications are made. Those that also go out by e-mail
 * ({@link sendsEmail}) are queued for delivery here too; queueing looks the
 * notifications up by their keys, so a repeated run also queues what an
 * interrupted one did not.
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
  const chosen = (draft: NotificationDraft) =>
    preferences.get(draft.recipientId);
  const shown = distinct.filter((draft) => {
    const choices = chosen(draft);
    const status = statuses.get(draft.recipientId);
    return (
      choices !== undefined &&
      status !== undefined &&
      status !== "deleted" &&
      shownInApp(subjectOf(draft.kind), choices)
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
    shown.filter((draft) => sendsEmail(draft.kind, chosen(draft)!)),
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

/**
 * How long the e-mail about new messages waits, so one already read in the
 * app is not sent at all (PS-COM-018).
 */
export const chatMessageEmailDelayMs = 10 * 60_000;

const chatMessages = "chat.new_messages";

/**
 * PS-COM-018: tells the recipients of a new chat message, with one
 * notification per conversation until it is read. A message before then
 * counts in the unread one, which moves to the top of the list; its e-mail,
 * waiting or sent, is the only one until it is read. Sending a message is
 * not a domain event (ADR-0010 §12), so the chat command calls this itself,
 * under the conversation's lock. Whoever muted the conversation is left out
 * by the caller; the recipient's own choices for new messages apply.
 */
export async function recordChatMessage(
  db: Db,
  input: {
    readonly conversationId: string;
    /** The message's own key, such as its position. */
    readonly messageKey: string;
    readonly recipientIds: readonly string[];
    readonly occurredAt: Date;
  },
): Promise<void> {
  const { conversationId, recipientIds, occurredAt } = input;
  const [preferences, statuses] = await Promise.all([
    loadPreferences(db, recipientIds),
    accountStatuses(db, recipientIds),
  ]);

  for (const recipientId of recipientIds) {
    const choices = preferences.get(recipientId);
    const status = statuses.get(recipientId);

    if (
      choices === undefined ||
      status === undefined ||
      status === "deleted" ||
      !shownInApp(subjectOf(chatMessages), choices)
    ) {
      continue;
    }

    const unread = await db
      .selectFrom("app.notifications")
      .select(["id", "detail"])
      .where("recipient_id", "=", recipientId)
      .where("kind", "=", chatMessages)
      .where("target_id", "=", conversationId)
      .where("read_at", "is", null)
      .forUpdate()
      .executeTakeFirst();

    if (unread !== undefined) {
      await db
        .updateTable("app.notifications")
        .set({
          detail: chatMessageCountDetail(chatMessageCountOf(unread.detail) + 1),
          occurred_at: occurredAt,
          // A new position puts it at the top of the list.
          position: sql`default`,
        })
        .where("id", "=", unread.id)
        .execute();
      continue;
    }

    const { id } = await db
      .insertInto("app.notifications")
      .values({
        recipient_id: recipientId,
        kind: chatMessages,
        level: levelOf(chatMessages),
        detail: chatMessageCountDetail(1),
        target_type: "chat_conversation",
        target_id: conversationId,
        source_key: `chat/${conversationId}/${input.messageKey}`,
        occurred_at: occurredAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    if (sendsEmail(chatMessages, choices)) {
      await db
        .insertInto("app.notification_deliveries")
        .values({
          notification_id: id,
          channel: "email",
          available_at: new Date(
            occurredAt.getTime() + chatMessageEmailDelayMs,
          ),
        })
        .execute();
    }
  }
}

/** The recipient opened the conversation: its messages are no longer new. */
export async function markChatMessagesRead(
  db: Db,
  recipientId: string,
  conversationId: string,
  now: Date,
): Promise<void> {
  await db
    .updateTable("app.notifications")
    .set({ read_at: now })
    .where("recipient_id", "=", recipientId)
    .where("kind", "=", chatMessages)
    .where("target_id", "=", conversationId)
    .where("read_at", "is", null)
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

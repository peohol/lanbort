import { randomUUID } from "node:crypto";
import type { NotificationKind, NotificationLevel } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { EmailSendError, type EmailSender } from "@lanbort/email";
import { writeLog } from "@lanbort/observability";
import { type Kysely, sql } from "kysely";
import {
  defaultRetryDelaySeconds,
  type OutboxWorkerOptions,
} from "../outbox/worker";
import { composeNotificationEmail } from "./email";
import { sendsEmail } from "./model";
import { notificationEmailProcess } from "./policies";
import { loadPreferences } from "./store";

export interface NotificationEmailServices {
  readonly sender: EmailSender;
  /** The app's public address, for the link back. */
  readonly appUrl: string;
}

export interface NotificationEmailOptions extends OutboxWorkerOptions {
  readonly clock?: () => Date;
}

/**
 * An e-mail that is not out within a day of its notification is not sent.
 * By then it no longer helps with anything time-critical, and the provider
 * only recognises a repeated send for 24 hours, so a later retry could send
 * it twice.
 */
export const notificationEmailMaxAgeMs = 24 * 60 * 60 * 1000;

export interface NotificationEmailBatchResult {
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  dead: number;
}

const defaults = {
  batchSize: 20,
  leaseSeconds: 120,
  maxAttempts: 10,
  retryDelaySeconds: defaultRetryDelaySeconds,
} satisfies Required<OutboxWorkerOptions>;

interface ClaimedDelivery {
  id: string;
  attempts: number;
}

/** A claimed delivery, read again under its lock. */
interface CurrentDelivery extends ClaimedDelivery {
  notificationId: string;
  recipientId: string;
  kind: NotificationKind;
  level: NotificationLevel;
  readAt: Date | null;
  notifiedAt: Date;
  address: string | null;
}

/**
 * Claims due deliveries with `FOR UPDATE SKIP LOCKED`, as the outbox worker
 * does, so concurrent runs never send the same one, oldest first. The
 * claim moves `available_at` to the lease expiry: if this run dies, it is
 * retried.
 */
async function claim(
  db: Kysely<Database>,
  leaseToken: string,
  batchSize: number,
  leaseSeconds: number,
): Promise<ClaimedDelivery[]> {
  const result = await sql<ClaimedDelivery>`
    with due as (
      select id, available_at
      from app.notification_deliveries
      where status = 'pending' and available_at <= now() and channel = 'email'
      order by available_at, id
      limit ${batchSize}
      for update skip locked
    ), claimed as (
      update app.notification_deliveries as delivery
      set lease_token = ${leaseToken},
          attempts = delivery.attempts + 1,
          available_at = now() + make_interval(secs => ${leaseSeconds})
      from due
      where delivery.id = due.id
      returning delivery.id, delivery.attempts, due.available_at
    )
    select id, attempts from claimed order by available_at, id
  `.execute(db);

  return result.rows;
}

/**
 * Locks a claimed delivery, then reads what decides whether it is still
 * worth sending. Reading after the lock, in statements of their own, sees
 * every change committed before it: whoever reads the notification, changes
 * a channel or the verified address locks the recipient's pending
 * deliveries too (database triggers), so they wait for this transaction or
 * it waits for them. Null if the lease is lost.
 */
async function lockCurrent(
  tx: Kysely<Database>,
  claimed: ClaimedDelivery,
  leaseToken: string,
): Promise<CurrentDelivery | null> {
  const locked = await tx
    .selectFrom("app.notification_deliveries")
    .select("notification_id")
    .where("id", "=", claimed.id)
    .where("lease_token", "=", leaseToken)
    .where("status", "=", "pending")
    .forUpdate()
    .executeTakeFirst();

  if (!locked) {
    return null;
  }

  const notification = await tx
    .selectFrom("app.notifications as notification")
    .leftJoin("app.verified_contacts as contact", (join) =>
      join
        .onRef("contact.user_id", "=", "notification.recipient_id")
        .on("contact.kind", "=", "email"),
    )
    .select([
      "notification.recipient_id",
      "notification.kind",
      "notification.level",
      "notification.read_at",
      "notification.created_at",
      "contact.address",
    ])
    .where("notification.id", "=", locked.notification_id)
    .executeTakeFirstOrThrow();

  return {
    ...claimed,
    notificationId: locked.notification_id,
    recipientId: notification.recipient_id,
    kind: notification.kind as NotificationKind,
    level: notification.level as NotificationLevel,
    readAt: notification.read_at,
    notifiedAt: notification.created_at,
    address: notification.address,
  };
}

type Outcome =
  | { status: "sent" }
  | { status: "skipped" | "dead"; code: string }
  | { status: "pending"; code: string; retryInSeconds: number };

/** Only the holder of the current lease may settle a delivery. */
async function settle(
  tx: Kysely<Database>,
  delivery: ClaimedDelivery,
  leaseToken: string,
  outcome: Outcome,
): Promise<void> {
  const pending = outcome.status === "pending";

  await tx
    .updateTable("app.notification_deliveries")
    .set({
      status: outcome.status,
      lease_token: null,
      code: outcome.status === "sent" ? null : outcome.code,
      finished_at: pending ? null : sql<Date>`now()`,
      available_at: pending
        ? sql<Date>`now() + make_interval(secs => ${outcome.retryInSeconds})`
        : sql<Date>`available_at`,
    })
    .where("id", "=", delivery.id)
    .where("lease_token", "=", leaseToken)
    .where("status", "=", "pending")
    .execute();
}

/**
 * Why a delivery is no longer worth sending, if it is not: too old, already
 * read in the app (the e-mail is only a reserve), e-mail turned off since,
 * or no verified address any more.
 */
function skipReason(
  delivery: CurrentDelivery,
  emailStillChosen: boolean,
  now: Date,
): string | null {
  if (
    now.getTime() - delivery.notifiedAt.getTime() >
    notificationEmailMaxAgeMs
  ) {
    return "expired";
  }

  if (delivery.readAt !== null) {
    return "read";
  }

  if (!emailStillChosen) {
    return "turned_off";
  }

  return delivery.address === null ? "no_address" : null;
}

/**
 * Sends one batch of due notification e-mails (WP-41). Each delivery is
 * checked, sent and settled on its own, in one transaction that holds its
 * lock (see {@link lockCurrent}), so a change that makes the e-mail
 * pointless, once committed, always stops it. A failure is retried later
 * with the outbox's backoff, and never touches the notification or the
 * domain (PS-COM-002). Every attempt uses the same idempotency key, so the
 * provider sends a message once even if a result is lost.
 */
export async function deliverNotificationEmails(
  db: Kysely<Database>,
  services: NotificationEmailServices,
  options: NotificationEmailOptions = {},
): Promise<NotificationEmailBatchResult> {
  const { clock = () => new Date(), ...rest } = options;
  const settings = { ...defaults, ...rest };
  const leaseToken = randomUUID();
  const claimed = await claim(
    db,
    leaseToken,
    settings.batchSize,
    settings.leaseSeconds,
  );
  const result: NotificationEmailBatchResult = {
    claimed: claimed.length,
    sent: 0,
    skipped: 0,
    retried: 0,
    dead: 0,
  };

  for (const delivery of claimed) {
    const outcome = await db.transaction().execute(async (tx) => {
      const current = await lockCurrent(tx, delivery, leaseToken);

      if (!current) {
        return null;
      }

      const chosen = (await loadPreferences(tx, [current.recipientId])).get(
        current.recipientId,
      );
      const settled = await attempt(
        current,
        chosen !== undefined && sendsEmail(current.kind, chosen),
        clock(),
        services,
        settings,
      );

      await settle(tx, delivery, leaseToken, settled);
      return settled;
    });

    if (outcome) {
      result[outcome.status === "pending" ? "retried" : outcome.status] += 1;
    }
  }

  writeLog("info", "notification_email.batch_processed", {
    job: notificationEmailProcess,
    count: result.claimed,
  });

  return result;
}

async function attempt(
  delivery: CurrentDelivery,
  emailStillChosen: boolean,
  now: Date,
  services: NotificationEmailServices,
  settings: Required<OutboxWorkerOptions>,
): Promise<Outcome> {
  const skip = skipReason(delivery, emailStillChosen, now);

  if (skip !== null || delivery.address === null) {
    return { status: "skipped", code: skip ?? "no_address" };
  }

  try {
    await services.sender.send({
      to: delivery.address,
      ...composeNotificationEmail({
        kind: delivery.kind,
        level: delivery.level,
        notificationId: delivery.notificationId,
        appUrl: services.appUrl,
      }),
      idempotencyKey: `notification-email/${delivery.id}`,
    });
    return { status: "sent" };
  } catch (error) {
    const failure =
      error instanceof EmailSendError
        ? error
        : new EmailSendError("unexpected_error", true);
    const dead =
      !failure.retryable || delivery.attempts >= settings.maxAttempts;

    writeLog(dead ? "error" : "warn", "notification_email.failed", {
      job: notificationEmailProcess,
      attempt: delivery.attempts,
    });

    return dead
      ? { status: "dead", code: failure.code }
      : {
          status: "pending",
          code: failure.code,
          retryInSeconds: settings.retryDelaySeconds(delivery.attempts),
        };
  }
}

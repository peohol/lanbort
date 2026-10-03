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
  notification_id: string;
  recipient_id: string;
  kind: string;
  level: string;
  read_at: Date | null;
  notified_at: Date;
  address: string | null;
}

/**
 * Claims due deliveries with `FOR UPDATE SKIP LOCKED`, as the outbox worker
 * does, so concurrent runs never send the same one. The claim moves
 * `available_at` to the lease expiry: if this run dies, it is retried.
 */
async function claim(
  db: Kysely<Database>,
  leaseToken: string,
  batchSize: number,
  leaseSeconds: number,
): Promise<ClaimedDelivery[]> {
  const result = await sql<ClaimedDelivery>`
    with due as (
      select id
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
      returning delivery.id, delivery.attempts, delivery.notification_id
    )
    select claimed.id, claimed.attempts, claimed.notification_id,
      notification.recipient_id, notification.kind, notification.level,
      notification.read_at, notification.created_at as notified_at,
      contact.address
    from claimed
    join app.notifications as notification
      on notification.id = claimed.notification_id
    left join app.verified_contacts as contact
      on contact.user_id = notification.recipient_id and contact.kind = 'email'
    order by notification.position
  `.execute(db);

  return result.rows;
}

type Outcome =
  | { status: "sent" }
  | { status: "skipped" | "dead"; code: string }
  | { status: "pending"; code: string; retryInSeconds: number };

/** Only the holder of the current lease may settle a delivery. */
async function settle(
  db: Kysely<Database>,
  delivery: ClaimedDelivery,
  leaseToken: string,
  outcome: Outcome,
): Promise<boolean> {
  const pending = outcome.status === "pending";
  const result = await db
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
    .executeTakeFirst();

  return result.numUpdatedRows > 0n;
}

/**
 * Why a delivery is no longer worth sending, if it is not: too old, already
 * read in the app (the e-mail is only a reserve), e-mail turned off since,
 * or no verified address any more.
 */
function skipReason(
  delivery: ClaimedDelivery,
  emailStillChosen: boolean,
  now: Date,
): string | null {
  if (
    now.getTime() - delivery.notified_at.getTime() >
    notificationEmailMaxAgeMs
  ) {
    return "expired";
  }

  if (delivery.read_at !== null) {
    return "read";
  }

  if (!emailStillChosen) {
    return "turned_off";
  }

  return delivery.address === null ? "no_address" : null;
}

/**
 * Sends one batch of due notification e-mails (WP-41). Each delivery is
 * sent and settled on its own: a failure is retried later with the outbox's
 * backoff, and never touches the notification or the domain (PS-COM-002).
 * Every attempt uses the same idempotency key, so the provider sends a
 * message once even if a result is lost.
 */
export async function deliverNotificationEmails(
  db: Kysely<Database>,
  services: NotificationEmailServices,
  options: NotificationEmailOptions = {},
): Promise<NotificationEmailBatchResult> {
  const { clock = () => new Date(), ...rest } = options;
  const settings = { ...defaults, ...rest };
  const leaseToken = randomUUID();
  const deliveries = await claim(
    db,
    leaseToken,
    settings.batchSize,
    settings.leaseSeconds,
  );
  const preferences = await loadPreferences(db, [
    ...new Set(deliveries.map((delivery) => delivery.recipient_id)),
  ]);
  const result: NotificationEmailBatchResult = {
    claimed: deliveries.length,
    sent: 0,
    skipped: 0,
    retried: 0,
    dead: 0,
  };

  for (const delivery of deliveries) {
    const kind = delivery.kind as NotificationKind;
    const level = delivery.level as NotificationLevel;
    const chosen = preferences.get(delivery.recipient_id);
    const skip = skipReason(
      delivery,
      chosen !== undefined && sendsEmail(kind, chosen),
      clock(),
    );
    let outcome: Outcome;

    if (skip !== null || delivery.address === null) {
      outcome = { status: "skipped", code: skip ?? "no_address" };
    } else {
      try {
        await services.sender.send({
          to: delivery.address,
          ...composeNotificationEmail({
            kind,
            level,
            notificationId: delivery.notification_id,
            appUrl: services.appUrl,
          }),
          idempotencyKey: `notification-email/${delivery.id}`,
        });
        outcome = { status: "sent" };
      } catch (error) {
        const failure =
          error instanceof EmailSendError
            ? error
            : new EmailSendError("unexpected_error", true);

        outcome =
          !failure.retryable || delivery.attempts >= settings.maxAttempts
            ? { status: "dead", code: failure.code }
            : {
                status: "pending",
                code: failure.code,
                retryInSeconds: settings.retryDelaySeconds(delivery.attempts),
              };

        writeLog(
          outcome.status === "dead" ? "error" : "warn",
          "notification_email.failed",
          { job: notificationEmailProcess, attempt: delivery.attempts },
        );
      }
    }

    if (await settle(db, delivery, leaseToken, outcome)) {
      result[outcome.status === "pending" ? "retried" : outcome.status] += 1;
    }
  }

  writeLog("info", "notification_email.batch_processed", {
    job: notificationEmailProcess,
    count: result.claimed,
  });

  return result;
}

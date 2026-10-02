import { randomUUID } from "node:crypto";
import type { Database } from "@lanbort/database";
import { writeLog } from "@lanbort/observability";
import { type Kysely, sql } from "kysely";
import {
  type ConsumerRegistry,
  OutboxDeliveryError,
  type StoredEvent,
} from "./consumer";

export interface OutboxWorkerOptions {
  /** Messages claimed per run. */
  batchSize?: number;
  /** How long a claim is held before another worker may retry the message. */
  leaseSeconds?: number;
  /** Attempts before a message is parked as `dead` for manual follow-up. */
  maxAttempts?: number;
  /** Delay before the next attempt after the given (1-based) failed attempt. */
  retryDelaySeconds?: (attempt: number) => number;
}

export interface OutboxBatchResult {
  claimed: number;
  succeeded: number;
  retried: number;
  dead: number;
}

const defaults = {
  batchSize: 20,
  leaseSeconds: 120,
  maxAttempts: 10,
  // 30 s, 1 min, 2 min, … capped at 1 h.
  retryDelaySeconds: (attempt: number) =>
    Math.min(30 * 2 ** (attempt - 1), 3600),
} satisfies Required<OutboxWorkerOptions>;

interface ClaimedMessage {
  id: string;
  consumer: string;
  attempts: number;
  event_id: string;
  event_type: string;
  event_version: number;
  resource_type: string;
  resource_id: string;
  correlation_id: string | null;
  occurred_at: Date;
  payload: unknown;
}

/**
 * Claims due messages of the given consumers with `FOR UPDATE SKIP LOCKED`,
 * so concurrent workers never receive the same message. A worker only claims
 * messages it has a consumer for. The claim moves `available_at` to the lease
 * expiry: if this worker dies, the message becomes claimable again.
 */
async function claim(
  db: Kysely<Database>,
  consumerNames: readonly string[],
  leaseToken: string,
  batchSize: number,
  leaseSeconds: number,
): Promise<ClaimedMessage[]> {
  if (consumerNames.length === 0) {
    return [];
  }

  const result = await sql<ClaimedMessage>`
    with due as (
      select id
      from app.outbox_messages
      where status = 'pending' and available_at <= now()
        and consumer in (${sql.join(consumerNames)})
      order by available_at, id
      limit ${batchSize}
      for update skip locked
    ), claimed as (
      update app.outbox_messages as message
      set lease_token = ${leaseToken},
          attempts = message.attempts + 1,
          available_at = now() + make_interval(secs => ${leaseSeconds})
      from due
      where message.id = due.id
      returning message.id, message.consumer, message.attempts, message.event_id
    )
    select claimed.id, claimed.consumer, claimed.attempts, claimed.event_id,
      event.event_type, event.event_version, event.resource_type,
      event.resource_id, event.correlation_id, event.occurred_at, event.payload
    from claimed
    join app.audit_events as event on event.id = claimed.event_id
    order by event.position
  `.execute(db);

  return result.rows;
}

function toStoredEvent(message: ClaimedMessage): StoredEvent {
  return {
    id: message.event_id,
    type: message.event_type,
    version: message.event_version,
    resourceType: message.resource_type,
    resourceId: message.resource_id,
    correlationId: message.correlation_id,
    occurredAt: message.occurred_at,
    payload: message.payload,
  };
}

/** Only the holder of the current lease may settle a message. */
async function settle(
  db: Kysely<Database>,
  message: ClaimedMessage,
  leaseToken: string,
  outcome:
    | { status: "succeeded" }
    | { status: "pending" | "dead"; errorCode: string; retryInSeconds: number },
): Promise<boolean> {
  const finished = outcome.status !== "pending";
  const result = await db
    .updateTable("app.outbox_messages")
    .set({
      status: outcome.status,
      lease_token: null,
      finished_at: finished ? sql<Date>`now()` : null,
      last_error: outcome.status === "succeeded" ? null : outcome.errorCode,
      available_at:
        outcome.status === "pending"
          ? sql<Date>`now() + make_interval(secs => ${outcome.retryInSeconds})`
          : sql<Date>`available_at`,
    })
    .where("id", "=", message.id)
    .where("lease_token", "=", leaseToken)
    .where("status", "=", "pending")
    .executeTakeFirst();

  return result.numUpdatedRows > 0n;
}

function failureOf(error: unknown): { code: string; permanent: boolean } {
  return error instanceof OutboxDeliveryError
    ? { code: error.code, permanent: error.permanent }
    : { code: "unexpected_error", permanent: false };
}

/**
 * Processes one batch of due outbox messages. Each message is handled and
 * settled independently: a failing consumer is retried later without
 * affecting the committed domain change or any other consumer.
 */
export async function processOutboxBatch(
  db: Kysely<Database>,
  consumers: ConsumerRegistry,
  options: OutboxWorkerOptions = {},
): Promise<OutboxBatchResult> {
  const settings = { ...defaults, ...options };
  const leaseToken = randomUUID();
  const messages = await claim(
    db,
    consumers.names,
    leaseToken,
    settings.batchSize,
    settings.leaseSeconds,
  );
  const result: OutboxBatchResult = {
    claimed: messages.length,
    succeeded: 0,
    retried: 0,
    dead: 0,
  };

  for (const message of messages) {
    const consumer = consumers.get(message.consumer);

    try {
      if (!consumer) {
        throw new Error(
          `Claimed message for unknown consumer ${message.consumer}`,
        );
      }

      await consumer.handle({
        messageId: message.id,
        attempt: message.attempts,
        event: toStoredEvent(message),
      });

      if (await settle(db, message, leaseToken, { status: "succeeded" })) {
        result.succeeded += 1;
      }
    } catch (error) {
      const failure = failureOf(error);
      const status =
        failure.permanent || message.attempts >= settings.maxAttempts
          ? "dead"
          : "pending";

      const settled = await settle(db, message, leaseToken, {
        status,
        errorCode: failure.code,
        retryInSeconds: settings.retryDelaySeconds(message.attempts),
      });

      if (settled) {
        result[status === "dead" ? "dead" : "retried"] += 1;
      }

      writeLog(status === "dead" ? "error" : "warn", "outbox.delivery_failed", {
        job: message.consumer,
        attempt: message.attempts,
      });
    }
  }

  writeLog("info", "outbox.batch_processed", {
    job: "outbox",
    count: result.claimed,
  });

  return result;
}

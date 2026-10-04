import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { StoredEvent } from "../outbox/consumer";

/**
 * Whether some session of this database waits for a lock, polled for up to
 * `ms`. Other test files share the database, so this can end the wait early;
 * the race is then only less strict, never wrongly failed.
 */
async function someoneWaits(db: Kysely<Database>, ms = 2000) {
  for (const until = Date.now() + ms; Date.now() < until;) {
    const { rows } = await sql<{ waiting: number }>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    `.execute(db);

    if (rows[0]!.waiting > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Makes `change` in a transaction that is still open when `racer` starts,
 * and commits it once `racer` waits for a lock. This is the interleaving a
 * check-then-act without locks gets wrong: `racer` would read the state from
 * before the change and act on it after the change has committed. With the
 * right locks, `racer` waits and then sees the change. `changedAt` is the
 * database's time once the change was made: whatever `racer` wrote after
 * that was decided while the change was under way.
 *
 * The racer must not go through the outbox: a batch it claimed would hold
 * other test files' events while it waits.
 */
export async function commitWhileRacing<T>(
  db: Kysely<Database>,
  change: (tx: Kysely<Database>) => Promise<unknown>,
  racer: () => Promise<T>,
): Promise<{ value: T; changedAt: Date }> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let made!: (at: Date) => void;
  const changed = new Promise<Date>((resolve) => {
    made = resolve;
  });
  const committed = db.transaction().execute(async (tx) => {
    await change(tx);
    const { rows } = await sql<{
      at: Date;
    }>`select clock_timestamp() as at`.execute(tx);
    made(rows[0]!.at);
    await released;
  });

  const changedAt = await Promise.race([changed, committed.then(() => null)]);

  if (changedAt === null) {
    throw new Error("The change committed before the race started");
  }

  const raced = racer().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await someoneWaits(db);
  release();
  await committed;
  const outcome = await raced;

  if ("error" in outcome) {
    throw outcome.error;
  }

  return { value: outcome.value, changedAt };
}

/** What leaving an environment changes, as the change to race with. */
export const endMembership =
  (environmentId: string, userId: string, now: Date) =>
  (tx: Kysely<Database>) =>
    tx
      .updateTable("app.environment_memberships")
      .set({
        state: "ended",
        end_reason: "left",
        ended_at: now,
        review_stage: null,
        transition_deadline: null,
        updated_at: now,
      })
      .where("environment_id", "=", environmentId)
      .where("user_id", "=", userId)
      .where("state", "=", "active")
      .execute();

/** The kinds of the recipient's notifications made since `since`. */
export async function notifiedSince(
  db: Kysely<Database>,
  recipientId: string,
  since: Date,
): Promise<string[]> {
  const rows = await db
    .selectFrom("app.notifications")
    .select("kind")
    .where("recipient_id", "=", recipientId)
    .where("created_at", ">=", since)
    .orderBy("position")
    .execute();

  return rows.map((row) => row.kind);
}

/** The latest stored event of `type` about `resourceId`, as consumers get it. */
export async function storedEvent(
  db: Kysely<Database>,
  type: string,
  resourceId: string,
): Promise<StoredEvent> {
  const row = await db
    .selectFrom("app.audit_events")
    .selectAll()
    .where("event_type", "=", type)
    .where("resource_id", "=", resourceId)
    .orderBy("position", "desc")
    .executeTakeFirstOrThrow();

  return {
    id: row.id,
    type: row.event_type,
    version: row.event_version,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    actorUserId: row.actor_user_id,
    correlationId: row.correlation_id,
    occurredAt: row.occurred_at,
    payload: row.payload,
  };
}

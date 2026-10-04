import type { NotificationKind } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { tell } from "../notifications/rule";
import { recordNotifications } from "../notifications/store";
import { calendarDate, deriveAvailability } from "../objects/availability";
import { loadAvailabilityBlocks } from "../objects/blocks";
import { loadAvailability } from "../objects/state";
import { whereUserFinds } from "../publications/queries";
import { holdFinding } from "../publications/store";

type Db = Kysely<Database>;

/**
 * Whether each object is available for new loans now (PS-OBJ-003–005), by
 * the one derivation every read uses. Objects that no longer exist are left
 * out.
 */
export async function availableForNewLoans(
  db: Db,
  objectIds: readonly string[],
  now: Date,
): Promise<Map<string, boolean>> {
  if (objectIds.length === 0) {
    return new Map();
  }

  const objects = await db
    .selectFrom("app.objects")
    .select(["id", "status"])
    .where("id", "in", [...objectIds])
    .execute();
  const ids = objects.map((object) => object.id);
  // One after another: the caller may hold a single connection.
  const availability = await loadAvailability(db, ids);
  const blocks = await loadAvailabilityBlocks(db, ids);
  const today = calendarDate(now);

  return new Map(
    objects.map((object) => [
      object.id,
      deriveAvailability({
        status: object.status as "active" | "archived",
        availability: availability.get(object.id) ?? [],
        blocks: blocks.get(object.id) ?? [],
        today,
      }).availableForNewLoans,
    ]),
  );
}

export interface SubscriptionRow {
  readonly id: string;
  readonly user_id: string;
  readonly object_id: string;
}

/**
 * PS-OBJ-014: the subscriptions whose subscriber still finds the object in
 * one of their environments. Only these are ever told anything, so a
 * subscription never reveals an object its subscriber can no longer see.
 */
export async function withAccess<S extends SubscriptionRow>(
  db: Db,
  subscriptions: readonly S[],
  now: Date,
): Promise<S[]> {
  const kept: S[] = [];

  for (const userId of new Set(subscriptions.map((row) => row.user_id))) {
    const rows = subscriptions.filter((row) => row.user_id === userId);
    const found = await whereUserFinds(
      db,
      userId,
      rows.map((row) => row.object_id),
      now,
    );

    kept.push(...rows.filter((row) => found.has(row.object_id)));
  }

  return kept;
}

/** The same notification for each subscription, each led to its own. */
export function tellSubscribers(
  subscriptions: readonly SubscriptionRow[],
  kind: NotificationKind,
) {
  return subscriptions.flatMap((subscription) =>
    tell([subscription.user_id], kind, {
      type: "object_subscription",
      id: subscription.id,
    }),
  );
}

/** Subscriptions looked at per transaction, so that a look holds few locks. */
const lookBatchSize = 50;

/** The subscriptions a look covers: those of some objects, or all. */
export type LookScope = { readonly objectIds: readonly string[] } | "all";

/**
 * Looks at the subscribed objects' availability again and tells the
 * subscribers of each object that has become available for new loans since
 * their last look (vision 04, «Abonnement»). A batch of subscriptions at a
 * time, each in its own transaction (`lookAtBatch`); a look that stops
 * half-way can simply run again. `source` keys the notifications (see
 * `recordNotifications`).
 */
export async function lookAgain(
  db: Db,
  scope: LookScope,
  source: string,
  now: Date,
): Promise<number> {
  let notified = 0;
  let after: string | null = null;

  do {
    const batch: { notified: number; last: string | null } = await db
      .transaction()
      .execute((tx) => lookAtBatch(tx, scope, after, source, now));

    notified += batch.notified;
    after = batch.last;
  } while (after !== null);

  return notified;
}

/**
 * One batch of a look. The subscriptions are locked first, in one order, so
 * two looks at the same subscription run one after the other and the second
 * sees what the first stored. What the subscribers' access rests on is held
 * next (`holdFinding`), so access lost at the same time is either seen here
 * or lost only after these notifications exist. Only then is availability
 * derived, from the state committed by then. Whoever no longer finds the
 * object is not told, but their last look is stored all the same, so
 * regaining access later tells them nothing old. Returns the last
 * subscription looked at while there may be more.
 */
async function lookAtBatch(
  tx: Db,
  scope: LookScope,
  after: string | null,
  source: string,
  now: Date,
): Promise<{ notified: number; last: string | null }> {
  if (scope !== "all" && scope.objectIds.length === 0) {
    return { notified: 0, last: null };
  }

  let query = tx
    .selectFrom("app.object_subscriptions")
    .select(["id", "user_id", "object_id", "available"])
    .orderBy("id")
    .limit(lookBatchSize)
    .forUpdate();

  if (scope !== "all") {
    query = query.where("object_id", "in", [...scope.objectIds]);
  }

  if (after !== null) {
    query = query.where("id", ">", after);
  }

  const subscriptions = await query.execute();
  const objectIds = [...new Set(subscriptions.map((row) => row.object_id))];

  // Losing access, like ending the subscription, waits for this look.
  await holdFinding(
    tx,
    subscriptions.map((row) => ({
      userId: row.user_id,
      objectId: row.object_id,
    })),
  );
  const available = await availableForNewLoans(tx, objectIds, now);
  const changed = subscriptions.filter((row) => {
    const current = available.get(row.object_id);
    return current !== undefined && current !== row.available;
  });

  for (const value of [true, false]) {
    const ids = changed
      .filter((row) => available.get(row.object_id) === value)
      .map((row) => row.id);

    if (ids.length > 0) {
      await tx
        .updateTable("app.object_subscriptions")
        .set({ available: value, available_checked_at: now })
        .where("id", "in", ids)
        .execute();
    }
  }

  const becameAvailable = changed.filter((row) => !row.available);

  return {
    notified: await recordNotifications(
      tx,
      source,
      now,
      tellSubscribers(
        await withAccess(tx, becameAvailable, now),
        "object.available",
      ),
    ),
    last:
      subscriptions.length === lookBatchSize ? subscriptions.at(-1)!.id : null,
  };
}

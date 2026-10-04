import {
  objectSubscriptionResultSchema,
  subscribeToObjectSchema,
  unsubscribeFromObjectSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { defineCommand } from "../commands/command";
import { actingUserId } from "../objects/state";
import { whereUserFinds } from "../publications/queries";
import {
  subscribeToObjectPolicy,
  unsubscribeFromObjectPolicy,
} from "./policies";
import { availableForNewLoans, lookAgain } from "./store";

/**
 * PS-OBJ-014: subscribes the caller to an object they find in one of their
 * environments. The subscription starts from the object's availability now,
 * so only a later change to available is told. Subscribing again changes
 * nothing.
 */
export const subscribeToObject = defineCommand({
  name: "object_subscription.subscribe",
  input: subscribeToObjectSchema,
  output: objectSubscriptionResultSchema,
  policy: subscribeToObjectPolicy,
  idempotency: "none",
  load: async ({ tx, actor, input, now }) => ({
    resource: {
      found:
        actor.kind === "user" &&
        (await whereUserFinds(tx, actor.userId, [input.objectId], now)).has(
          input.objectId,
        ),
    },
    context: undefined,
  }),
  execute: async ({ tx, actor, input, now }) => {
    const available = await availableForNewLoans(tx, [input.objectId], now);

    await tx
      .insertInto("app.object_subscriptions")
      .values({
        user_id: actingUserId(actor),
        object_id: input.objectId,
        available: available.get(input.objectId) ?? false,
        available_checked_at: now,
      })
      .onConflict((conflict) =>
        conflict.columns(["user_id", "object_id"]).doNothing(),
      )
      .execute();

    return { objectId: input.objectId, subscribed: true };
  },
});

/**
 * Ends the caller's subscription to the object, whether or not they still
 * see it. Only the caller's own row is touched, and the answer is the same
 * whether there was one, so it reveals nothing about the object.
 */
export const unsubscribeFromObject = defineCommand({
  name: "object_subscription.unsubscribe",
  input: unsubscribeFromObjectSchema,
  output: objectSubscriptionResultSchema,
  policy: unsubscribeFromObjectPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, actor, input }) => {
    await tx
      .deleteFrom("app.object_subscriptions")
      .where("user_id", "=", actingUserId(actor))
      .where("object_id", "=", input.objectId)
      .execute();

    return { objectId: input.objectId, subscribed: false };
  },
});

/**
 * Looks at every subscribed object again ({@link lookAgain}). Events make
 * most changes known at once (`objectAvailabilityWatcher`); this catches
 * what only time changes, such as a return day passing without a confirmed
 * return. A batch of subscriptions per transaction rather than one command,
 * so the job never holds the locks of all of them at once; the caller
 * authorizes the scheduler first (`lookAtSubscribedObjectsPolicy`). Safe to
 * run repeatedly and concurrently.
 */
export async function lookAtSubscribedObjects(
  db: Kysely<Database>,
  now: Date,
): Promise<{ notified: number }> {
  return {
    notified: await lookAgain(db, "all", `look:${now.getTime()}`, now),
  };
}

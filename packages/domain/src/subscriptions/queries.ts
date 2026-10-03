import {
  type ObjectSubscriptionList,
  objectSubscriptionPageSize,
  objectSubscriptionsQuerySchema,
} from "@lanbort/contracts";
import { sql } from "kysely";
import { defineQuery } from "../commands/query";
import {
  calendarDate,
  deriveAvailability,
  toApiInterval,
} from "../objects/availability";
import { loadAvailabilityBlocks } from "../objects/blocks";
import {
  actingUserId,
  inSnapshot,
  loadAvailability,
  loadImages,
} from "../objects/state";
import { presentContent, whereUserFinds } from "../publications/queries";
import { listObjectSubscriptionsPolicy } from "./policies";

/**
 * The caller's subscriptions, newest first (PS-OBJ-014). An object is shown
 * only where the caller finds it now, exactly as in the environment's own
 * list; a subscription whose object they no longer find is listed as
 * inactive with nothing about the object, so it can still be ended.
 */
export const listObjectSubscriptions = defineQuery({
  name: "object_subscription.list",
  input: objectSubscriptionsQuerySchema,
  policy: listObjectSubscriptionsPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const userId = actingUserId(actor);
      const rows = await tx
        .selectFrom("app.object_subscriptions")
        .select(["id", "object_id", "created_at"])
        .where("user_id", "=", userId)
        .where(
          input.cursor === undefined
            ? sql<boolean>`true`
            : sql<boolean>`(created_at, id) < (
                select created_at, id from app.object_subscriptions
                where id = ${input.cursor} and user_id = ${userId}
              )`,
        )
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(objectSubscriptionPageSize + 1)
        .execute();
      const items = rows.slice(0, objectSubscriptionPageSize);
      const found = await whereUserFinds(
        tx,
        userId,
        items.map((row) => row.object_id),
        now,
      );
      const ids = [...found.keys()];
      const objects =
        ids.length === 0
          ? []
          : await tx
              .selectFrom("app.objects")
              .select([
                "id as object_id",
                "status",
                "title",
                "category_id",
                "description",
                "loan_terms",
              ])
              .where("id", "in", ids)
              .execute();
      // One connection serves the snapshot, so these run one after another.
      const images = await loadImages(tx, ids);
      const availability = await loadAvailability(tx, ids);
      const blocks = await loadAvailabilityBlocks(tx, ids);

      return {
        resource: {
          items,
          nextCursor:
            rows.length > objectSubscriptionPageSize
              ? (items.at(-1)?.id ?? null)
              : null,
          found,
          objects: new Map(objects.map((row) => [row.object_id, row])),
          images,
          availability,
          blocks,
        },
        context: undefined,
      };
    }),
  present: ({ resource, now }): ObjectSubscriptionList => ({
    subscriptions: resource.items.map((row) => {
      const object = resource.objects.get(row.object_id);
      const foundIn = resource.found.get(row.object_id) ?? [];
      const derived =
        object &&
        deriveAvailability({
          status: object.status as "active" | "archived",
          availability: resource.availability.get(row.object_id) ?? [],
          blocks: resource.blocks.get(row.object_id) ?? [],
          today: calendarDate(now),
        });

      return {
        id: row.id,
        objectId: row.object_id,
        createdAt: row.created_at.toISOString(),
        active: object !== undefined && foundIn.length > 0,
        object:
          object && derived && foundIn.length > 0
            ? {
                ...presentContent(object, resource.images),
                effectiveAvailability: derived.effective.map(toApiInterval),
                availableForNewLoans: derived.availableForNewLoans,
                foundIn: [...foundIn],
              }
            : null,
      };
    }),
    nextCursor: resource.nextCursor,
  }),
});

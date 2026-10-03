import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { EventDefinition } from "../events/catalog";
import * as loanEvents from "../loans/events";
import * as objectEvents from "../objects/events";
import { defineConsumer, type StoredEvent } from "../outbox/consumer";
import { lookAgain } from "./store";

const isEvent = (value: unknown): value is EventDefinition<unknown> =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  "resourceType" in value;

/**
 * Every event that can change an object's actual availability: whatever
 * happens to the object itself (its availability, archiving, restrictions,
 * freezes) or to one of its loans (reservations, handovers, returns and
 * their disputes). Technical audit events never change it. Listing the
 * event modules rather than single events keeps a new kind of change from
 * being missed.
 */
export const availabilityEventTypes = [
  ...Object.values(objectEvents),
  ...Object.values(loanEvents),
]
  .filter(isEvent)
  .filter(
    (event) =>
      event.kind === "domain" &&
      ["object", "loan"].includes(event.resourceType),
  )
  .map((event) => event.type);

async function objectOf(db: Kysely<Database>, event: StoredEvent) {
  if (event.resourceType === "object") {
    return event.resourceId;
  }

  const loan = await db
    .selectFrom("app.loans")
    .select("object_id")
    .where("id", "=", event.resourceId)
    .executeTakeFirst();

  return loan?.object_id ?? null;
}

export const objectAvailabilityConsumerName = "object_subscriptions.watch";

/**
 * Looks at an object's availability again after each committed event that
 * may have changed it, and tells its subscribers when it has become
 * available (outbox, at-least-once). The look and its notifications are one
 * transaction, so a redelivered event finds nothing new to tell.
 */
export function objectAvailabilityWatcher({
  db,
  clock = () => new Date(),
}: {
  readonly db: () => Kysely<Database>;
  readonly clock?: () => Date;
}) {
  return defineConsumer({
    name: objectAvailabilityConsumerName,
    eventTypes: availabilityEventTypes,
    handle: async ({ event }) => {
      await db()
        .transaction()
        .execute(async (tx) => {
          const objectId = await objectOf(tx, event);

          if (objectId !== null) {
            await lookAgain(tx, [objectId], `event:${event.id}`, clock());
          }
        });
    },
  });
}

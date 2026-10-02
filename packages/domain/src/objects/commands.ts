import {
  changesSomething,
  createObjectSchema,
  objectEditSchema,
  type ObjectChangeField,
  objectIdSchema,
  objectVersionSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import { type DateInterval, normalizeAvailability } from "./availability";
import {
  objectArchived,
  objectCreated,
  objectRestored,
  objectUpdated,
} from "./events";
import {
  archiveObjectPolicy,
  createObjectPolicy,
  restoreObjectPolicy,
  updateObjectPolicy,
} from "./policies";
import { recordRevision } from "./revisions";
import {
  actingUserId,
  bumpVersion,
  loadAvailability,
  loadObjectState,
  requireSelectableCategory,
} from "./state";

async function storeAvailability(
  db: Kysely<Database>,
  objectId: string,
  availability: readonly DateInterval[],
): Promise<void> {
  if (availability.length > 0) {
    await db
      .insertInto("app.object_availability_intervals")
      .values(
        availability.map((interval) => ({
          object_id: objectId,
          period: sql<string>`daterange(${interval.from}::date, ${interval.until}::date, '[)')`,
        })),
      )
      .execute();
  }
}

/** Replaces the object's general availability with `availability`. */
export async function replaceAvailability(
  db: Kysely<Database>,
  objectId: string,
  availability: readonly DateInterval[],
): Promise<void> {
  await db
    .deleteFrom("app.object_availability_intervals")
    .where("object_id", "=", objectId)
    .execute();
  await storeAvailability(db, objectId, availability);
}

export function sameIntervals(
  a: readonly DateInterval[],
  b: readonly DateInterval[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (interval, i) =>
        interval.from === b[i]?.from && interval.until === b[i]?.until,
    )
  );
}

/**
 * Creates an object with the actor as its first owner (PS-OBJ-001,
 * PS-OBJ-002, UX-JRN-003). The object is global: it belongs to its owners,
 * not to any environment. Retry-safe, so a double submit creates one object.
 */
export const createObject = defineCommand({
  name: "object.create",
  input: createObjectSchema,
  output: objectVersionSchema,
  policy: createObjectPolicy,
  idempotency: "required",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, actor, input, events, now }) => {
    const userId = actingUserId(actor);
    const availability = normalizeAvailability(input.availability);
    await requireSelectableCategory(tx, input.categoryId);

    const object = await tx
      .insertInto("app.objects")
      .values({
        title: input.title,
        category_id: input.categoryId,
        description: input.description,
        loan_terms: input.loanTerms,
        created_by_user_id: userId,
        created_at: now,
        updated_at: now,
      })
      .returning(["id", "version"])
      .executeTakeFirstOrThrow();

    await tx
      .insertInto("app.object_owners")
      .values({ object_id: object.id, user_id: userId, added_at: now })
      .execute();
    await storeAvailability(tx, object.id, availability);
    await recordRevision(
      tx,
      object.id,
      { actorUserId: userId, change: "created" },
      now,
    );

    events.record(objectCreated, {
      resourceId: object.id,
      payload: { version: object.version },
    });

    return { objectId: object.id, version: object.version };
  },
});

/**
 * Edits an object's global content and general availability. The edit must
 * be based on the current version; otherwise it is refused with `conflict`
 * and the client has to fetch and resolve the newer data first, so nobody
 * silently overwrites someone else's change (docs/architecture/05).
 */
export const updateObject = defineCommand({
  name: "object.update",
  input: objectEditSchema
    .extend({ objectId: objectIdSchema })
    .refine(changesSomething, { path: ["$"] }),
  output: objectVersionSchema,
  policy: updateObjectPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const state = await loadObjectState(tx, input.objectId, { lock: true });

    return state ? { resource: state, context: undefined } : null;
  },
  execute: async ({ tx, actor, input, resource, events, now }) => {
    if (input.expectedVersion !== resource.version) {
      throw new DomainError("conflict", "The object has changed", [
        "expectedVersion",
      ]);
    }

    const current = {
      title: resource.title,
      categoryId: resource.categoryId,
      description: resource.description,
      loanTerms: resource.loanTerms,
    };
    const changed: ObjectChangeField[] = (
      ["title", "categoryId", "description", "loanTerms"] as const
    ).filter(
      (field) => input[field] !== undefined && input[field] !== current[field],
    );

    if (changed.includes("categoryId")) {
      await requireSelectableCategory(tx, input.categoryId as string);
    }

    const availability =
      input.availability === undefined
        ? undefined
        : normalizeAvailability(input.availability);
    const availabilityChanged =
      availability !== undefined &&
      !sameIntervals(
        availability,
        (await loadAvailability(tx, [resource.objectId])).get(
          resource.objectId,
        ) ?? [],
      );

    if (availabilityChanged) {
      changed.push("availability");
    }

    // Nothing differs: nothing to record, and the version stays.
    if (changed.length === 0) {
      return { objectId: resource.objectId, version: resource.version };
    }

    if (availabilityChanged) {
      await replaceAvailability(tx, resource.objectId, availability);
    }

    const version = await bumpVersion(
      tx,
      resource,
      now,
      { actorUserId: actingUserId(actor), change: "updated" },
      {
        title: input.title ?? resource.title,
        category_id: input.categoryId ?? resource.categoryId,
        description: input.description ?? resource.description,
        loan_terms:
          input.loanTerms === undefined ? resource.loanTerms : input.loanTerms,
      },
    );

    events.record(objectUpdated, {
      resourceId: resource.objectId,
      payload: { version, changedFields: changed },
    });

    return { objectId: resource.objectId, version };
  },
});

const objectReference = z.strictObject({ objectId: objectIdSchema });

/**
 * Reversible archive (PS-OBJ-016): the object is kept with everything it has,
 * but it is not offered for new loans. Nothing is deleted.
 */
export const archiveObject = defineCommand({
  name: "object.archive",
  input: objectReference,
  output: objectVersionSchema,
  policy: archiveObjectPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const state = await loadObjectState(tx, input.objectId, { lock: true });

    return state ? { resource: state, context: undefined } : null;
  },
  execute: async ({ tx, actor, resource, events, now }) => {
    if (resource.status !== "active") {
      throw new DomainError("conflict", "The object is already archived");
    }

    const version = await bumpVersion(
      tx,
      resource,
      now,
      { actorUserId: actingUserId(actor), change: "archived" },
      { status: "archived", archived_at: now },
    );
    events.record(objectArchived, {
      resourceId: resource.objectId,
      payload: { version },
    });

    return { objectId: resource.objectId, version };
  },
});

/** Brings an archived object back, exactly as it was. */
export const restoreObject = defineCommand({
  name: "object.restore",
  input: objectReference,
  output: objectVersionSchema,
  policy: restoreObjectPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const state = await loadObjectState(tx, input.objectId, { lock: true });

    return state ? { resource: state, context: undefined } : null;
  },
  execute: async ({ tx, actor, resource, events, now }) => {
    if (resource.status !== "archived") {
      throw new DomainError("conflict", "The object is not archived");
    }

    const version = await bumpVersion(
      tx,
      resource,
      now,
      { actorUserId: actingUserId(actor), change: "restored" },
      { status: "active", archived_at: null },
    );
    events.record(objectRestored, {
      resourceId: resource.objectId,
      payload: { version },
    });

    return { objectId: resource.objectId, version };
  },
});

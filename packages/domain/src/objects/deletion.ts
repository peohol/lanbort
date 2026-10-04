import { objectDeletionResultSchema, objectIdSchema } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import {
  loadCommitments,
  type ObjectCommitmentSource,
  objectCommitmentSources,
} from "./commitments";
import {
  objectDeleted,
  objectDeletionConsented,
  objectDeletionConsentWithdrawn,
  objectImageRemoved,
} from "./events";
import {
  consentToObjectDeletionPolicy,
  withdrawObjectDeletionConsentPolicy,
} from "./policies";
import { actingUserId, loadLockedObject, type ObjectState } from "./state";

const objectReference = z.strictObject({ objectId: objectIdSchema });

/** Tables holding the object's own rows, children first. */
const objectRowTables = [
  "app.object_subscriptions",
  // Their posts go with them.
  "app.object_questions",
  "app.environment_publications",
  "app.object_deletion_consents",
  "app.object_co_owner_invitations",
  "app.object_restrictions",
  "app.object_freezes",
  "app.object_revisions",
  "app.object_images",
  "app.object_availability_intervals",
  "app.object_owners",
] as const;

/**
 * Removes the object with its content and history rows. The append-only
 * events keep ids only, and the image files are deleted after commit like
 * removed images (outbox).
 */
async function deleteObject(
  tx: Kysely<Database>,
  object: ObjectState,
  events: EventRecorder,
  now: Date,
): Promise<void> {
  // Loan requests outlive the object as the parties' history: open ones end
  // neutrally, and all of them let go of the rows deleted below.
  await sql`select app.release_loan_requests(${object.objectId}, ${now})`.execute(
    tx,
  );

  const images = await tx
    .selectFrom("app.object_images")
    .select("id")
    .where("object_id", "=", object.objectId)
    .execute();

  for (const { id } of images) {
    events.record(objectImageRemoved, {
      resourceId: object.objectId,
      payload: { version: object.version, imageId: id },
    });
  }

  for (const table of objectRowTables) {
    await tx
      .deleteFrom(table)
      .where("object_id", "=", object.objectId)
      .execute();
  }

  await tx
    .deleteFrom("app.objects")
    .where("id", "=", object.objectId)
    .execute();
  events.record(objectDeleted, {
    resourceId: object.objectId,
    payload: { version: object.version },
  });
}

/**
 * PS-OBJ-011: permanent deletion needs consent from every registered owner,
 * and is refused while the object has a reserved, active or unresolved loan.
 * The consent that completes the set deletes the object; for a sole owner
 * that is their own. A consent ends if its owner leaves, and a new co-owner
 * has to consent too.
 */
export function defineConsentToObjectDeletion(
  sources: readonly ObjectCommitmentSource[],
) {
  return defineCommand({
    name: "object.consent_to_deletion",
    input: objectReference,
    output: objectDeletionResultSchema,
    policy: consentToObjectDeletionPolicy,
    idempotency: "required",
    load: ({ tx, input }) => loadLockedObject(tx, input.objectId),
    execute: async ({ tx, actor, resource, events, now }) => {
      const { objectId } = resource;

      if ((await loadCommitments(tx, objectId, sources)).length > 0) {
        throw new DomainError("conflict", "The object has commitments");
      }

      const consented = await tx
        .insertInto("app.object_deletion_consents")
        .values({
          object_id: objectId,
          user_id: actingUserId(actor),
          consented_at: now,
        })
        .onConflict((conflict) => conflict.doNothing())
        .returning("user_id")
        .executeTakeFirst();

      if (consented) {
        events.record(objectDeletionConsented, {
          resourceId: objectId,
          payload: {},
        });
      }

      const consents = await tx
        .selectFrom("app.object_deletion_consents")
        .select("user_id")
        .where("object_id", "=", objectId)
        .execute();
      const allConsent = resource.ownerIds.every((ownerId) =>
        consents.some((consent) => consent.user_id === ownerId),
      );

      if (allConsent) {
        await deleteObject(tx, resource, events, now);
      }

      return { objectId, deleted: allConsent };
    },
  });
}

export const consentToObjectDeletion = defineConsentToObjectDeletion(
  objectCommitmentSources,
);

export const withdrawObjectDeletionConsent = defineCommand({
  name: "object.withdraw_deletion_consent",
  input: objectReference,
  output: objectDeletionResultSchema,
  policy: withdrawObjectDeletionConsentPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedObject(tx, input.objectId),
  execute: async ({ tx, actor, resource, events }) => {
    const withdrawn = await tx
      .deleteFrom("app.object_deletion_consents")
      .where("object_id", "=", resource.objectId)
      .where("user_id", "=", actingUserId(actor))
      .executeTakeFirst();

    if (withdrawn.numDeletedRows > 0n) {
      events.record(objectDeletionConsentWithdrawn, {
        resourceId: resource.objectId,
        payload: {},
      });
    }

    return { objectId: resource.objectId, deleted: false };
  },
});

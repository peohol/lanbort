import {
  objectIdSchema,
  objectRestrictionResultSchema,
  setObjectRestrictionSchema,
} from "@lanbort/contracts";
import { sql } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { fromApiInterval } from "./availability";
import { objectRestrictionLifted, objectRestrictionSet } from "./events";
import {
  liftObjectRestrictionPolicy,
  setObjectRestrictionPolicy,
} from "./policies";
import { actingUserId, loadLockedObject, loadObjectState } from "./state";

/**
 * PS-OBJ-008: any owner can restrict new commitments for a period, or for
 * every date. Until the same owner withdraws it or leaves, no new loan can be
 * made in that period, whatever another owner does to the general
 * availability. Existing loans are not affected, and ordinary content edits
 * are not restricted.
 */
export const setObjectRestriction = defineCommand({
  name: "object.set_restriction",
  input: setObjectRestrictionSchema,
  output: objectRestrictionResultSchema,
  policy: setObjectRestrictionPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedObject(tx, input.objectId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const period = input.period && fromApiInterval(input.period);
    const { id } = await tx
      .insertInto("app.object_restrictions")
      .values({
        object_id: resource.objectId,
        set_by_user_id: actingUserId(actor),
        period: period
          ? sql<string>`daterange(${period.from}::date, ${period.until}::date, '[)')`
          : null,
        created_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(objectRestrictionSet, {
      resourceId: resource.objectId,
      payload: { restrictionId: id },
    });

    return { objectId: resource.objectId, restrictionId: id };
  },
});

/** Only the owner who set a restriction can withdraw it. */
export const liftObjectRestriction = defineCommand({
  name: "object.lift_restriction",
  input: z.strictObject({
    objectId: objectIdSchema,
    restrictionId: z.uuid(),
  }),
  output: objectRestrictionResultSchema,
  policy: liftObjectRestrictionPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const state = await loadObjectState(tx, input.objectId, { lock: true });
    const restriction =
      state &&
      (await tx
        .selectFrom("app.object_restrictions")
        .select(["set_by_user_id", "lifted_at"])
        .where("id", "=", input.restrictionId)
        .where("object_id", "=", state.objectId)
        .executeTakeFirst());

    return state && restriction
      ? {
          resource: {
            ...state,
            restrictionSetByUserId: restriction.set_by_user_id,
            lifted: restriction.lifted_at !== null,
          },
          context: undefined,
        }
      : null;
  },
  execute: async ({ tx, input, resource, events, now }) => {
    if (!resource.lifted) {
      await tx
        .updateTable("app.object_restrictions")
        .set({ lifted_at: now, lift_reason: "withdrawn" })
        .where("id", "=", input.restrictionId)
        .execute();
      events.record(objectRestrictionLifted, {
        resourceId: resource.objectId,
        payload: { restrictionId: input.restrictionId, reason: "withdrawn" },
      });
    }

    return {
      objectId: resource.objectId,
      restrictionId: input.restrictionId,
    };
  },
});

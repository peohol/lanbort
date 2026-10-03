import {
  coOwnerInvitationIdSchema,
  coOwnerInvitationInputSchema,
  coOwnerInvitationResultSchema,
  type CoOwnerInvitationStatus,
  objectIdSchema,
  type ReceivedCoOwnerInvitationList,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely, Transaction } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import { blockedWithAny, lockPairsWith } from "../social/pair";
import {
  loadCommitments,
  type ObjectCommitmentSource,
  objectCommitmentSources,
} from "./commitments";
import {
  coOwnerInvitationDeclined,
  coOwnerInvitationWithdrawn,
  coOwnerInvited,
  coOwnerJoined,
  coOwnerLeft,
  objectFreezeEnded,
  objectRestrictionLifted,
} from "./events";
import {
  acceptCoOwnerInvitationPolicy,
  type CoOwnerInvitationResource,
  declineCoOwnerInvitationPolicy,
  inviteCoOwnerPolicy,
  leaveObjectPolicy,
  listCoOwnerInvitationsPolicy,
  withdrawCoOwnerInvitationPolicy,
} from "./policies";
import {
  actingUserId,
  loadLockedObject,
  loadObjectState,
  type ObjectState,
} from "./state";

const notFound = () => new DomainError("not_found", "No such invitation");

/**
 * PS-OBJ-007: an owner invites another registered user to become a co-owner.
 * Being invited is new contact with every owner, so a block between the
 * invited user and any owner stops it (PS-USR-006) with the same `not_found`
 * as an account that does not exist, never revealing who blocked whom.
 * Inviting someone who already has a pending invitation returns that one.
 */
export const inviteCoOwner = defineCommand({
  name: "object.invite_co_owner",
  input: coOwnerInvitationInputSchema,
  output: coOwnerInvitationResultSchema,
  policy: inviteCoOwnerPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedObject(tx, input.objectId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const invitedUserId = input.userId;

    if (resource.ownerIds.includes(invitedUserId)) {
      throw new DomainError("conflict", "Already an owner", ["userId"]);
    }

    const account = await tx
      .selectFrom("app.users")
      .select("status")
      .where("id", "=", invitedUserId)
      .executeTakeFirst();

    if (account?.status !== "active") {
      throw new DomainError("not_found", "No such account");
    }

    await lockPairsWith(tx, invitedUserId, resource.ownerIds);

    if (await blockedWithAny(tx, invitedUserId, resource.ownerIds)) {
      throw new DomainError("not_found", "No such account");
    }

    const pending = await tx
      .selectFrom("app.object_co_owner_invitations")
      .select("id")
      .where("object_id", "=", resource.objectId)
      .where("invited_user_id", "=", invitedUserId)
      .where("status", "=", "pending")
      .executeTakeFirst();

    if (pending) {
      return { invitationId: pending.id, status: "pending" as const };
    }

    const { id } = await tx
      .insertInto("app.object_co_owner_invitations")
      .values({
        object_id: resource.objectId,
        invited_user_id: invitedUserId,
        invited_by_user_id: actingUserId(actor),
        created_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(coOwnerInvited, {
      resourceId: resource.objectId,
      payload: { invitationId: id, invitedUserId },
    });

    return { invitationId: id, status: "pending" as const };
  },
});

async function invitationOf(
  tx: Kysely<Database>,
  objectId: string,
  invitationId: string,
) {
  return tx
    .selectFrom("app.object_co_owner_invitations")
    .select(["id", "status", "invited_user_id"])
    .where("id", "=", invitationId)
    .where("object_id", "=", objectId)
    .executeTakeFirst();
}

/** Any owner can withdraw a pending invitation to their object. */
export const withdrawCoOwnerInvitation = defineCommand({
  name: "object.withdraw_co_owner_invitation",
  input: z.strictObject({
    objectId: objectIdSchema,
    invitationId: coOwnerInvitationIdSchema,
  }),
  output: coOwnerInvitationResultSchema,
  policy: withdrawCoOwnerInvitationPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadLockedObject(tx, input.objectId),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const invitation = await invitationOf(
      tx,
      resource.objectId,
      input.invitationId,
    );

    if (!invitation) {
      throw notFound();
    }

    if (invitation.status === "pending") {
      await tx
        .updateTable("app.object_co_owner_invitations")
        .set({
          status: "withdrawn",
          ended_at: now,
          ended_by_user_id: actingUserId(actor),
        })
        .where("id", "=", invitation.id)
        .execute();
      events.record(coOwnerInvitationWithdrawn, {
        resourceId: resource.objectId,
        payload: { invitationId: invitation.id },
      });
    } else if (invitation.status !== "withdrawn") {
      throw new DomainError("conflict", "The invitation is already answered");
    }

    return { invitationId: invitation.id, status: "withdrawn" as const };
  },
});

interface InvitationState extends CoOwnerInvitationResource {
  readonly status: CoOwnerInvitationStatus;
  readonly object: ObjectState;
}

/**
 * The invitation and its object, with the object locked so the answer is
 * serialized with every other change to who owns it.
 */
async function loadInvitation(
  tx: Transaction<Database>,
  invitationId: string,
): Promise<{ resource: InvitationState; context: undefined } | null> {
  const found = await tx
    .selectFrom("app.object_co_owner_invitations")
    .select("object_id")
    .where("id", "=", invitationId)
    .executeTakeFirst();
  const object =
    found && (await loadObjectState(tx, found.object_id, { lock: true }));
  const invitation =
    object && (await invitationOf(tx, object.objectId, invitationId));

  return object && invitation
    ? {
        resource: {
          invitationId,
          invitedUserId: invitation.invited_user_id,
          status: invitation.status as CoOwnerInvitationStatus,
          object,
        },
        context: undefined,
      }
    : null;
}

const invitationReference = z.strictObject({
  invitationId: coOwnerInvitationIdSchema,
});

/**
 * PS-OBJ-007: only the invited user's explicit acceptance makes them an
 * owner, with the same rights as every other owner. The pair locks with every
 * owner and every other invited user order it against concurrent blocks; a
 * block that ended the invitation leaves it looking like one that no longer
 * exists. Joining ends pending invitations to users the new owner is blocked
 * with (database trigger).
 */
export const acceptCoOwnerInvitation = defineCommand({
  name: "object_invitation.accept",
  input: invitationReference,
  output: z.strictObject({ objectId: objectIdSchema }),
  policy: acceptCoOwnerInvitationPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadInvitation(tx, input.invitationId),
  execute: async ({ tx, resource, events, now }) => {
    const { object, invitedUserId } = resource;

    if (resource.status === "accepted") {
      return { objectId: object.objectId };
    }

    if (resource.status !== "pending") {
      throw notFound();
    }

    const otherInvited = await tx
      .selectFrom("app.object_co_owner_invitations")
      .select("invited_user_id")
      .where("object_id", "=", object.objectId)
      .where("status", "=", "pending")
      .where("id", "<>", resource.invitationId)
      .execute();
    await lockPairsWith(tx, invitedUserId, [
      ...object.ownerIds,
      ...otherInvited.map((row) => row.invited_user_id),
    ]);

    if (await blockedWithAny(tx, invitedUserId, object.ownerIds)) {
      throw notFound();
    }

    await tx
      .insertInto("app.object_owners")
      .values({
        object_id: object.objectId,
        user_id: invitedUserId,
        added_at: now,
      })
      .execute();
    await tx
      .updateTable("app.object_co_owner_invitations")
      .set({
        status: "accepted",
        ended_at: now,
        ended_by_user_id: invitedUserId,
      })
      .where("id", "=", resource.invitationId)
      .execute();
    events.record(coOwnerJoined, {
      resourceId: object.objectId,
      payload: { invitationId: resource.invitationId },
    });

    return { objectId: object.objectId };
  },
});

export const declineCoOwnerInvitation = defineCommand({
  name: "object_invitation.decline",
  input: invitationReference,
  output: coOwnerInvitationResultSchema,
  policy: declineCoOwnerInvitationPolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadInvitation(tx, input.invitationId),
  execute: async ({ tx, resource, events, now }) => {
    if (resource.status === "pending") {
      await tx
        .updateTable("app.object_co_owner_invitations")
        .set({
          status: "declined",
          ended_at: now,
          ended_by_user_id: resource.invitedUserId,
        })
        .where("id", "=", resource.invitationId)
        .execute();
      events.record(coOwnerInvitationDeclined, {
        resourceId: resource.object.objectId,
        payload: { invitationId: resource.invitationId },
      });
    } else if (resource.status !== "declined") {
      throw notFound();
    }

    return { invitationId: resource.invitationId, status: "declined" as const };
  },
});

/** Pending invitations to the signed-in user, newest first. */
export const listCoOwnerInvitations = defineQuery({
  name: "object_invitation.list",
  input: z.strictObject({}),
  policy: listCoOwnerInvitationsPolicy,
  load: async ({ db, actor }) => ({
    resource: await db
      .selectFrom("app.object_co_owner_invitations as invitation")
      .innerJoin("app.objects as object", "object.id", "invitation.object_id")
      .select([
        "invitation.id",
        "invitation.object_id",
        "invitation.invited_by_user_id",
        "invitation.created_at",
        "object.title",
        "object.category_id",
        "object.description",
      ])
      .where("invitation.invited_user_id", "=", actingUserId(actor))
      .where("invitation.status", "=", "pending")
      .orderBy("invitation.created_at", "desc")
      .orderBy("invitation.id")
      .execute(),
    context: undefined,
  }),
  present: ({ resource }): ReceivedCoOwnerInvitationList => ({
    invitations: resource.map((row) => ({
      id: row.id,
      objectId: row.object_id,
      invitedByUserId: row.invited_by_user_id,
      createdAt: row.created_at.toISOString(),
      object: {
        title: row.title,
        categoryId: row.category_id,
        description: row.description,
      },
    })),
  }),
});

/**
 * PS-OBJ-010: a co-owner removes themselves, never anyone else, as long as
 * another owner remains and no commitment they are responsible for remains.
 * Their restrictions end with them (PS-OBJ-008), and when one owner is left,
 * a freeze from a block between co-owners ends (PS-OBJ-009).
 */
export function defineLeaveObject(sources: readonly ObjectCommitmentSource[]) {
  return defineCommand({
    name: "object.leave",
    input: z.strictObject({ objectId: objectIdSchema }),
    output: z.strictObject({ objectId: objectIdSchema }),
    policy: leaveObjectPolicy,
    idempotency: "required",
    load: ({ tx, input }) => loadLockedObject(tx, input.objectId),
    execute: async ({ tx, actor, resource, events, now }) => {
      const userId = actingUserId(actor);
      const { objectId } = resource;

      if (resource.ownerIds.length < 2) {
        throw new DomainError("conflict", "The last owner cannot leave");
      }

      const commitments = await loadCommitments(tx, objectId, sources);

      if (commitments.some((c) => c.responsibleOwnerId === userId)) {
        throw new DomainError("conflict", "Responsible for a commitment");
      }

      const lifted = await tx
        .updateTable("app.object_restrictions")
        .set({ lifted_at: now, lift_reason: "owner_left" })
        .where("object_id", "=", objectId)
        .where("set_by_user_id", "=", userId)
        .where("lifted_at", "is", null)
        .returning("id")
        .execute();

      for (const { id } of lifted) {
        events.record(objectRestrictionLifted, {
          resourceId: objectId,
          payload: { restrictionId: id, reason: "owner_left" },
        });
      }

      await tx
        .deleteFrom("app.object_owners")
        .where("object_id", "=", objectId)
        .where("user_id", "=", userId)
        .execute();
      events.record(coOwnerLeft, { resourceId: objectId, payload: {} });

      if (resource.ownerIds.length === 2) {
        const ended = await tx
          .updateTable("app.object_freezes")
          .set({ ended_at: now })
          .where("object_id", "=", objectId)
          .where("ended_at", "is", null)
          .executeTakeFirst();

        if (ended.numUpdatedRows > 0n) {
          events.record(objectFreezeEnded, {
            resourceId: objectId,
            payload: {},
          });
        }
      }

      return { objectId };
    },
  });
}

export const leaveObject = defineLeaveObject(objectCommitmentSources);

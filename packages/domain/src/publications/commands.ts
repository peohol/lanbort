import {
  objectApprovalResultSchema,
  publicationDecisionSchema,
  publicationResultSchema,
  publishObjectSchema,
  setObjectApprovalSchema,
  withdrawPublicationSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { loadLockedAccess } from "../environment/environment-commands";
import { acceptsNewActivity, activeSince } from "../environment/model";
import { isConcealed } from "../environment/privacy";
import { loadEnvironmentAccess } from "../environment/store";
import { concealedHistory } from "../environment/type-change-store";
import { DomainError } from "../errors";
import { loadFreezes } from "../objects/co-owner-blocks";
import { actingUserId, loadObjectState } from "../objects/state";
import {
  environmentObjectApprovalChanged,
  publicationApproved,
  publicationBlocked,
  publicationCreated,
  publicationEnded,
  publicationPausedForApproval,
  publicationRejected,
  publicationReleasedFromApproval,
  publicationUnblocked,
  publicationWithdrawn,
} from "./events";
import { isLive, liveStatusIn, type PublicationRecord } from "./model";
import {
  approvePublicationPolicy,
  blockPublicationPolicy,
  publishObjectPolicy,
  rejectPublicationPolicy,
  type ReviewedPublicationResource,
  setObjectApprovalPolicy,
  unblockPublicationPolicy,
  withdrawPublicationPolicy,
} from "./policies";
import {
  endPublication,
  findCurrentPublication,
  findPublication,
  hasOwnerAccess,
  setPublicationStatus,
} from "./store";

type Tx = Transaction<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

const result = (publication: Pick<PublicationRecord, "id" | "status">) => ({
  publicationId: publication.id,
  status: publication.status,
});

const eventPayload = (publication: PublicationRecord) => ({
  objectId: publication.objectId,
  environmentId: publication.environmentId,
});

/**
 * PS-OBJ-008: an owner's restriction on every date is a veto on new
 * commitments, and a new publication is one. Only another owner's veto
 * stops the caller; the owner who set it can lift it.
 */
async function vetoedByAnotherOwner(
  tx: Tx,
  objectId: string,
  userId: string,
): Promise<boolean> {
  const veto = await tx
    .selectFrom("app.object_restrictions")
    .select("id")
    .where("object_id", "=", objectId)
    .where("lifted_at", "is", null)
    .where("period", "is", null)
    .where("set_by_user_id", "<>", userId)
    .executeTakeFirst();

  return veto !== undefined;
}

/**
 * PS-OBJ-006: an owner publishes the object in an environment where they
 * have active access. It starts pending if the environment requires approval
 * (PS-ENV-011), active otherwise. Publishing what is already pending or
 * active returns it unchanged; an administrator's rejection or block stands
 * until an administrator changes it, so publishing again cannot undo it.
 */
export const publishObject = defineCommand({
  name: "environment_publication.publish",
  input: publishObjectSchema,
  output: publicationResultSchema,
  policy: publishObjectPolicy,
  idempotency: "required",
  load: async ({ tx, actor, input, now }) => {
    // Object first, then environment and membership (see store.ts).
    const object = await loadObjectState(tx, input.objectId, { lock: true });
    const access =
      object &&
      (await loadEnvironmentAccess(tx, input.environmentId, actor, now, {
        lock: true,
      }));

    return object && access
      ? { resource: { object, access }, context: undefined }
      : null;
  },
  execute: async ({ tx, actor, resource, events, now }) => {
    const { object } = resource;
    const environment = resource.access.environment;
    const userId = actingUserId(actor);

    const current = await findCurrentPublication(
      tx,
      object.objectId,
      environment.id,
      { lock: true },
    );

    if (current) {
      return isLive(current.status)
        ? result(current)
        : conflict("An administrator's decision stands in this environment");
    }

    if (object.status !== "active") {
      conflict("An archived object cannot be published");
    }

    if (!acceptsNewActivity(environment)) {
      conflict("The environment takes no new publications");
    }

    // PS-OBJ-009: a conflict between co-owners stops new commitments.
    if ((await loadFreezes(tx, [object.objectId])).size > 0) {
      conflict("The object is frozen until its ownership is clarified");
    }

    if (await vetoedByAnotherOwner(tx, object.objectId, userId)) {
      conflict("Another owner has restricted new commitments");
    }

    const status = liveStatusIn(environment);
    const publication = await tx
      .insertInto("app.environment_publications")
      .values({
        object_id: object.objectId,
        environment_id: environment.id,
        published_by_user_id: userId,
        status,
        created_at: now,
        status_changed_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(publicationCreated, {
      resourceId: publication.id,
      payload: {
        objectId: object.objectId,
        environmentId: environment.id,
        status,
      },
    });

    return { publicationId: publication.id, status };
  },
});

/**
 * An owner takes the object down from an environment. Withdrawing what is
 * already unpublished returns it unchanged. A rejection or block is the
 * environment's decision and stays as it is.
 */
export const withdrawPublication = defineCommand({
  name: "environment_publication.withdraw",
  input: withdrawPublicationSchema,
  output: publicationResultSchema,
  policy: withdrawPublicationPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const object = await loadObjectState(tx, input.objectId, { lock: true });
    const publication =
      object &&
      (await findPublication(tx, input.publicationId, { lock: true }));

    return object && publication?.objectId === object.objectId
      ? { resource: { ...object, publication }, context: undefined }
      : null;
  },
  execute: async ({ tx, actor, resource, events, now }) => {
    const { publication } = resource;

    if (publication.status === "unpublished") {
      return result(publication);
    }

    if (!isLive(publication.status)) {
      conflict("An administrator's decision stands in this environment");
    }

    await endPublication(
      tx,
      publication.id,
      "withdrawn",
      actingUserId(actor),
      now,
    );
    events.record(publicationWithdrawn, {
      resourceId: publication.id,
      payload: eventPayload(publication),
    });

    return { publicationId: publication.id, status: "unpublished" as const };
  },
});

/** The environment, a publication in it, and the object's owners. */
async function loadReviewed({
  tx,
  actor,
  input,
  now,
}: {
  tx: Tx;
  actor: Actor;
  input: { environmentId: string; publicationId: string };
  now: Date;
}) {
  const access = await loadEnvironmentAccess(
    tx,
    input.environmentId,
    actor,
    now,
    { lock: true },
  );
  const publication =
    access && (await findPublication(tx, input.publicationId, { lock: true }));

  if (!access || publication?.environmentId !== access.environment.id) {
    return null;
  }

  // PS-ENV-009: what was published under a stricter type before the caller
  // became active does not exist for them.
  const concealed = await concealedHistory(
    tx,
    access.environment.id,
    activeSince(access.ownMembership),
  );
  if (isConcealed(concealed, publication.createdAt)) {
    return null;
  }

  const owners = await tx
    .selectFrom("app.object_owners")
    .select("user_id")
    .where("object_id", "=", publication.objectId)
    .execute();
  const resource: ReviewedPublicationResource & {
    publication: PublicationRecord;
  } = {
    ...access,
    ownerIds: owners.map((owner) => owner.user_id),
    publication,
  };

  return { resource, context: undefined };
}

/**
 * A publication becomes pending or active again only while the environment
 * takes new activity and an owner still has active access (PS-OBJ-006).
 */
async function mayBecomeLive(
  tx: Tx,
  resource: ReviewedPublicationResource,
  publication: PublicationRecord,
  now: Date,
): Promise<boolean> {
  if (!acceptsNewActivity(resource.environment)) {
    conflict("The environment takes no new publications");
  }

  return hasOwnerAccess(
    tx,
    publication.objectId,
    publication.environmentId,
    now,
  );
}

/**
 * PS-ENV-011: approving makes a pending publication active. It also changes
 * an earlier rejection, which stands until an administrator does so.
 */
export const approvePublication = defineCommand({
  name: "environment_publication.approve",
  input: publicationDecisionSchema,
  output: publicationResultSchema,
  policy: approvePublicationPolicy,
  idempotency: "required",
  load: loadReviewed,
  execute: async ({ tx, resource, events, now }) => {
    const { publication } = resource;

    if (publication.status === "active") {
      return result(publication);
    }

    if (publication.status !== "pending" && publication.status !== "rejected") {
      conflict("Nothing to approve");
    }

    if (!(await mayBecomeLive(tx, resource, publication, now))) {
      conflict("No owner has access to the environment any more");
    }

    await setPublicationStatus(tx, publication.id, "active", now);
    events.record(publicationApproved, {
      resourceId: publication.id,
      payload: eventPayload(publication),
    });

    return { publicationId: publication.id, status: "active" as const };
  },
});

/**
 * PS-ENV-011 / PS-OBJ-017: a local rejection of a pending publication, or
 * removal of an active one. It affects this environment only and stands until
 * an administrator changes it. Escalating to the platform is a separate
 * process (Phase 5).
 */
export const rejectPublication = defineCommand({
  name: "environment_publication.reject",
  input: publicationDecisionSchema,
  output: publicationResultSchema,
  policy: rejectPublicationPolicy,
  idempotency: "required",
  load: loadReviewed,
  execute: async ({ tx, resource, events, now }) => {
    const { publication } = resource;

    if (publication.status === "rejected") {
      return result(publication);
    }

    if (!isLive(publication.status)) {
      conflict("Nothing to reject");
    }

    await setPublicationStatus(tx, publication.id, "rejected", now);
    events.record(publicationRejected, {
      resourceId: publication.id,
      payload: eventPayload(publication),
    });

    return { publicationId: publication.id, status: "rejected" as const };
  },
});

/**
 * PS-ENV-011: a separate local safety or moderation measure. Unlike pending,
 * it is not lifted when the approval requirement is turned off.
 */
export const blockPublication = defineCommand({
  name: "environment_publication.block",
  input: publicationDecisionSchema,
  output: publicationResultSchema,
  policy: blockPublicationPolicy,
  idempotency: "required",
  load: loadReviewed,
  execute: async ({ tx, resource, events, now }) => {
    const { publication } = resource;

    if (publication.status === "blocked") {
      return result(publication);
    }

    if (!isLive(publication.status)) {
      conflict("Nothing to block");
    }

    await setPublicationStatus(tx, publication.id, "blocked", now);
    events.record(publicationBlocked, {
      resourceId: publication.id,
      payload: eventPayload(publication),
    });

    return { publicationId: publication.id, status: "blocked" as const };
  },
});

/**
 * Lifting a block returns the publication to where a new one would start:
 * pending while approval is required, active otherwise. If no owner has
 * access any more, it ends instead (PS-OBJ-006).
 */
export const unblockPublication = defineCommand({
  name: "environment_publication.unblock",
  input: publicationDecisionSchema,
  output: publicationResultSchema,
  policy: unblockPublicationPolicy,
  idempotency: "required",
  load: loadReviewed,
  execute: async ({ tx, resource, events, now }) => {
    const { publication } = resource;

    if (publication.status !== "blocked") {
      conflict("Nothing to unblock");
    }

    if (!(await mayBecomeLive(tx, resource, publication, now))) {
      await endPublication(tx, publication.id, "access_lost", null, now);
      events.record(publicationEnded, {
        resourceId: publication.id,
        payload: { ...eventPayload(publication), reason: "access_lost" },
      });

      return { publicationId: publication.id, status: "unpublished" as const };
    }

    const status = liveStatusIn(resource.environment);
    await setPublicationStatus(tx, publication.id, status, now);
    events.record(publicationUnblocked, {
      resourceId: publication.id,
      payload: { ...eventPayload(publication), status },
    });

    return { publicationId: publication.id, status };
  },
});

/**
 * PS-ENV-011: requiring approval also covers what is already published:
 * active publications wait for review, an administrative pause rather than
 * the owners' withdrawal. Turning it off makes the publications that only
 * waited for it active again; rejections and blocks stay. A winding-down
 * environment keeps its setting.
 */
export const setObjectApproval = defineCommand({
  name: "environment.set_object_approval",
  input: setObjectApprovalSchema,
  output: objectApprovalResultSchema,
  policy: setObjectApprovalPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, input, resource, events, now }) => {
    const { environment, ownMembership } = resource;

    if (environment.requiresObjectApproval === input.required) {
      return { required: input.required, changed: 0 };
    }

    if (!acceptsNewActivity(environment)) {
      conflict("A winding-down environment keeps its setting");
    }

    await tx
      .updateTable("app.environments")
      .set({ requires_object_approval: input.required, updated_at: now })
      .where("id", "=", environment.id)
      .execute();

    const [from, to, event] = input.required
      ? (["active", "pending", publicationPausedForApproval] as const)
      : (["pending", "active", publicationReleasedFromApproval] as const);
    const changed = await tx
      .updateTable("app.environment_publications")
      .set({ status: to, status_changed_at: now })
      .where("environment_id", "=", environment.id)
      .where("status", "=", from)
      .returning(["id", "object_id", "created_at"])
      .execute();
    // The count is a view of the history too (PS-ENV-009).
    const concealed = await concealedHistory(
      tx,
      environment.id,
      activeSince(ownMembership),
    );

    events.record(environmentObjectApprovalChanged, {
      resourceId: environment.id,
      payload: { required: input.required },
    });
    for (const row of changed) {
      events.record(event, {
        resourceId: row.id,
        payload: { objectId: row.object_id, environmentId: environment.id },
      });
    }

    return {
      required: input.required,
      changed: changed.filter((row) => !isConcealed(concealed, row.created_at))
        .length,
    };
  },
});

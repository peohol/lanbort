import {
  publicationEndReasonSchema,
  publicationStatusSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent, type EventKind } from "../events/catalog";

/**
 * Publication events carry ids and codes only, never object content. The
 * resource is the publication; the payload names its object and environment
 * so that later consumers (Phase 3 loan requests, Phase 4 notifications) can
 * act on them.
 */
const publicationEvent = <Shape extends z.ZodRawShape>(
  type: string,
  kind: EventKind,
  extra: Shape,
) =>
  defineEvent({
    type: `environment_publication.${type}`,
    version: 1,
    kind,
    resourceType: "environment_publication",
    payload: z.strictObject({
      objectId: z.uuid(),
      environmentId: z.uuid(),
      ...extra,
    }),
  });

/** An owner published the object; it starts pending or active. */
export const publicationCreated = publicationEvent("published", "domain", {
  status: publicationStatusSchema,
});

/** An owner took the publication down. */
export const publicationWithdrawn = publicationEvent("withdrawn", "domain", {});

/** An administrator approved it, or changed an earlier rejection. */
export const publicationApproved = publicationEvent("approved", "domain", {});

/** An administrator rejected it, or removed it while active (PS-OBJ-017). */
export const publicationRejected = publicationEvent("rejected", "domain", {});

/** A separate local safety or moderation measure (PS-ENV-011). */
export const publicationBlocked = publicationEvent("blocked", "audit", {});

export const publicationUnblocked = publicationEvent("unblocked", "audit", {
  status: publicationStatusSchema,
});

/**
 * The environment started requiring approval: an active publication waits
 * for review. An administrative pause, not the owner's withdrawal.
 */
export const publicationPausedForApproval = publicationEvent(
  "paused_for_approval",
  "domain",
  {},
);

/** The requirement was turned off: a publication that only waited for it is active. */
export const publicationReleasedFromApproval = publicationEvent(
  "released_from_approval",
  "domain",
  {},
);

/** Ended by the environment's final winding down (PS-ENV-012). */
export const publicationEnded = publicationEvent("ended", "domain", {
  reason: publicationEndReasonSchema,
});

export const environmentObjectApprovalChanged = defineEvent({
  type: "environment.object_approval_changed",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({ required: z.boolean() }),
});

/**
 * PS-OBJ-020: an owner made the object visible to friends, or took that back.
 * The resource is the object; who did it is the event's actor.
 */
const friendPublicationEvent = (type: string) =>
  defineEvent({
    type: `object.${type}`,
    version: 1,
    kind: "domain",
    resourceType: "object",
    payload: z.strictObject({}),
  });

export const friendPublicationCreated = friendPublicationEvent(
  "published_to_friends",
);

export const friendPublicationWithdrawn = friendPublicationEvent(
  "withdrawn_from_friends",
);

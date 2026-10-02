import { objectChangeFields } from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent, type EventKind } from "../events/catalog";

/**
 * Object events carry ids, versions and field names only: never titles,
 * descriptions, terms or other text the owners wrote.
 */
const objectEvent = <Shape extends z.ZodRawShape>(
  type: string,
  payload: z.ZodObject<Shape>,
  kind: EventKind = "domain",
) =>
  defineEvent({
    type,
    version: 1,
    kind,
    resourceType: "object",
    payload,
  });

const version = z.int().min(1);

export const objectCreated = objectEvent(
  "object.created",
  z.strictObject({ version }),
);

/** Which fields an edit changed, never their values. */
export const objectUpdated = objectEvent(
  "object.updated",
  z.strictObject({
    version,
    changedFields: z.array(z.enum(objectChangeFields)).min(1),
  }),
);

export const objectArchived = objectEvent(
  "object.archived",
  z.strictObject({ version }),
);

export const objectRestored = objectEvent(
  "object.restored",
  z.strictObject({ version }),
);

export const objectImageAdded = objectEvent(
  "object.image_added",
  z.strictObject({ version, imageId: z.uuid() }),
);

/** Also triggers deletion of the stored image file (outbox). */
export const objectImageRemoved = objectEvent(
  "object.image_removed",
  z.strictObject({ version, imageId: z.uuid() }),
);

/**
 * Recorded before an image file is stored, so a file whose upload never got
 * registered (a crash between storing and registering) is still deleted
 * (outbox). Technical, so not part of the object's visible history.
 */
export const objectImageUploadStarted = objectEvent(
  "object.image_upload_started",
  z.strictObject({ imageId: z.uuid() }),
  "audit",
);

/** Brought back the content of an earlier version as a new one (PS-OBJ-013). */
export const objectReverted = objectEvent(
  "object.reverted",
  z.strictObject({
    version,
    revertedToVersion: version,
    changedFields: z.array(z.enum(objectChangeFields)).min(1),
  }),
);

const invitation = { invitationId: z.uuid() };

/** PS-OBJ-007: an owner invites another user to become a co-owner. */
export const coOwnerInvited = objectEvent(
  "object.co_owner_invited",
  z.strictObject({ ...invitation, invitedUserId: z.uuid() }),
);

export const coOwnerInvitationWithdrawn = objectEvent(
  "object.co_owner_invitation_withdrawn",
  z.strictObject(invitation),
);

export const coOwnerInvitationDeclined = objectEvent(
  "object.co_owner_invitation_declined",
  z.strictObject(invitation),
);

/** The invited user accepted and is now a registered owner. */
export const coOwnerJoined = objectEvent(
  "object.co_owner_joined",
  z.strictObject(invitation),
);

/** A co-owner left; the actor is the one who left (PS-OBJ-010). */
export const coOwnerLeft = objectEvent(
  "object.co_owner_left",
  z.strictObject({}),
);

/** PS-OBJ-008: a co-owner restricted new commitments. */
export const objectRestrictionSet = objectEvent(
  "object.restriction_set",
  z.strictObject({ restrictionId: z.uuid() }),
);

/** Withdrawn by the co-owner who set it, or ended when they left. */
export const objectRestrictionLifted = objectEvent(
  "object.restriction_lifted",
  z.strictObject({
    restrictionId: z.uuid(),
    reason: z.enum(["withdrawn", "owner_left"]),
  }),
);

/**
 * The ownership is clarified to one owner, so a freeze caused by a block
 * between co-owners ends (PS-OBJ-009).
 */
export const objectFreezeEnded = objectEvent(
  "object.freeze_ended",
  z.strictObject({}),
);

/** PS-OBJ-011: an owner consents to permanent deletion. */
export const objectDeletionConsented = objectEvent(
  "object.deletion_consented",
  z.strictObject({}),
);

export const objectDeletionConsentWithdrawn = objectEvent(
  "object.deletion_consent_withdrawn",
  z.strictObject({}),
);

/** Every owner consented; the object and its content are gone. */
export const objectDeleted = objectEvent(
  "object.deleted",
  z.strictObject({ version }),
);

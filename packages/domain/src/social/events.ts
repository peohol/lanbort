import { z } from "zod";
import { type EventKind, defineEvent } from "../events/catalog";

/**
 * Friendship events explain the relation's course and may later be shown to
 * the two people involved. They carry no payload: the friendship row says who
 * it is between, and the event says who acted and when.
 */
function friendshipEvent(type: string, kind: EventKind = "domain") {
  return defineEvent({
    type: `friendship.${type}`,
    version: 1,
    kind,
    resourceType: "friendship",
    payload: z.strictObject({}),
  });
}

export const friendshipRequested = friendshipEvent("requested");
export const friendshipAccepted = friendshipEvent("accepted");
export const friendshipDeclined = friendshipEvent("declined");
export const friendshipWithdrawn = friendshipEvent("withdrawn");
export const friendshipRemoved = friendshipEvent("removed");
/**
 * A block closed the request or friendship. An audit event, kept apart from
 * the domain events above, so a timeline built from those can never tell the
 * blocked user why the relation ended (PS-USR-006).
 */
export const friendshipClosedByBlock = friendshipEvent(
  "closed_by_block",
  "audit",
);

/** PS-ADM-006: the request or friendship ended with one side's account. */
export const friendshipEndedByAccountDeletion = friendshipEvent(
  "ended_by_account_deletion",
);

/** Blocks are audit events, never shown to the blocked user. */
function blockEvent(type: string) {
  return defineEvent({
    type: `user_block.${type}`,
    version: 1,
    kind: "audit",
    resourceType: "user_block",
    payload: z.strictObject({}),
  });
}

export const userBlocked = blockEvent("created");
export const userBlockLifted = blockEvent("lifted");

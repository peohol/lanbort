import {
  environmentRoleInvited,
  environmentTypeChangeProposed,
  membershipInvited,
  membershipReviewRequested,
  membershipTransitionStarted,
} from "../../environment/events";
import { coOwnerInvited } from "../../objects/events";
import { friendshipAccepted, friendshipRequested } from "../../social/events";
import { notifyOn, tell } from "../rule";

const environment = (id: string) => ({ type: "environment", id }) as const;

/**
 * Notifications about people and environments: friend requests,
 * invitations and what environments ask of their members. Every recipient
 * is someone the environment or person is already visible to (invited,
 * member or administrator), so a hidden environment is never revealed.
 */
export const relationRules = [
  // Only while the request is still open, and towards the other person.
  notifyOn(friendshipRequested, async ({ db, event }) => {
    const friendship = await db
      .selectFrom("app.friendships")
      .select(["requester_id", "addressee_id"])
      .where("id", "=", event.resourceId)
      .where("status", "=", "pending")
      .executeTakeFirst();

    return friendship
      ? tell([friendship.addressee_id], "social.friend_request", {
          type: "user",
          id: friendship.requester_id,
        })
      : [];
  }),
  notifyOn(friendshipAccepted, async ({ db, event }) => {
    const friendship = await db
      .selectFrom("app.friendships")
      .select(["requester_id", "addressee_id"])
      .where("id", "=", event.resourceId)
      .where("status", "=", "active")
      .executeTakeFirst();

    return friendship
      ? tell([friendship.requester_id], "social.friend_request_accepted", {
          type: "user",
          id: friendship.addressee_id,
        })
      : [];
  }),
  notifyOn(membershipInvited, ({ payload }) =>
    tell(
      [payload.userId],
      "environment.membership_invited",
      environment(payload.environmentId),
    ),
  ),
  // The administrators who can act on applications now (PS-ENV-014).
  notifyOn(membershipReviewRequested, async ({ db, payload, now }) => {
    const administrators = await db
      .selectFrom("app.environment_role_grants as grant")
      .innerJoin("app.environment_memberships as membership", (join) =>
        join
          .onRef("membership.environment_id", "=", "grant.environment_id")
          .onRef("membership.user_id", "=", "grant.user_id"),
      )
      .select("grant.user_id")
      .where("grant.environment_id", "=", payload.environmentId)
      .where("grant.role", "=", "administrator")
      .where("grant.revoked_at", "is", null)
      .where("membership.state", "=", "active")
      .where((eb) =>
        eb.or([
          eb("membership.transition_deadline", "is", null),
          eb("membership.transition_deadline", ">", now),
        ]),
      )
      .where("grant.user_id", "<>", payload.userId)
      .execute();

    return tell(
      administrators.map((administrator) => administrator.user_id),
      "environment.membership_review_requested",
      environment(payload.environmentId),
      payload.reactivation ? "reactivation" : null,
    );
  }),
  notifyOn(environmentRoleInvited, ({ event, payload }) =>
    tell(
      [payload.userId],
      "environment.role_invited",
      environment(event.resourceId),
      payload.role,
    ),
  ),
  // Scenario 65: every active member is asked to consent or vote.
  notifyOn(
    environmentTypeChangeProposed,
    async ({ db, event, payload, now }) => {
      const members = await db
        .selectFrom("app.environment_memberships")
        .select("user_id")
        .where("environment_id", "=", event.resourceId)
        .where("state", "=", "active")
        .where((eb) =>
          eb.or([
            eb("transition_deadline", "is", null),
            eb("transition_deadline", ">", now),
          ]),
        )
        .execute();

      return tell(
        members.map((member) => member.user_id),
        "environment.type_change_proposed",
        environment(event.resourceId),
        payload.toType,
      );
    },
  ),
  // PS-ENV-006: new requirements need the member's action by a deadline.
  notifyOn(membershipTransitionStarted, ({ payload }) =>
    tell(
      [payload.userId],
      "environment.requirements_changed",
      environment(payload.environmentId),
    ),
  ),
  notifyOn(coOwnerInvited, ({ payload }) =>
    tell([payload.invitedUserId], "object.co_owner_invited", {
      type: "object_invitation",
      id: payload.invitationId,
    }),
  ),
];

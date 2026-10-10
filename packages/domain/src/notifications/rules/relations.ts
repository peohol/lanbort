import {
  environmentRoleInvited,
  environmentTypeChangeProposed,
  membershipActivated,
  membershipInvited,
  membershipRejected,
  membershipReviewRequested,
  membershipTransitionStarted,
} from "../../environment/events";
import { coOwnerInvited } from "../../objects/events";
import { friendshipAccepted, friendshipRequested } from "../../social/events";
import { type Db, notifyOn, tell, whileStill } from "../rule";

const environment = (id: string) => ({ type: "environment", id }) as const;

const membership = (db: Db, id: string) =>
  db
    .selectFrom("app.environment_memberships")
    .select("id")
    .where("id", "=", id);

/** Active members whose membership is not lapsing (PS-ENV-006). */
const activeMembers = (db: Db, environmentId: string, now: Date) =>
  db
    .selectFrom("app.environment_memberships as membership")
    .where("membership.environment_id", "=", environmentId)
    .where("membership.state", "=", "active")
    .where((eb) =>
      eb.or([
        eb("membership.transition_deadline", "is", null),
        eb("membership.transition_deadline", ">", now),
      ]),
    );

/**
 * Notifications about people and environments: friend requests,
 * invitations and what environments ask of their members. Every recipient
 * is someone the environment or person is already visible to (invited,
 * member or administrator), so a hidden environment is never revealed, and
 * only while the request, invitation or proposal is still open.
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
  notifyOn(membershipInvited, ({ db, event, payload }) =>
    whileStill(
      membership(db, event.resourceId)
        .where("state", "=", "pending")
        .where("origin", "=", "invitation"),
      () =>
        tell(
          [payload.userId],
          "environment.membership_invited",
          environment(payload.environmentId),
        ),
    ),
  ),
  // The administrators who can act on applications now (PS-ENV-014).
  notifyOn(membershipReviewRequested, ({ db, event, payload, now }) =>
    whileStill(
      membership(db, event.resourceId).where("review_stage", "=", "submitted"),
      async () => {
        const administrators = await activeMembers(
          db,
          payload.environmentId,
          now,
        )
          .innerJoin("app.environment_role_grants as grant", (join) =>
            join
              .onRef("grant.environment_id", "=", "membership.environment_id")
              .onRef("grant.user_id", "=", "membership.user_id"),
          )
          .select("grant.user_id")
          .where("grant.role", "=", "administrator")
          .where("grant.revoked_at", "is", null)
          .where("grant.user_id", "<>", payload.userId)
          .execute();

        return tell(
          administrators.map((administrator) => administrator.user_id),
          "environment.membership_review_requested",
          environment(payload.environmentId),
          payload.reactivation ? "reactivation" : null,
        );
      },
    ),
  ),
  // PS-ENV-017: the applicant hears the outcome of their own application,
  // or of their request to be active again, never why or who decided. A
  // member who reactivates themselves is the actor, and is not told.
  notifyOn(membershipActivated, ({ db, event, payload }) =>
    payload.via === "approval" || payload.via === "reactivation"
      ? whileStill(
          membership(db, event.resourceId).where("state", "=", "active"),
          () =>
            tell(
              [payload.userId],
              "environment.membership_approved",
              environment(payload.environmentId),
              payload.via === "reactivation" ? "reactivation" : null,
            ),
        )
      : [],
  ),
  notifyOn(membershipRejected, ({ payload }) =>
    tell(
      [payload.userId],
      "environment.membership_rejected",
      environment(payload.environmentId),
      payload.reactivation ? "reactivation" : null,
    ),
  ),
  notifyOn(environmentRoleInvited, ({ db, event, payload }) =>
    whileStill(
      db
        .selectFrom("app.environment_role_invitations")
        .select("id")
        .where("id", "=", payload.invitationId)
        .where("closed_at", "is", null),
      () =>
        tell(
          [payload.userId],
          "environment.role_invited",
          environment(event.resourceId),
          payload.role,
        ),
    ),
  ),
  // Scenario 65: every active member is asked to consent or vote, the one
  // who proposed it as well.
  notifyOn(
    environmentTypeChangeProposed,
    ({ db, event, payload, now }) =>
      whileStill(
        db
          .selectFrom("app.environment_type_proposals")
          .select("id")
          .where("id", "=", payload.proposalId)
          .where("closed_at", "is", null),
        async () => {
          const members = await activeMembers(db, event.resourceId, now)
            .select("membership.user_id")
            .execute();

          return tell(
            members.map((member) => member.user_id),
            "environment.type_change_proposed",
            environment(event.resourceId),
            payload.toType,
          );
        },
      ),
    { tellsActor: true },
  ),
  // PS-ENV-006: new requirements need the member's action by a deadline,
  // the administrator's own membership included.
  notifyOn(
    membershipTransitionStarted,
    ({ db, event, payload }) =>
      whileStill(
        membership(db, event.resourceId)
          .where("state", "=", "active")
          .where("transition_deadline", "is not", null),
        () =>
          tell(
            [payload.userId],
            "environment.requirements_changed",
            environment(payload.environmentId),
          ),
      ),
    { tellsActor: true },
  ),
  notifyOn(coOwnerInvited, ({ db, payload }) =>
    whileStill(
      db
        .selectFrom("app.object_co_owner_invitations")
        .select("id")
        .where("id", "=", payload.invitationId)
        .where("status", "=", "pending"),
      () =>
        tell([payload.invitedUserId], "object.co_owner_invited", {
          type: "object_invitation",
          id: payload.invitationId,
        }),
    ),
  ),
];

import { anonymousActor, systemActor } from "../actor";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import {
  type CoOwnerInvitationResource,
  createObjectPolicy,
  invitedUserPolicies,
  liftObjectRestrictionPolicy,
  listCoOwnerInvitationsPolicy,
  listObjectCategoriesPolicy,
  listOwnObjectsPolicy,
  type ObjectResource,
  ownerPolicies,
} from "./policies";

const owner = testUserActor();
const coOwner = testUserActor();
const stranger = testUserActor();
const pending = testUserActor({ accountStatus: "pending_registration" });
const object: ObjectResource = {
  objectId: "00000000-0000-4000-8000-000000000001",
  ownerIds: [owner.userId, coOwner.userId],
};

/**
 * What an owner whose account is not active keeps (PS-ADM-002): seeing
 * their things and winding their ownership down. Everything else needs an
 * active account.
 */
const minimumAccess = new Set([
  "object.list_own",
  "object.read",
  "object.archive",
  "object.leave",
  "object.consent_to_deletion",
  "object.withdraw_deletion_consent",
  "object.withdraw_co_owner_invitation",
  "object_invitation.decline",
  "object_invitation.list",
  "object_invitation.read_image",
]);

const deactivatedCase = <R>(
  action: string,
  name: string,
  actor: typeof owner,
  resource: R,
) => ({
  name: `${name} with a deactivated account`,
  actor: { ...actor, accountStatus: "deactivated" as const },
  resource,
  context: undefined,
  expected: minimumAccess.has(action)
    ? ("allow" as const)
    : ("account_inactive" as const),
});

const invitee = testUserActor();
const invitation: CoOwnerInvitationResource = {
  invitationId: "00000000-0000-4000-8000-000000000002",
  invitedUserId: invitee.userId,
};

/** Policies without a resource: any registered user, nobody else. */
const registeredUserMatrix = (
  policy:
    | typeof createObjectPolicy
    | typeof listOwnObjectsPolicy
    | typeof listObjectCategoriesPolicy
    | typeof listCoOwnerInvitationsPolicy,
) =>
  policyMatrix(policy, [
    {
      name: "registered user",
      actor: owner,
      resource: undefined,
      context: undefined,
      expected: "allow",
    },
    deactivatedCase(policy.action, "registered user", owner, undefined),
    {
      name: "registration not completed",
      actor: pending,
      resource: undefined,
      context: undefined,
      expected: "registration_required",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: undefined,
      context: undefined,
      expected: "unauthenticated",
    },
    {
      name: "system processes act on nobody's behalf",
      actor: systemActor("outbox.worker"),
      resource: undefined,
      context: undefined,
      expected: "unauthenticated",
    },
  ]);

export const objectMatrices = [
  registeredUserMatrix(createObjectPolicy),
  registeredUserMatrix(listOwnObjectsPolicy),
  registeredUserMatrix(listObjectCategoriesPolicy),
  registeredUserMatrix(listCoOwnerInvitationsPolicy),
  policyMatrix(liftObjectRestrictionPolicy, [
    {
      name: "the co-owner who set the restriction",
      actor: coOwner,
      resource: { ...object, restrictionSetByUserId: coOwner.userId },
      context: undefined,
      expected: "allow",
    },
    {
      name: "another co-owner cannot lift it",
      actor: owner,
      resource: { ...object, restrictionSetByUserId: coOwner.userId },
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "a former owner who set it is no longer an owner",
      actor: stranger,
      resource: { ...object, restrictionSetByUserId: stranger.userId },
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: { ...object, restrictionSetByUserId: owner.userId },
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
  ...invitedUserPolicies.map((policy) =>
    policyMatrix(policy, [
      {
        name: "the invited user",
        actor: invitee,
        resource: invitation,
        context: undefined,
        expected: "allow",
      },
      deactivatedCase(policy.action, "the invited user", invitee, invitation),
      {
        name: "the inviting owner cannot answer for them",
        actor: owner,
        resource: invitation,
        context: undefined,
        expected: "not_found",
      },
      {
        name: "anyone else cannot see the invitation",
        actor: stranger,
        resource: invitation,
        context: undefined,
        expected: "not_found",
      },
      {
        name: "an invited user whose registration is not completed",
        actor: { ...pending, userId: invitee.userId },
        resource: invitation,
        context: undefined,
        expected: "registration_required",
      },
      {
        name: "system process",
        actor: systemActor("outbox.worker"),
        resource: invitation,
        context: undefined,
        expected: "unauthenticated",
      },
    ]),
  ),
  ...ownerPolicies.map((policy) =>
    policyMatrix(policy, [
      {
        name: "owner",
        actor: owner,
        resource: object,
        context: undefined,
        expected: "allow",
      },
      deactivatedCase(policy.action, "owner", owner, object),
      {
        name: "every registered owner has the same rights",
        actor: coOwner,
        resource: object,
        context: undefined,
        expected: "allow",
      },
      {
        name: "another user's object is indistinguishable from a missing one",
        actor: stranger,
        resource: object,
        context: undefined,
        expected: "not_found",
      },
      {
        name: "an owner whose registration is not completed",
        actor: { ...pending, userId: owner.userId },
        resource: object,
        context: undefined,
        expected: "registration_required",
      },
      {
        name: "anonymous caller",
        actor: anonymousActor,
        resource: object,
        context: undefined,
        expected: "unauthenticated",
      },
      {
        name: "system process",
        actor: systemActor("outbox.worker"),
        resource: object,
        context: undefined,
        expected: "unauthenticated",
      },
    ]),
  ),
];

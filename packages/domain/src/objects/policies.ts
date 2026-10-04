import {
  type ActorRule,
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireMinimumAccess,
} from "../authorization/rules";

/** What object policies decide on, loaded inside the command or query. */
export interface ObjectResource {
  readonly objectId: string;
  /** Current registered owners (`app.object_owners`). */
  readonly ownerIds: readonly string[];
}

/**
 * Only the object's registered owners can see or manage it, and every owner
 * has the same rights (PS-OBJ-007), until publication (WP-25) adds other ways
 * in. Anyone else gets `not_found`, so an object's existence is never
 * revealed. Being an owner gives no access to environment contexts or loan
 * details the owner could not otherwise see: those policies must check their
 * own relation as well (docs/architecture/04).
 */
export const isObjectOwner: ResourceRule<ObjectResource, void> = ({
  actor,
  resource,
}) =>
  actor.kind === "user" && resource.ownerIds.includes(actor.userId)
    ? allow
    : deny("not_found");

/**
 * An action only the object's owners may take. Actions that only wind
 * ownership down (seeing the object, leaving it, deleting or archiving it)
 * keep the minimum access of an account that is not active (PS-ADM-002,
 * vision «Deaktivering av medeier»); everything else needs an active one.
 */
function ownerPolicy(
  action: string,
  standing: ActorRule = requireActiveAccount,
) {
  return definePolicy<ObjectResource, void>({
    action,
    actor: [standing],
    resource: [isObjectOwner],
  });
}

/** Any registered user can create an object; they become its owner. */
export const createObjectPolicy = definePolicy({
  action: "object.create",
  actor: [requireActiveAccount],
});

/** The signed-in user's own objects ("Mine ting"). */
export const listOwnObjectsPolicy = definePolicy<unknown, void>({
  action: "object.list_own",
  actor: [requireMinimumAccess],
});

/** The shared category structure is the same for every registered user. */
export const listObjectCategoriesPolicy = definePolicy<unknown, void>({
  action: "object_category.list",
  actor: [requireActiveAccount],
});

export const readObjectPolicy = ownerPolicy(
  "object.read",
  requireMinimumAccess,
);
export const updateObjectPolicy = ownerPolicy("object.update");
export const archiveObjectPolicy = ownerPolicy(
  "object.archive",
  requireMinimumAccess,
);
export const restoreObjectPolicy = ownerPolicy("object.restore");
export const addObjectImagePolicy = ownerPolicy("object.add_image");
export const removeObjectImagePolicy = ownerPolicy("object.remove_image");

export const readObjectHistoryPolicy = ownerPolicy("object.read_history");
export const revertObjectPolicy = ownerPolicy("object.revert");
export const inviteCoOwnerPolicy = ownerPolicy("object.invite_co_owner");
export const withdrawCoOwnerInvitationPolicy = ownerPolicy(
  "object.withdraw_co_owner_invitation",
  requireMinimumAccess,
);
/** Only oneself: no owner can remove another (PS-OBJ-010). */
export const leaveObjectPolicy = ownerPolicy(
  "object.leave",
  requireMinimumAccess,
);
export const setObjectRestrictionPolicy = ownerPolicy("object.set_restriction");
export const consentToObjectDeletionPolicy = ownerPolicy(
  "object.consent_to_deletion",
  requireMinimumAccess,
);
export const withdrawObjectDeletionConsentPolicy = ownerPolicy(
  "object.withdraw_deletion_consent",
  requireMinimumAccess,
);

export const ownerPolicies = [
  readObjectPolicy,
  updateObjectPolicy,
  archiveObjectPolicy,
  restoreObjectPolicy,
  addObjectImagePolicy,
  removeObjectImagePolicy,
  readObjectHistoryPolicy,
  revertObjectPolicy,
  inviteCoOwnerPolicy,
  withdrawCoOwnerInvitationPolicy,
  leaveObjectPolicy,
  setObjectRestrictionPolicy,
  consentToObjectDeletionPolicy,
  withdrawObjectDeletionConsentPolicy,
];

/** A restriction, with the object it restricts. */
export interface ObjectRestrictionResource extends ObjectResource {
  readonly restrictionSetByUserId: string;
}

/**
 * Only the co-owner who set a restriction can withdraw it (PS-OBJ-008). The
 * other owners can see it, so they are told no rather than not found.
 */
export const isRestrictionSetter: ResourceRule<
  ObjectRestrictionResource,
  void
> = ({ actor, resource }) =>
  actor.kind === "user" && resource.restrictionSetByUserId === actor.userId
    ? allow
    : deny("forbidden");

export const liftObjectRestrictionPolicy = definePolicy<
  ObjectRestrictionResource,
  void
>({
  action: "object.lift_restriction",
  actor: [requireActiveAccount],
  resource: [isObjectOwner, isRestrictionSetter],
});

/** A co-ownership invitation, as its invited user acts on it. */
export interface CoOwnerInvitationResource {
  readonly invitationId: string;
  readonly invitedUserId: string;
}

/** Only the invited user sees or answers an invitation; to others it is missing. */
export const isInvitedUser: ResourceRule<CoOwnerInvitationResource, void> = ({
  actor,
  resource,
}) =>
  actor.kind === "user" && resource.invitedUserId === actor.userId
    ? allow
    : deny("not_found");

function invitedUserPolicy(
  action: string,
  standing: ActorRule = requireActiveAccount,
) {
  return definePolicy<CoOwnerInvitationResource, void>({
    action,
    actor: [standing],
    resource: [isInvitedUser],
  });
}

/** Explicit acceptance is the only way to become a co-owner (PS-OBJ-007). */
export const acceptCoOwnerInvitationPolicy = invitedUserPolicy(
  "object_invitation.accept",
);
/** Saying no starts nothing, so an account that is not active may. */
export const declineCoOwnerInvitationPolicy = invitedUserPolicy(
  "object_invitation.decline",
  requireMinimumAccess,
);

export const invitedUserPolicies = [
  acceptCoOwnerInvitationPolicy,
  declineCoOwnerInvitationPolicy,
];

/** The invitations the signed-in user has received. */
export const listCoOwnerInvitationsPolicy = definePolicy<unknown, void>({
  action: "object_invitation.list",
  actor: [requireMinimumAccess],
});

export const objectPolicies = [
  createObjectPolicy,
  listOwnObjectsPolicy,
  listObjectCategoriesPolicy,
  listCoOwnerInvitationsPolicy,
  liftObjectRestrictionPolicy,
  ...ownerPolicies,
  ...invitedUserPolicies,
];

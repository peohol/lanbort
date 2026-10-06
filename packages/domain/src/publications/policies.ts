import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireNotInvolved,
} from "../authorization/rules";
import type { EnvironmentAccess } from "../environment/model";
import { canSeeEnvironment, isAdministrator } from "../environment/policies";
import { isObjectOwner, type ObjectResource } from "../objects/policies";
import type { SocialPair } from "../social/pair";
import { visiblePair } from "../social/policies";

/** Applies a rule written for one part of a combined resource. */
function onPart<R, P>(
  part: (resource: R) => P,
  rule: ResourceRule<P, void>,
): ResourceRule<R, void> {
  return (input) => rule({ ...input, resource: part(input.resource) });
}

/**
 * PS-OBJ-006: the environment activity publication needs is an active
 * membership. A passive member has no ordinary environment activity.
 */
export const isActiveMember: ResourceRule<EnvironmentAccess, void> = ({
  resource,
}) =>
  resource.viewer.membership?.state === "active" ? allow : deny("forbidden");

/** An owner publishing their object in an environment. */
export interface PublishResource {
  readonly object: ObjectResource;
  readonly access: EnvironmentAccess;
}

/**
 * Any owner can publish the object in an environment where they themselves
 * have active access (PS-OBJ-006, PS-OBJ-007). The object stays hidden from
 * non-owners and a hidden environment from outsiders, both as `not_found`.
 */
export const publishObjectPolicy = definePolicy<PublishResource, void>({
  action: "environment_publication.publish",
  actor: [requireActiveAccount],
  resource: [
    onPart((resource) => resource.object, isObjectOwner),
    onPart((resource) => resource.access, canSeeEnvironment),
    onPart((resource) => resource.access, isActiveMember),
  ],
});

/**
 * Any owner may take the object down from any environment, also one they
 * cannot see themselves: limiting new commitments is every co-owner's right
 * (vision: «Uenighet mellom medeiere om framtidig utlån»).
 */
export const withdrawPublicationPolicy = definePolicy<ObjectResource, void>({
  action: "environment_publication.withdraw",
  actor: [requireActiveAccount],
  resource: [isObjectOwner],
});

/** The object's publications, as its owners see them. */
export const listObjectPublicationsPolicy = definePolicy<ObjectResource, void>({
  action: "environment_publication.list_for_object",
  actor: [requireActiveAccount],
  resource: [isObjectOwner],
});

/** A publication an administrator decides on, with the object's owners. */
export interface ReviewedPublicationResource extends EnvironmentAccess {
  readonly ownerIds: readonly string[];
}

/**
 * Local moderation (PS-ENV-011, PS-OBJ-017, PS-TRUST-013) by an
 * administrator with active membership. An administrator never decides on an
 * object they own (PS-USR-009); without another administrator it waits
 * (PS-ENV-014).
 */
function decisionPolicy(action: string) {
  return definePolicy<ReviewedPublicationResource, void>({
    action,
    actor: [requireActiveAccount],
    resource: [
      canSeeEnvironment,
      isAdministrator,
      requireNotInvolved(({ resource }) => resource.ownerIds),
    ],
  });
}

export const approvePublicationPolicy = decisionPolicy(
  "environment_publication.approve",
);
export const rejectPublicationPolicy = decisionPolicy(
  "environment_publication.reject",
);
export const blockPublicationPolicy = decisionPolicy(
  "environment_publication.block",
);
export const unblockPublicationPolicy = decisionPolicy(
  "environment_publication.unblock",
);

export const publicationDecisionPolicies = [
  approvePublicationPolicy,
  rejectPublicationPolicy,
  blockPublicationPolicy,
  unblockPublicationPolicy,
];

function administrationPolicy(action: string) {
  return definePolicy<EnvironmentAccess, void>({
    action,
    actor: [requireActiveAccount],
    resource: [canSeeEnvironment, isAdministrator],
  });
}

/** Publications for the environment's administrators to review. */
export const listEnvironmentPublicationsPolicy = administrationPolicy(
  "environment_publication.list_for_environment",
);

/** PS-ENV-011: turning the approval requirement on or off. */
export const setObjectApprovalPolicy = administrationPolicy(
  "environment.set_object_approval",
);

/** Finding objects in the environment: its active members. */
export const listEnvironmentObjectsPolicy = definePolicy<
  EnvironmentAccess,
  void
>({
  action: "environment_object.list",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, isActiveMember],
});

/** An object's image, reached through one of its publications. */
export interface PublishedImageResource {
  readonly access: EnvironmentAccess;
  /** The caller finds the object in the environment. */
  readonly discoverable: boolean;
  /** The object has a publication there for administrators to review. */
  readonly underReview: boolean;
}

/**
 * Members see images of the objects they can find; administrators also of
 * the ones they review. To anyone else the image does not exist.
 */
const maySeePublishedImage: ResourceRule<PublishedImageResource, void> = (
  input,
) => {
  const { access, discoverable, underReview } = input.resource;
  const asMember =
    discoverable && isActiveMember({ ...input, resource: access }).allowed;
  const asAdministrator =
    underReview && isAdministrator({ ...input, resource: access }).allowed;

  return asMember || asAdministrator ? allow : deny("not_found");
};

export const readPublishedImagePolicy = definePolicy<
  PublishedImageResource,
  void
>({
  action: "environment_object.read_image",
  actor: [requireActiveAccount],
  resource: [
    onPart((resource) => resource.access, canSeeEnvironment),
    maySeePublishedImage,
  ],
});

/**
 * PS-OBJ-020: any owner turns the object's visibility to friends on or off,
 * like a publication in an environment.
 */
export const publishToFriendsPolicy = definePolicy<ObjectResource, void>({
  action: "friend_publication.publish",
  actor: [requireActiveAccount],
  resource: [isObjectOwner],
});

export const withdrawFromFriendsPolicy = definePolicy<ObjectResource, void>({
  action: "friend_publication.withdraw",
  actor: [requireActiveAccount],
  resource: [isObjectOwner],
});

/**
 * Another user's objects that are visible to friends, on their profile. Any
 * user the caller can see may be asked; only a friend gets objects. A user
 * who blocks the caller looks like one that does not exist (PS-USR-006).
 */
export const listFriendObjectsPolicy = definePolicy<
  { readonly pair: SocialPair },
  void
>({
  action: "friend_object.list",
  actor: [requireActiveAccount],
  resource: visiblePair.map((rule) =>
    onPart((resource) => resource.pair, rule),
  ),
});

/** The caller finds the object through a friend now. */
export interface FriendObjectImageResource {
  readonly findable: boolean;
}

/** An image of an object the caller finds through a friend; to anyone else it does not exist. */
export const readFriendObjectImagePolicy = definePolicy<
  FriendObjectImageResource,
  void
>({
  action: "friend_object.read_image",
  actor: [requireActiveAccount],
  resource: [({ resource }) => (resource.findable ? allow : deny("not_found"))],
});

export const publicationPolicies = [
  publishObjectPolicy,
  withdrawPublicationPolicy,
  listObjectPublicationsPolicy,
  ...publicationDecisionPolicies,
  listEnvironmentPublicationsPolicy,
  setObjectApprovalPolicy,
  listEnvironmentObjectsPolicy,
  readPublishedImagePolicy,
  publishToFriendsPolicy,
  withdrawFromFriendsPolicy,
  listFriendObjectsPolicy,
  readFriendObjectImagePolicy,
];

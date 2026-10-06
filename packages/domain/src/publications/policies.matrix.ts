import type { EnvironmentRole, EnvironmentType } from "@lanbort/contracts";
import { type Actor, anonymousActor, systemActor } from "../actor";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { EnvironmentAccess, Viewer } from "../environment/model";
import type { DenialReason } from "../errors";
import type { ObjectResource } from "../objects/policies";
import type { SocialPair } from "../social/pair";
import { testUserActor } from "../testing/actors";
import {
  listFriendObjectsPolicy,
  publishToFriendsPolicy,
  readFriendObjectImagePolicy,
  withdrawFromFriendsPolicy,
  listEnvironmentObjectsPolicy,
  listEnvironmentPublicationsPolicy,
  listObjectPublicationsPolicy,
  type PublishedImageResource,
  publicationDecisionPolicies,
  publishObjectPolicy,
  readPublishedImagePolicy,
  setObjectApprovalPolicy,
  withdrawPublicationPolicy,
} from "./policies";

const owner = testUserActor();
const coOwner = testUserActor();
const stranger = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });

const object: ObjectResource = {
  objectId: "00000000-0000-4000-8000-0000000000b1",
  ownerIds: [owner.userId, coOwner.userId],
};

function access(
  type: EnvironmentType,
  viewer: Partial<Viewer> = {},
): EnvironmentAccess {
  return {
    environment: {
      id: "00000000-0000-4000-8000-0000000000e1",
      type,
      state: "active",
      name: "Borettslaget",
      description: null,
      audience: null,
      objectFocus: null,
      location: null,
      area: null,
      version: 1,
      requirementsRevision: 0,
      requiresObjectApproval: false,
    },
    ownMembership: null,
    viewer: { membership: null, roles: [], restricted: false, ...viewer },
  };
}

const member = (
  state: "pending" | "active" | "passive",
  roles: EnvironmentRole[] = [],
): Partial<Viewer> => ({
  membership: { id: "00000000-0000-4000-8000-0000000000f1", state },
  roles,
});

const administrator = member("active", ["administrator"]);

function expectCase<R>(
  name: string,
  actor: Actor,
  resource: R,
  expected: "allow" | DenialReason,
): PolicyCase<R, void> {
  return { name, actor, resource, context: undefined, expected };
}

const callerCases = <R>(resource: R): PolicyCase<R, void>[] => [
  expectCase("anonymous caller", anonymousActor, resource, "unauthenticated"),
  expectCase(
    "an account that has not completed registration",
    pendingAccount,
    resource,
    "registration_required",
  ),
];

const publishing = (type: EnvironmentType, viewer: Partial<Viewer>) => ({
  object,
  access: access(type, viewer),
});

const ownerOnlyCases = (resource: ObjectResource) => [
  expectCase("an owner", owner, resource, "allow"),
  expectCase("a co-owner has the same right", coOwner, resource, "allow"),
  expectCase(
    "anyone else does not see the object",
    stranger,
    resource,
    "not_found",
  ),
  ...callerCases(resource),
];

const reviewed = (
  viewer: Partial<Viewer>,
  type: EnvironmentType = "closed",
) => ({
  ...access(type, viewer),
  ownerIds: [owner.userId],
});

const administrationCases = <R extends EnvironmentAccess>(
  resource: (type: EnvironmentType, viewer: Partial<Viewer>) => R,
) => [
  expectCase(
    "an administrator",
    stranger,
    resource("closed", administrator),
    "allow",
  ),
  expectCase(
    "an administrator of a hidden environment",
    stranger,
    resource("hidden", administrator),
    "allow",
  ),
  expectCase(
    "an ordinary active member",
    stranger,
    resource("closed", member("active")),
    "forbidden",
  ),
  expectCase(
    "an administrator whose membership is passive",
    stranger,
    resource("closed", member("passive", ["administrator"])),
    "forbidden",
  ),
  expectCase(
    "an outsider to a hidden environment",
    stranger,
    resource("hidden", {}),
    "not_found",
  ),
  ...callerCases(resource("closed", administrator)),
];

const image = (
  viewer: Partial<Viewer>,
  found: Pick<PublishedImageResource, "discoverable" | "underReview">,
  type: EnvironmentType = "closed",
): PublishedImageResource => ({ access: access(type, viewer), ...found });

/** The caller's pair with the user whose profile they look at. */
const profile = (overrides: Partial<SocialPair> = {}) => ({
  pair: {
    actorId: stranger.userId,
    otherUserId: owner.userId,
    otherActive: true,
    openFriendship: {
      id: "00000000-0000-4000-8000-0000000000c1",
      status: "active" as const,
      requesterId: owner.userId,
    },
    blockedByActor: false,
    blockedByOther: false,
    ...overrides,
  },
});

export const publicationMatrices = [
  policyMatrix(publishObjectPolicy, [
    expectCase(
      "an owner with active access",
      owner,
      publishing("closed", member("active")),
      "allow",
    ),
    expectCase(
      "a co-owner in a hidden environment they belong to",
      coOwner,
      publishing("hidden", member("active")),
      "allow",
    ),
    expectCase(
      "someone who does not own the object",
      stranger,
      publishing("open", member("active")),
      "not_found",
    ),
    expectCase(
      "an owner outside a hidden environment",
      owner,
      publishing("hidden", {}),
      "not_found",
    ),
    expectCase(
      "an owner who is not a member",
      owner,
      publishing("open", {}),
      "forbidden",
    ),
    expectCase(
      "an owner whose membership is passive",
      owner,
      publishing("closed", member("passive")),
      "forbidden",
    ),
    expectCase(
      "an owner whose application is pending",
      owner,
      publishing("closed", member("pending")),
      "forbidden",
    ),
    ...callerCases(publishing("open", member("active"))),
  ]),
  policyMatrix(withdrawPublicationPolicy, ownerOnlyCases(object)),
  policyMatrix(listObjectPublicationsPolicy, ownerOnlyCases(object)),
  ...publicationDecisionPolicies.map((policy) =>
    policyMatrix(policy, [
      ...administrationCases((type, viewer) => reviewed(viewer, type)),
      expectCase(
        "an administrator who owns the object",
        owner,
        reviewed(administrator),
        "conflict_of_interest",
      ),
    ]),
  ),
  policyMatrix(
    listEnvironmentPublicationsPolicy,
    administrationCases((type, viewer) => access(type, viewer)),
  ),
  policyMatrix(
    setObjectApprovalPolicy,
    administrationCases((type, viewer) => access(type, viewer)),
  ),
  policyMatrix(listEnvironmentObjectsPolicy, [
    expectCase(
      "an active member",
      stranger,
      access("closed", member("active")),
      "allow",
    ),
    expectCase(
      "an active member of a hidden environment",
      stranger,
      access("hidden", member("active")),
      "allow",
    ),
    expectCase(
      "a passive member has no active visibility",
      stranger,
      access("closed", member("passive")),
      "forbidden",
    ),
    expectCase(
      "an applicant",
      stranger,
      access("closed", member("pending")),
      "forbidden",
    ),
    expectCase(
      "a non-member of an open environment",
      stranger,
      access("open"),
      "forbidden",
    ),
    expectCase(
      "an outsider to a hidden environment",
      stranger,
      access("hidden"),
      "not_found",
    ),
    ...callerCases(access("open", member("active"))),
  ]),
  policyMatrix(readPublishedImagePolicy, [
    expectCase(
      "an active member who finds the object",
      stranger,
      image(member("active"), { discoverable: true, underReview: true }),
      "allow",
    ),
    expectCase(
      "an administrator reviewing it",
      stranger,
      image(administrator, { discoverable: false, underReview: true }),
      "allow",
    ),
    expectCase(
      "a member who cannot find the object",
      stranger,
      image(member("active"), { discoverable: false, underReview: true }),
      "not_found",
    ),
    expectCase(
      "a passive member",
      stranger,
      image(member("passive"), { discoverable: true, underReview: true }),
      "not_found",
    ),
    expectCase(
      "an administrator with nothing to review",
      stranger,
      image(administrator, { discoverable: false, underReview: false }),
      "not_found",
    ),
    expectCase(
      "an outsider to a hidden environment",
      stranger,
      image({}, { discoverable: true, underReview: true }, "hidden"),
      "not_found",
    ),
    ...callerCases(
      image(member("active"), { discoverable: true, underReview: true }),
    ),
    expectCase(
      "system processes act on nobody's behalf",
      systemActor("outbox.worker"),
      image(member("active"), { discoverable: true, underReview: true }),
      "unauthenticated",
    ),
  ]),
  policyMatrix(publishToFriendsPolicy, ownerOnlyCases(object)),
  policyMatrix(withdrawFromFriendsPolicy, ownerOnlyCases(object)),
  policyMatrix(listFriendObjectsPolicy, [
    expectCase("a friend", stranger, profile(), "allow"),
    expectCase(
      "someone who is not a friend sees the profile, not its objects",
      stranger,
      profile({ openFriendship: null }),
      "allow",
    ),
    expectCase(
      "a user who blocks the caller looks like nobody",
      stranger,
      profile({ openFriendship: null, blockedByOther: true }),
      "not_found",
    ),
    expectCase(
      "an account that is not registered",
      stranger,
      profile({ openFriendship: null, otherActive: false }),
      "not_found",
    ),
    expectCase(
      "nobody reads a pair that is not their own",
      owner,
      profile(),
      "not_found",
    ),
    ...callerCases(profile()),
  ]),
  policyMatrix(readFriendObjectImagePolicy, [
    expectCase(
      "a friend who finds the object",
      stranger,
      { findable: true },
      "allow",
    ),
    expectCase(
      "anyone who does not find it through friends",
      stranger,
      { findable: false },
      "not_found",
    ),
    ...callerCases({ findable: true }),
  ]),
];

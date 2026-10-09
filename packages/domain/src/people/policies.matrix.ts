import { type Actor, anonymousActor, systemActor } from "../actor";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import type { SocialPair } from "../social/pair";
import { testUserActor } from "../testing/actors";
import {
  changeProfilePicturePolicy,
  type OwnProfile,
  readPersonPolicy,
  readProfilePicturePolicy,
} from "./policies";
import type { PersonRelation } from "./store";

const viewer = testUserActor();
const other = "00000000-0000-4000-8000-0000000000c3";
const pendingAccount = testUserActor({
  userId: viewer.userId,
  accountStatus: "pending_registration",
});

/** `viewer`'s relation to `other`: none unless given. */
const person = (
  pair: Partial<SocialPair> = {},
  overrides: Partial<PersonRelation> = {},
): PersonRelation => ({
  viewerId: viewer.userId,
  userId: other,
  realName: "Kari Nordmann",
  pair: {
    actorId: viewer.userId,
    otherUserId: other,
    otherActive: true,
    openFriendship: null,
    blockedByActor: false,
    blockedByOther: false,
    requestHeldBack: false,
    ...pair,
  },
  relationSince: null,
  shareEnvironment: false,
  picture: null,
  ...overrides,
});

const friends = {
  openFriendship: { id: "f", status: "active", requesterId: other },
} as const;
const asked = {
  openFriendship: { id: "f", status: "pending", requesterId: other },
} as const;

function expectCase<R = PersonRelation>(
  name: string,
  actor: Actor,
  resource: R,
  expected: "allow" | DenialReason,
): PolicyCase<R, void> {
  return { name, actor, resource, context: undefined, expected };
}

/** `viewer`'s relation to `other`, who has a picture shown as given. */
const pictured = (
  visibility: "general" | "friends" | "only_me",
  pair: Partial<SocialPair> = {},
  overrides: Partial<PersonRelation> = {},
) =>
  person(pair, {
    shareEnvironment: true,
    picture: { id: "00000000-0000-4000-8000-0000000000d1", visibility },
    ...overrides,
  });

const ownProfile: OwnProfile = { userId: viewer.userId };

export const peopleMatrices = [
  policyMatrix(readPersonPolicy, [
    expectCase(
      "their own page",
      viewer,
      person({}, { userId: viewer.userId, pair: null }),
      "allow",
    ),
    expectCase("a friend", viewer, person(friends), "allow"),
    expectCase(
      "an active member of a shared environment",
      viewer,
      person({}, { shareEnvironment: true }),
      "allow",
    ),
    expectCase(
      "someone who asked to be friends",
      viewer,
      person(asked),
      "allow",
    ),
    expectCase(
      "someone the viewer asked to be friends",
      viewer,
      person({
        openFriendship: {
          id: "f",
          status: "pending",
          requesterId: viewer.userId,
        },
      }),
      "allow",
    ),
    expectCase(
      "someone the viewer blocks, to lift the block",
      viewer,
      person({ blockedByActor: true, otherActive: false }),
      "allow",
    ),
    expectCase("a stranger", viewer, person(), "not_found"),
    expectCase(
      "a friend who blocks the viewer",
      viewer,
      person({ ...friends, blockedByOther: true }),
      "not_found",
    ),
    expectCase(
      "a fellow member who blocks the viewer",
      viewer,
      person({ blockedByOther: true }, { shareEnvironment: true }),
      "not_found",
    ),
    expectCase(
      "a friend whose account is not active",
      viewer,
      person({ ...friends, otherActive: false }),
      "not_found",
    ),
    expectCase(
      "a request from an account that is not active",
      viewer,
      person({ ...asked, otherActive: false }),
      "not_found",
    ),
    expectCase(
      "a deleted account, even one the viewer blocks",
      viewer,
      person({ blockedByActor: true }, { realName: null }),
      "not_found",
    ),
    expectCase(
      "a relation seen from someone else's side",
      testUserActor(),
      person(friends),
      "not_found",
    ),
    expectCase(
      "anonymous caller",
      anonymousActor,
      person(friends),
      "unauthenticated",
    ),
    expectCase(
      "an account that has not completed registration",
      pendingAccount,
      person(friends),
      "registration_required",
    ),
    expectCase(
      "system processes",
      systemActor("outbox.worker"),
      person(friends),
      "unauthenticated",
    ),
  ]),
  policyMatrix(readProfilePicturePolicy, [
    expectCase(
      "their own picture, whoever it is shown to",
      viewer,
      pictured("only_me", {}, { userId: viewer.userId, pair: null }),
      "allow",
    ),
    expectCase(
      "a fellow member's picture shown generally",
      viewer,
      pictured("general"),
      "allow",
    ),
    expectCase(
      "a friend's picture shown to friends",
      viewer,
      pictured("friends", friends, { shareEnvironment: false }),
      "allow",
    ),
    expectCase(
      "a fellow member's picture shown to friends",
      viewer,
      pictured("friends"),
      "not_found",
    ),
    expectCase(
      "a friend's picture shown only to them",
      viewer,
      pictured("only_me", friends),
      "not_found",
    ),
    expectCase(
      "a stranger's picture shown generally",
      viewer,
      pictured("general", {}, { shareEnvironment: false }),
      "not_found",
    ),
    expectCase(
      "the picture of a fellow member who blocks the viewer",
      viewer,
      pictured("general", { blockedByOther: true }),
      "not_found",
    ),
    expectCase(
      "someone without a picture",
      viewer,
      person({}, { shareEnvironment: true }),
      "not_found",
    ),
    expectCase(
      "a picture seen from someone else's side",
      testUserActor(),
      pictured("general"),
      "not_found",
    ),
    expectCase(
      "anonymous caller",
      anonymousActor,
      pictured("general"),
      "unauthenticated",
    ),
    expectCase(
      "an account that has not completed registration",
      pendingAccount,
      pictured("general"),
      "registration_required",
    ),
  ]),
  policyMatrix(changeProfilePicturePolicy, [
    expectCase("their own picture", viewer, ownProfile, "allow"),
    expectCase(
      "someone else's picture",
      testUserActor(),
      ownProfile,
      "not_found",
    ),
    expectCase(
      "an account that is not active",
      testUserActor({ userId: viewer.userId, accountStatus: "deactivated" }),
      ownProfile,
      "account_inactive",
    ),
    expectCase(
      "anonymous caller",
      anonymousActor,
      ownProfile,
      "unauthenticated",
    ),
    expectCase(
      "system processes",
      systemActor("outbox.worker"),
      ownProfile,
      "unauthenticated",
    ),
  ]),
];

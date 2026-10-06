import { type Actor, anonymousActor, systemActor } from "../actor";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import type { SocialPair } from "../social/pair";
import { testUserActor } from "../testing/actors";
import { readPersonPolicy } from "./policies";
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
    ...pair,
  },
  shareEnvironment: false,
  ...overrides,
});

const friends = {
  openFriendship: { id: "f", status: "active", requesterId: other },
} as const;
const asked = {
  openFriendship: { id: "f", status: "pending", requesterId: other },
} as const;

function expectCase(
  name: string,
  actor: Actor,
  resource: PersonRelation,
  expected: "allow" | DenialReason,
): PolicyCase<PersonRelation, void> {
  return { name, actor, resource, context: undefined, expected };
}

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
];

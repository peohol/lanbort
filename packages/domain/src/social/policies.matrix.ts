import { anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import type { SocialPair } from "./pair";
import {
  acceptFriendRequestPolicy,
  blockUserPolicy,
  createFriendCodePolicy,
  expireFriendInvitationsPolicy,
  friendInvitationDeliveryProcess,
  friendInvitationExpiryProcess,
  readFriendCodePolicy,
  readFriendInvitationsPolicy,
  recordInvitationIdentityPolicy,
  requestFriendByCodePolicy,
  sendFriendInvitationPolicy,
  withdrawFriendInvitationPolicy,
  declineFriendRequestPolicy,
  liftUserBlockPolicy,
  readSocialOverviewPolicy,
  readSocialRelationPolicy,
  removeFriendPolicy,
  sendFriendRequestPolicy,
  withdrawFriendRequestPolicy,
} from "./policies";

const me = testUserActor();
const other = "00000000-0000-4000-8000-0000000000b2";
const pending = testUserActor({
  userId: me.userId,
  accountStatus: "pending_registration",
});

const pair = (overrides: Partial<SocialPair> = {}): SocialPair => ({
  actorId: me.userId,
  otherUserId: other,
  otherActive: true,
  openFriendship: null,
  blockedByActor: false,
  blockedByOther: false,
  requestHeldBack: false,
  ...overrides,
});

const emptyOverview = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blocked: [],
};

type Outcome = "allow" | DenialReason;

/**
 * The situations every pair policy is checked against. `expected` gives the
 * outcome for the four kinds of pair policy: sending a request, acting on an
 * existing relation (or reading it), only ending one, and blocking.
 */
const situations: readonly {
  name: string;
  actor?: PolicyCase<SocialPair, void>["actor"];
  resource: SocialPair;
  expected: {
    request: Outcome;
    relation: Outcome;
    ending: Outcome;
    block: Outcome;
  };
}[] = [
  {
    name: "a registered user the actor can reach",
    resource: pair(),
    expected: {
      request: "allow",
      relation: "allow",
      ending: "allow",
      block: "allow",
    },
  },
  {
    name: "a pending request between them",
    resource: pair({
      openFriendship: {
        id: "f",
        status: "pending",
        requesterId: other,
        hiddenFromRequester: false,
      },
    }),
    expected: {
      request: "allow",
      relation: "allow",
      ending: "allow",
      block: "allow",
    },
  },
  {
    name: "the actor's own request sent to the other's e-mail address (PS-USR-013)",
    resource: pair({
      openFriendship: {
        id: "f",
        status: "pending",
        requesterId: me.userId,
        hiddenFromRequester: true,
      },
    }),
    expected: {
      request: "allow",
      relation: "allow",
      ending: "allow",
      block: "allow",
    },
  },
  {
    name: "a user who blocks the actor looks like a missing one",
    resource: pair({ blockedByOther: true }),
    expected: {
      request: "not_found",
      relation: "not_found",
      ending: "not_found",
      block: "allow",
    },
  },
  {
    name: "a user the actor blocks stays visible to the actor",
    resource: pair({ blockedByActor: true }),
    expected: {
      request: "forbidden",
      relation: "allow",
      ending: "allow",
      block: "allow",
    },
  },
  {
    name: "a declined request the actor has to wait out (PS-USR-012)",
    resource: pair({ requestHeldBack: true }),
    expected: {
      request: "forbidden",
      relation: "allow",
      ending: "allow",
      block: "allow",
    },
  },
  {
    name: "blocks in both directions",
    resource: pair({ blockedByActor: true, blockedByOther: true }),
    expected: {
      request: "forbidden",
      relation: "allow",
      ending: "allow",
      block: "allow",
    },
  },
  {
    name: "an account that is not active, or not registered yet",
    resource: pair({ otherActive: false }),
    expected: {
      request: "not_found",
      relation: "not_found",
      ending: "allow",
      block: "allow",
    },
  },
  {
    name: "a pair the actor is not part of (manipulated input)",
    resource: pair({ actorId: "00000000-0000-4000-8000-0000000000c3" }),
    expected: {
      request: "not_found",
      relation: "not_found",
      ending: "not_found",
      block: "not_found",
    },
  },
  {
    name: "an actor who has not completed registration",
    actor: pending,
    resource: pair(),
    expected: {
      request: "registration_required",
      relation: "registration_required",
      ending: "registration_required",
      block: "registration_required",
    },
  },
  {
    name: "an anonymous caller",
    actor: anonymousActor,
    resource: pair(),
    expected: {
      request: "unauthenticated",
      relation: "unauthenticated",
      ending: "unauthenticated",
      block: "unauthenticated",
    },
  },
  {
    name: "a system process",
    actor: systemActor("outbox.worker"),
    resource: pair(),
    expected: {
      request: "unauthenticated",
      relation: "unauthenticated",
      ending: "unauthenticated",
      block: "unauthenticated",
    },
  },
];

function matrixFor(
  policy: Policy<SocialPair, void>,
  kind: keyof (typeof situations)[number]["expected"],
) {
  return policyMatrix(
    policy,
    situations.map((situation) => ({
      name: situation.name,
      actor: situation.actor ?? me,
      resource: situation.resource,
      context: undefined,
      expected: situation.expected[kind],
    })),
  );
}

const own = { inviterId: me.userId };

/** What only the sender of an invitation, or the owner of a code, can do. */
const ownInvitationMatrix = (policy: Policy<{ inviterId: string }, void>) =>
  policyMatrix(policy, [
    {
      name: "the caller's own",
      actor: me,
      resource: own,
      context: undefined,
      expected: "allow",
    },
    {
      name: "someone else's looks like one that does not exist",
      actor: me,
      resource: { inviterId: other },
      context: undefined,
      expected: "not_found",
    },
    {
      name: "an actor who has not completed registration",
      actor: pending,
      resource: own,
      context: undefined,
      expected: "registration_required",
    },
    {
      name: "an anonymous caller",
      actor: anonymousActor,
      resource: own,
      context: undefined,
      expected: "unauthenticated",
    },
  ]);

/** A job's or worker's own step, which no person can take. */
const processMatrix = (policy: Policy<void, void>, process: string) =>
  policyMatrix(policy, [
    {
      name: "the process itself",
      actor: systemActor(process),
      resource: undefined,
      context: undefined,
      expected: "allow",
    },
    {
      name: "another process",
      actor: systemActor("outbox.worker"),
      resource: undefined,
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "a signed-in user",
      actor: me,
      resource: undefined,
      context: undefined,
      expected: "forbidden",
    },
  ]);

export const socialMatrices = [
  ...[sendFriendRequestPolicy, requestFriendByCodePolicy].map((policy) =>
    matrixFor(policy, "request"),
  ),
  ...[
    acceptFriendRequestPolicy,
    readSocialRelationPolicy,
    readFriendCodePolicy,
  ].map((policy) => matrixFor(policy, "relation")),
  ...[
    sendFriendInvitationPolicy,
    withdrawFriendInvitationPolicy,
    createFriendCodePolicy,
  ].map(ownInvitationMatrix),
  processMatrix(expireFriendInvitationsPolicy, friendInvitationExpiryProcess),
  processMatrix(
    recordInvitationIdentityPolicy,
    friendInvitationDeliveryProcess,
  ),
  policyMatrix(readFriendInvitationsPolicy, [
    {
      name: "a registered user reads their own invitations",
      actor: me,
      resource: [],
      context: undefined,
      expected: "allow",
    },
    {
      name: "an actor who has not completed registration",
      actor: pending,
      resource: [],
      context: undefined,
      expected: "registration_required",
    },
  ]),
  ...[
    declineFriendRequestPolicy,
    withdrawFriendRequestPolicy,
    removeFriendPolicy,
  ].map((policy) => matrixFor(policy, "ending")),
  ...[blockUserPolicy, liftUserBlockPolicy].map((policy) =>
    matrixFor(policy, "block"),
  ),
  policyMatrix(readSocialOverviewPolicy, [
    {
      name: "a registered user reads their own relations",
      actor: me,
      resource: emptyOverview,
      context: undefined,
      expected: "allow",
    },
    {
      name: "an actor who has not completed registration",
      actor: pending,
      resource: emptyOverview,
      context: undefined,
      expected: "registration_required",
    },
    {
      name: "an anonymous caller",
      actor: anonymousActor,
      resource: emptyOverview,
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
];

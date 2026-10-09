import { anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import type { SocialPair } from "./pair";
import {
  acceptFriendRequestPolicy,
  blockUserPolicy,
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
 * outcome for the three kinds of pair policy: sending a request, acting on an
 * existing relation (or reading it), and blocking.
 */
const situations: readonly {
  name: string;
  actor?: PolicyCase<SocialPair, void>["actor"];
  resource: SocialPair;
  expected: { request: Outcome; relation: Outcome; block: Outcome };
}[] = [
  {
    name: "a registered user the actor can reach",
    resource: pair(),
    expected: { request: "allow", relation: "allow", block: "allow" },
  },
  {
    name: "a pending request between them",
    resource: pair({
      openFriendship: { id: "f", status: "pending", requesterId: other },
    }),
    expected: { request: "allow", relation: "allow", block: "allow" },
  },
  {
    name: "a user who blocks the actor looks like a missing one",
    resource: pair({ blockedByOther: true }),
    expected: { request: "not_found", relation: "not_found", block: "allow" },
  },
  {
    name: "a user the actor blocks stays visible to the actor",
    resource: pair({ blockedByActor: true }),
    expected: { request: "forbidden", relation: "allow", block: "allow" },
  },
  {
    name: "a declined request the actor has to wait out (PS-USR-012)",
    resource: pair({ requestHeldBack: true }),
    expected: { request: "forbidden", relation: "allow", block: "allow" },
  },
  {
    name: "blocks in both directions",
    resource: pair({ blockedByActor: true, blockedByOther: true }),
    expected: { request: "forbidden", relation: "allow", block: "allow" },
  },
  {
    name: "an account that has not completed registration",
    resource: pair({ otherActive: false }),
    expected: { request: "not_found", relation: "not_found", block: "allow" },
  },
  {
    name: "a pair the actor is not part of (manipulated input)",
    resource: pair({ actorId: "00000000-0000-4000-8000-0000000000c3" }),
    expected: {
      request: "not_found",
      relation: "not_found",
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

export const socialMatrices = [
  matrixFor(sendFriendRequestPolicy, "request"),
  ...[
    acceptFriendRequestPolicy,
    declineFriendRequestPolicy,
    withdrawFriendRequestPolicy,
    removeFriendPolicy,
    readSocialRelationPolicy,
  ].map((policy) => matrixFor(policy, "relation")),
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

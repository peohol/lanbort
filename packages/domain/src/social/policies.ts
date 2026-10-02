import type { SocialOverview } from "@lanbort/contracts";
import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireActiveAccount } from "../authorization/rules";
import type { SocialPair } from "./pair";

type PairRule = ResourceRule<SocialPair, void>;

/**
 * The actor is one side of the pair. Commands only ever load the actor's own
 * pairs; this rule makes that the policy's decision too, so no input can make
 * a user act on someone else's relations.
 */
const actorIsParty: PairRule = ({ actor, resource }) =>
  actor.kind === "user" && actor.userId === resource.actorId
    ? allow
    : deny("not_found");

/**
 * The other user can be reached: a registered account that does not block the
 * actor. A user who blocks the actor looks exactly like one that does not
 * exist (PS-USR-006). The actor still sees users they block themselves, so
 * they can lift the block.
 */
const otherIsVisible: PairRule = ({ resource }) =>
  resource.blockedByActor || (resource.otherActive && !resource.blockedByOther)
    ? allow
    : deny("not_found");

/** The actor has to lift their own block before contacting the other. */
const notBlockedByActor: PairRule = ({ resource }) =>
  resource.blockedByActor ? deny("forbidden") : allow;

const visiblePair = [actorIsParty, otherIsVisible] as const;

export const sendFriendRequestPolicy = definePolicy<SocialPair, void>({
  action: "friendship.request",
  actor: [requireActiveAccount],
  resource: [...visiblePair, notBlockedByActor],
});

/** Answering, withdrawing and ending act on the pair's open relation. */
function relationPolicy(action: string) {
  return definePolicy<SocialPair, void>({
    action,
    actor: [requireActiveAccount],
    resource: visiblePair,
  });
}

export const acceptFriendRequestPolicy = relationPolicy("friendship.accept");
export const declineFriendRequestPolicy = relationPolicy("friendship.decline");
export const withdrawFriendRequestPolicy = relationPolicy(
  "friendship.withdraw",
);
export const removeFriendPolicy = relationPolicy("friendship.remove");
export const readSocialRelationPolicy = relationPolicy("social.relation.read");

/**
 * Anyone can be blocked, whether or not they are visible, friends, or already
 * block the actor (blocks from both sides are independent). The answer is the
 * same for every existing account, so blocking reveals nothing either.
 */
function blockPolicy(action: string) {
  return definePolicy<SocialPair, void>({
    action,
    actor: [requireActiveAccount],
    resource: [actorIsParty],
  });
}

export const blockUserPolicy = blockPolicy("user_block.create");
export const liftUserBlockPolicy = blockPolicy("user_block.lift");

/**
 * The actor's own friends, requests and blocks. The overview is loaded for the
 * actor only, so the actor rules decide.
 */
export const readSocialOverviewPolicy = definePolicy<SocialOverview, void>({
  action: "social.overview.read",
  actor: [requireActiveAccount],
});

export const socialPolicies = [
  sendFriendRequestPolicy,
  acceptFriendRequestPolicy,
  declineFriendRequestPolicy,
  withdrawFriendRequestPolicy,
  removeFriendPolicy,
  readSocialRelationPolicy,
  blockUserPolicy,
  liftUserBlockPolicy,
  readSocialOverviewPolicy,
];

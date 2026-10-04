import {
  type FriendshipState,
  socialRelationSchema,
  socialTargetSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import type { Policy } from "../authorization/policy";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventDefinition } from "../events/catalog";
import type { EventRecorder } from "../events/recorder";
import {
  friendshipAccepted,
  friendshipClosedByBlock,
  friendshipDeclined,
  friendshipRemoved,
  friendshipRequested,
  friendshipWithdrawn,
  userBlockLifted,
  userBlocked,
} from "./events";
import {
  friendshipStateOf,
  loadPair,
  lockPair,
  relationOf,
  type SocialPair,
} from "./pair";
import {
  acceptFriendRequestPolicy,
  blockUserPolicy,
  declineFriendRequestPolicy,
  liftUserBlockPolicy,
  removeFriendPolicy,
  sendFriendRequestPolicy,
  withdrawFriendRequestPolicy,
} from "./policies";

export interface ChangeArgs {
  readonly tx: Transaction<Database>;
  readonly pair: SocialPair;
  readonly events: EventRecorder;
  readonly now: Date;
}

/**
 * Every social command names the other user and acts on the pair the caller
 * is part of. The pair is locked before it is read, so concurrent commands for
 * the same two people run one after the other and each sees the result of the
 * previous one. A command whose outcome already holds (a double tap with a new
 * key, a crossing request) changes nothing and records no event; it returns
 * the caller's current relation like every other success.
 */
function pairCommand(definition: {
  name: string;
  policy: Policy<SocialPair, void>;
  change(args: ChangeArgs): Promise<void>;
}) {
  return defineCommand({
    name: definition.name,
    input: socialTargetSchema,
    output: socialRelationSchema,
    policy: definition.policy,
    idempotency: "required",
    load: async ({ tx, actor, input }) => {
      if (actor.kind !== "user") {
        return null;
      }

      await lockPair(tx, actor.userId, input.userId);
      const pair = await loadPair(tx, actor.userId, input.userId);

      return pair ? { resource: pair, context: undefined } : null;
    },
    execute: async ({ tx, resource, events, now }) => {
      await definition.change({ tx, pair: resource, events, now });
      const after = await loadPair(tx, resource.actorId, resource.otherUserId);

      return relationOf(after as SocialPair);
    },
  });
}

/**
 * Runs the transition that applies to the pair's current friendship state.
 * States listed in `unchanged` already have the requested outcome; any other
 * state cannot make this transition.
 */
async function transition(
  args: ChangeArgs,
  from: Exclude<FriendshipState, "none">,
  unchanged: readonly FriendshipState[],
  apply: (friendshipId: string) => Promise<void>,
) {
  const state = friendshipStateOf(args.pair);
  const open = args.pair.openFriendship;

  if (state === from && open) {
    await apply(open.id);
  } else if (!unchanged.includes(state)) {
    throw new DomainError(
      "conflict",
      `Friendship is ${state}, expected ${from}`,
    );
  }
}

export async function endFriendship(
  { tx, pair, events, now }: ChangeArgs,
  friendshipId: string,
  reason: "declined" | "withdrawn" | "removed" | "blocked",
  event: EventDefinition<Record<string, never>>,
) {
  await tx
    .updateTable("app.friendships")
    .set({
      status: "ended",
      ended_at: now,
      ended_by_user_id: pair.actorId,
      end_reason: reason,
    })
    .where("id", "=", friendshipId)
    .execute();

  events.record(event, { resourceId: friendshipId, payload: {} });
}

/** PS-USR-003: a request to someone the caller can reach. */
export const sendFriendRequest = pairCommand({
  name: "friendship.request",
  policy: sendFriendRequestPolicy,
  // Any open relation is left as it is. In particular a crossing request
  // leaves the other's pending request in place for the caller to accept:
  // a friendship only ever starts with an acceptance.
  change: async ({ tx, pair, events, now }) => {
    if (pair.openFriendship) {
      return;
    }

    const { id } = await tx
      .insertInto("app.friendships")
      .values({
        requester_id: pair.actorId,
        addressee_id: pair.otherUserId,
        requested_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(friendshipRequested, { resourceId: id, payload: {} });
  },
});

export const acceptFriendRequest = pairCommand({
  name: "friendship.accept",
  policy: acceptFriendRequestPolicy,
  change: (args) =>
    transition(args, "incoming_pending", ["friends"], async (id) => {
      await args.tx
        .updateTable("app.friendships")
        .set({ status: "active", accepted_at: args.now })
        .where("id", "=", id)
        .execute();

      args.events.record(friendshipAccepted, { resourceId: id, payload: {} });
    }),
});

export const declineFriendRequest = pairCommand({
  name: "friendship.decline",
  policy: declineFriendRequestPolicy,
  change: (args) =>
    transition(args, "incoming_pending", ["none"], (id) =>
      endFriendship(args, id, "declined", friendshipDeclined),
    ),
});

export const withdrawFriendRequest = pairCommand({
  name: "friendship.withdraw",
  policy: withdrawFriendRequestPolicy,
  change: (args) =>
    transition(args, "outgoing_pending", ["none"], (id) =>
      endFriendship(args, id, "withdrawn", friendshipWithdrawn),
    ),
});

/** PS-USR-003: either friend can end the friendship alone. */
export const removeFriend = pairCommand({
  name: "friendship.remove",
  policy: removeFriendPolicy,
  change: (args) =>
    transition(args, "friends", ["none"], (id) =>
      endFriendship(args, id, "removed", friendshipRemoved),
    ),
});

/**
 * PS-USR-006: the block and the end of any pending request or friendship
 * between the two happen together. Nothing else is touched, so established
 * loans, cases and earned review rights stay as they are (PS-USR-007).
 */
export async function placeBlock(args: ChangeArgs): Promise<void> {
  if (args.pair.blockedByActor) {
    return;
  }

  const { id } = await args.tx
    .insertInto("app.user_blocks")
    .values({
      blocker_id: args.pair.actorId,
      blocked_id: args.pair.otherUserId,
      created_at: args.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  args.events.record(userBlocked, { resourceId: id, payload: {} });

  if (args.pair.openFriendship) {
    await endFriendship(
      args,
      args.pair.openFriendship.id,
      "blocked",
      friendshipClosedByBlock,
    );
  }
}

export const blockUser = pairCommand({
  name: "user_block.create",
  policy: blockUserPolicy,
  change: placeBlock,
});

/** Lifting a block restores nothing: earlier relations stay ended. */
export const liftUserBlock = pairCommand({
  name: "user_block.lift",
  policy: liftUserBlockPolicy,
  change: async ({ tx, pair, events, now }) => {
    if (!pair.blockedByActor) {
      return;
    }

    const { id } = await tx
      .updateTable("app.user_blocks")
      .set({ lifted_at: now })
      .where("blocker_id", "=", pair.actorId)
      .where("blocked_id", "=", pair.otherUserId)
      .where("lifted_at", "is", null)
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(userBlockLifted, { resourceId: id, payload: {} });
  },
});

import type { FriendshipState, SocialRelation } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";

/**
 * Everything about one pair of users that the social policies decide on, seen
 * from the actor's side. Loaded fresh inside each command's transaction after
 * {@link lockPair}, so concurrent commands for the same pair (crossing
 * requests, a block racing an accept, double taps) see each other's result.
 */
export interface SocialPair {
  readonly actorId: string;
  readonly otherUserId: string;
  /** The other account has completed registration. */
  readonly otherActive: boolean;
  /** The pending request or friendship between them, if any. */
  readonly openFriendship: OpenFriendship | null;
  readonly blockedByActor: boolean;
  /** Internal only: never returned to the actor (PS-USR-006). */
  readonly blockedByOther: boolean;
}

export interface OpenFriendship {
  readonly id: string;
  readonly status: "pending" | "active";
  readonly requesterId: string;
}

/**
 * The pair in the order Postgres uses for the friendship's `user_low_id` and
 * `user_high_id` (lower-case UUID text sorts like the UUID bytes).
 */
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Serializes every social change for the pair until the transaction ends.
 * The key is the same whichever of the two acts.
 */
export async function lockPair(
  tx: Kysely<Database>,
  a: string,
  b: string,
): Promise<void> {
  const key = `social_pair:${orderedPair(a, b).join(":")}`;

  await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(
    tx,
  );
}

/**
 * The pair as seen by `actorId`, or null when the other user does not exist
 * (or is the actor), which the caller turns into the same `not_found` as for
 * a user it may not see.
 */
export async function loadPair(
  db: Kysely<Database>,
  actorId: string,
  otherUserId: string,
): Promise<SocialPair | null> {
  if (actorId === otherUserId) {
    return null;
  }

  const other = await db
    .selectFrom("app.users")
    .select("status")
    .where("id", "=", otherUserId)
    .executeTakeFirst();

  if (!other) {
    return null;
  }

  const [low, high] = orderedPair(actorId, otherUserId);
  const friendship = await db
    .selectFrom("app.friendships")
    .select(["id", "status", "requester_id"])
    .where("user_low_id", "=", low)
    .where("user_high_id", "=", high)
    .where("status", "<>", "ended")
    .executeTakeFirst();
  const blocks = await db
    .selectFrom("app.user_blocks")
    .select("blocker_id")
    .where("lifted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("blocker_id", "=", actorId),
          eb("blocked_id", "=", otherUserId),
        ]),
        eb.and([
          eb("blocker_id", "=", otherUserId),
          eb("blocked_id", "=", actorId),
        ]),
      ]),
    )
    .execute();

  return {
    actorId,
    otherUserId,
    otherActive: other.status === "active",
    openFriendship: friendship
      ? {
          id: friendship.id,
          status: friendship.status as OpenFriendship["status"],
          requesterId: friendship.requester_id,
        }
      : null,
    blockedByActor: blocks.some((block) => block.blocker_id === actorId),
    blockedByOther: blocks.some((block) => block.blocker_id === otherUserId),
  };
}

export function friendshipStateOf(pair: SocialPair): FriendshipState {
  const friendship = pair.openFriendship;

  if (!friendship) {
    return "none";
  }

  if (friendship.status === "active") {
    return "friends";
  }

  return friendship.requesterId === pair.actorId
    ? "outgoing_pending"
    : "incoming_pending";
}

/** The actor's view of the pair. Never says whether the other blocks them. */
export function relationOf(pair: SocialPair): SocialRelation {
  return {
    userId: pair.otherUserId,
    friendship: friendshipStateOf(pair),
    blockedByMe: pair.blockedByActor,
  };
}

/**
 * For later domains that must check the social relation at the moment a new
 * contact or obligation is established: direct friend loans need an active
 * friendship at approval (PS-USR-004), and new requests, loans, conversations
 * and co-ownership are stopped by a block in either direction (PS-USR-006).
 * Established obligations must not be re-checked against this (PS-USR-007).
 * Call it inside the deciding transaction, after {@link lockPair} when the
 * decision races social changes.
 */
export async function socialRelationBetween(
  db: Kysely<Database>,
  a: string,
  b: string,
): Promise<{ friends: boolean; blockedEitherWay: boolean }> {
  const pair = await loadPair(db, a, b);

  return {
    friends: pair?.openFriendship?.status === "active",
    blockedEitherWay:
      pair !== null && (pair.blockedByActor || pair.blockedByOther),
  };
}

import type { FriendshipState, SocialRelation } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, type RawBuilder, sql } from "kysely";

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
  /**
   * The other declined the actor's latest request and has not asked since,
   * so the actor may not ask again (PS-USR-012). Internal only: the actor
   * only ever learns that a request cannot be sent now.
   */
  readonly requestHeldBack: boolean;
}

export interface OpenFriendship {
  readonly id: string;
  readonly status: "pending" | "active";
  readonly requesterId: string;
}

/** {@link SocialPair.requestHeldBack} for `actorId` asking `otherUserId`. */
export const requestHeldBack = (
  actorId: string | RawBuilder<unknown>,
  otherUserId: string | RawBuilder<unknown>,
) =>
  sql<boolean>`app.friend_request_held_back(${actorId}::uuid, ${otherUserId}::uuid)`;

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
    .select([
      "status",
      requestHeldBack(actorId, otherUserId).as("requestHeldBack"),
    ])
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
    requestHeldBack: other.requestHeldBack,
  };
}

/**
 * Runs several reads against one consistent snapshot, so a query never mixes
 * state from before and after a concurrent social change (for example a
 * friendship that a block has just ended next to that block).
 */
export function readSnapshot<T>(
  db: Kysely<Database>,
  read: (snapshot: Kysely<Database>) => Promise<T>,
): Promise<T> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .setAccessMode("read only")
    .execute(read);
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

/**
 * The actor may send the other a friend request now: no open relation, no
 * block of their own, and no declined request to wait out (PS-USR-012).
 */
export function mayRequestFriendship(pair: SocialPair): boolean {
  return !pair.openFriendship && !pair.blockedByActor && !pair.requestHeldBack;
}

/**
 * The actor's view of the pair. Never says whether the other blocks them,
 * or why a request cannot be sent now.
 */
export function relationOf(pair: SocialPair): SocialRelation {
  return {
    userId: pair.otherUserId,
    friendship: friendshipStateOf(pair),
    blockedByMe: pair.blockedByActor,
    canRequest: mayRequestFriendship(pair),
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

/**
 * Takes the social pair lock of each pair, in one global order so two
 * transactions never wait on each other's locks. A block or an ended
 * friendship between any of the pairs is then either already visible or
 * waits for this transaction, whose new rows its triggers will see.
 */
export async function lockPairs(
  tx: Kysely<Database>,
  pairs: Iterable<readonly [string, string]>,
): Promise<void> {
  const keys = new Map<string, [string, string]>();

  for (const [a, b] of pairs) {
    if (a !== b) {
      const pair = orderedPair(a, b);
      keys.set(pair.join(":"), pair);
    }
  }

  for (const key of [...keys.keys()].sort()) {
    const [a, b] = keys.get(key)!;
    await lockPair(tx, a, b);
  }
}

/** The pair locks between `userId` and each of `others` (`lockPairs`). */
export async function lockPairsWith(
  tx: Kysely<Database>,
  userId: string,
  others: readonly string[],
): Promise<void> {
  await lockPairs(
    tx,
    others.map((other) => [userId, other] as const),
  );
}

/** A block in either direction between `userId` and any of `others`. */
export async function blockedWithAny(
  db: Kysely<Database>,
  userId: string,
  others: readonly string[],
): Promise<boolean> {
  for (const other of others) {
    if ((await socialRelationBetween(db, userId, other)).blockedEitherWay) {
      return true;
    }
  }

  return false;
}

/** An active friendship between `userId` and any of `others`. */
export async function friendsWithAny(
  db: Kysely<Database>,
  userId: string,
  others: readonly string[],
): Promise<boolean> {
  for (const other of others) {
    if ((await socialRelationBetween(db, userId, other)).friends) {
      return true;
    }
  }

  return false;
}

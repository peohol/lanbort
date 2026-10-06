import {
  type FriendObjectList,
  friendObjectImageSchema,
  friendObjectsQuerySchema,
  friendPublicationResultSchema,
  friendPublicationSchema,
  publicationPageSize,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { rateLimits } from "../abuse/rate-limits";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import { loadFreezes } from "../objects/co-owner-blocks";
import { objectImageKey } from "../objects/images";
import { actingUserId, inSnapshot, loadObjectState } from "../objects/state";
import { loadPair } from "../social/pair";
import { vetoedByAnotherOwner } from "./commands";
import { endFriendPublication, findFriendPublication } from "./store";
import { friendPublicationCreated, friendPublicationWithdrawn } from "./events";
import {
  listFriendObjectsPolicy,
  publishToFriendsPolicy,
  readFriendObjectImagePolicy,
  withdrawFromFriendsPolicy,
} from "./policies";
import {
  findableBy,
  type FoundRow,
  loadFoundDetails,
  ownedBy,
  presentFound,
} from "./queries";

type Db = Kysely<Database>;

/**
 * The objects the viewer finds through friends (PS-OBJ-020): visible to
 * friends, found by the rule every way of finding an object follows
 * ({@link findableBy}), and owned by a friend of the viewer whose account can
 * lend it. This is the one place discovery through friends is decided.
 */
export function discoverableThroughFriends(db: Db, viewerId: string) {
  return db
    .selectFrom("app.object_friend_publications as friend_publication")
    .innerJoin(
      "app.objects as object",
      "object.id",
      "friend_publication.object_id",
    )
    .where("friend_publication.withdrawn_at", "is", null)
    .where(findableBy(viewerId))
    .where(
      sql<boolean>`app.has_friend_among_owners(${viewerId}::uuid, object.id)`,
    );
}

/** What a viewer is shown of each object they find through friends. */
export function selectFoundThroughFriends(
  query: ReturnType<typeof discoverableThroughFriends>,
  viewerId: string,
) {
  return query.select([
    "friend_publication.id",
    "object.id as object_id",
    "object.title",
    "object.category_id",
    "object.description",
    "object.loan_terms",
    ownedBy(viewerId).as("owned_by_you"),
  ]);
}

/**
 * Whether the viewer finds the object through friends now. A direct request
 * is made only for such an object, like an environment request for one
 * found in the environment.
 */
export async function findsThroughFriends(
  db: Db,
  objectId: string,
  viewerId: string,
): Promise<boolean> {
  const row = await discoverableThroughFriends(db, viewerId)
    .select("object.id")
    .where("object.id", "=", objectId)
    .executeTakeFirst();

  return row !== undefined;
}

const result = (objectId: string, visibleToFriends: boolean) => ({
  objectId,
  visibleToFriends,
});

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

/**
 * PS-OBJ-020: an owner makes the object visible to friends. Like a new
 * publication it is a new commitment, so an archived or frozen object, or
 * another owner's veto (PS-OBJ-008), stops it. Turning it on again returns
 * it unchanged.
 */
export const publishToFriends = defineCommand({
  name: "friend_publication.publish",
  input: friendPublicationSchema,
  output: friendPublicationResultSchema,
  policy: publishToFriendsPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const object = await loadObjectState(tx, input.objectId, { lock: true });

    return object ? { resource: object, context: undefined } : null;
  },
  execute: async ({ tx, actor, resource, events, now }) => {
    const { objectId } = resource;
    const userId = actingUserId(actor);

    if (await findFriendPublication(tx, objectId, { lock: true })) {
      return result(objectId, true);
    }

    if (resource.status !== "active") {
      conflict("An archived object cannot be published");
    }

    if ((await loadFreezes(tx, [objectId])).size > 0) {
      conflict("The object is frozen until its ownership is clarified");
    }

    if (await vetoedByAnotherOwner(tx, objectId, userId)) {
      conflict("Another owner has restricted new commitments");
    }

    await tx
      .insertInto("app.object_friend_publications")
      .values({
        object_id: objectId,
        published_by_user_id: userId,
        published_at: now,
      })
      .execute();
    events.record(friendPublicationCreated, {
      resourceId: objectId,
      payload: {},
    });

    return result(objectId, true);
  },
});

/**
 * Any owner takes the object back from friends; its open direct requests end
 * neutrally, approved loans continue. Taking back what is not visible
 * returns it unchanged.
 */
export const withdrawFromFriends = defineCommand({
  name: "friend_publication.withdraw",
  input: friendPublicationSchema,
  output: friendPublicationResultSchema,
  policy: withdrawFromFriendsPolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const object = await loadObjectState(tx, input.objectId, { lock: true });

    return object ? { resource: object, context: undefined } : null;
  },
  execute: async ({ tx, actor, resource, events, now }) => {
    const { objectId } = resource;
    const current = await findFriendPublication(tx, objectId, { lock: true });

    if (current) {
      await endFriendPublication(tx, current.id, actingUserId(actor), now);
      events.record(friendPublicationWithdrawn, {
        resourceId: objectId,
        payload: {},
      });
    }

    return result(objectId, false);
  },
});

/** Rows after the cursor, newest first. */
function afterCursor(cursor: string | undefined) {
  return cursor === undefined
    ? sql<boolean>`true`
    : sql<boolean>`(friend_publication.published_at, friend_publication.id) < (
        select published_at, id from app.object_friend_publications where id = ${cursor}
      )`;
}

/**
 * A friend's objects that are visible to friends, for their profile
 * (PS-OBJ-020, UX-JRN-013), newest first: the ones the caller finds through
 * friends that this user owns. Anyone else's profile shows none, and a user
 * who blocks the caller is `not_found`.
 */
export const listFriendObjects = defineQuery({
  name: "friend_object.list",
  input: friendObjectsQuerySchema,
  policy: listFriendObjectsPolicy,
  rateLimit: rateLimits.lookups,
  load: ({ db, actor, input }) =>
    inSnapshot(db, async (tx) => {
      const pair =
        actor.kind === "user"
          ? await loadPair(tx, actor.userId, input.userId)
          : null;

      if (!pair) {
        return null;
      }

      // Nothing is read about anyone but a friend.
      const rows: FoundRow[] =
        pair.openFriendship?.status === "active"
          ? await selectFoundThroughFriends(
              discoverableThroughFriends(tx, pair.actorId),
              pair.actorId,
            )
              .where(
                sql<boolean>`exists (
                  select 1 from app.object_owners
                  where object_id = object.id and user_id = ${pair.otherUserId}
                )`,
              )
              .where(
                sql<boolean>`app.account_accepts_new_activity(${pair.otherUserId}::uuid)`,
              )
              .where(afterCursor(input.cursor))
              .orderBy("friend_publication.published_at", "desc")
              .orderBy("friend_publication.id", "desc")
              .limit(publicationPageSize + 1)
              .execute()
          : [];
      const items = rows.slice(0, publicationPageSize);
      const details = await loadFoundDetails(
        tx,
        items.map((row) => row.object_id),
      );

      return {
        resource: {
          pair,
          items,
          details,
          nextCursor:
            rows.length > publicationPageSize
              ? (items.at(-1)?.id ?? null)
              : null,
        },
        context: undefined,
      };
    }),
  present: ({ resource, now }): FriendObjectList => ({
    objects: resource.items.map((row) =>
      presentFound(row, resource.details, now),
    ),
    nextCursor: resource.nextCursor,
  }),
});

/** Authorizes reading an image of an object found through friends. */
export const friendObjectImageFile = defineQuery({
  name: "friend_object.read_image",
  input: friendObjectImageSchema,
  policy: readFriendObjectImagePolicy,
  load: ({ db, actor, input }) =>
    inSnapshot(db, async (tx) => {
      const image =
        actor.kind === "user"
          ? await tx
              .selectFrom("app.object_images")
              .select(["id", "content_type"])
              .where("id", "=", input.imageId)
              .where("object_id", "=", input.objectId)
              .executeTakeFirst()
          : undefined;

      if (actor.kind !== "user" || !image) {
        return null;
      }

      return {
        resource: {
          findable: await findsThroughFriends(tx, input.objectId, actor.userId),
          key: objectImageKey(input.objectId, image.id),
          contentType: image.content_type,
        },
        context: undefined,
      };
    }),
  present: ({ resource }) => ({
    key: resource.key,
    contentType: resource.contentType,
  }),
});

import type {
  PublicationEndReason,
  PublicationStatus,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Expression, type Kysely, type RawBuilder, sql } from "kysely";
import { lockAccounts } from "../account/store";
import { toPosition } from "../environment/privacy";
import type { EventRecorder } from "../events/recorder";
import { lockPairs } from "../social/pair";
import { publicationEnded } from "./events";
import { livePublicationStatuses, type PublicationRecord } from "./model";

/**
 * Database access for publications. Commands pass their transaction and lock
 * what they change. Lock order across the system: object, then environment,
 * then membership, then publication.
 */
type Db = Kysely<Database>;

const publicationColumns = [
  "id",
  "object_id",
  "environment_id",
  "published_by_user_id",
  "status",
  "end_reason",
  "created_at",
  "status_changed_at",
  "position",
] as const;

type PublicationRow = {
  id: string;
  object_id: string;
  environment_id: string;
  published_by_user_id: string;
  status: string;
  end_reason: string | null;
  created_at: Date;
  status_changed_at: Date;
  position: string;
};

export function toPublication(row: PublicationRow): PublicationRecord {
  return {
    id: row.id,
    objectId: row.object_id,
    environmentId: row.environment_id,
    publishedByUserId: row.published_by_user_id,
    status: row.status as PublicationStatus,
    endReason: row.end_reason as PublicationEndReason | null,
    createdAt: row.created_at,
    position: toPosition(row.position),
    statusChangedAt: row.status_changed_at,
  };
}

export async function findPublication(
  db: Db,
  publicationId: string,
  options: { lock?: boolean } = {},
): Promise<PublicationRecord | null> {
  let query = db
    .selectFrom("app.environment_publications")
    .select(publicationColumns)
    .where("id", "=", publicationId);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row ? toPublication(row) : null;
}

/** The object's current (not unpublished) publication in the environment. */
export async function findCurrentPublication(
  db: Db,
  objectId: string,
  environmentId: string,
  options: { lock?: boolean } = {},
): Promise<PublicationRecord | null> {
  let query = db
    .selectFrom("app.environment_publications")
    .select(publicationColumns)
    .where("object_id", "=", objectId)
    .where("environment_id", "=", environmentId)
    .where("status", "<>", "unpublished");

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row ? toPublication(row) : null;
}

export async function setPublicationStatus(
  db: Db,
  publicationId: string,
  status: Exclude<PublicationStatus, "unpublished">,
  now: Date,
): Promise<void> {
  await db
    .updateTable("app.environment_publications")
    .set({ status, status_changed_at: now })
    .where("id", "=", publicationId)
    .execute();
}

export async function endPublication(
  db: Db,
  publicationId: string,
  reason: PublicationEndReason,
  endedByUserId: string | null,
  now: Date,
): Promise<void> {
  await db
    .updateTable("app.environment_publications")
    .set({
      status: "unpublished",
      status_changed_at: now,
      ended_at: now,
      end_reason: reason,
      ended_by_user_id: endedByUserId,
    })
    .where("id", "=", publicationId)
    .execute();
}

/**
 * PS-OBJ-006 as of `now`: an owner of the object has an active membership in
 * the environment whose transition period has not run out (PS-ENV-006). The
 * database's own check follows the stored state, which the scheduled job
 * brings up to date. Takes column references or values.
 */
export function ownerHasAccess(
  objectId: Expression<string> | string,
  environmentId: Expression<string> | string,
  now: Date,
): RawBuilder<boolean> {
  return sql<boolean>`exists (
    select 1
    from app.object_owners as access_owner
    join app.environment_memberships as access_membership
      on access_membership.user_id = access_owner.user_id
    where access_owner.object_id = ${objectId}
      and access_membership.environment_id = ${environmentId}
      and access_membership.state = 'active'
      and (access_membership.transition_deadline is null
        or access_membership.transition_deadline > ${now})
  )`;
}

/** A user and an object they may find. */
export interface Finder {
  readonly userId: string;
  readonly objectId: string;
}

/**
 * Holds still, until the transaction ends, what decides whether each user
 * finds their object (`whereUserFinds`): the objects with their owners and
 * freezes, the environments they are published in, the users' and the
 * owners' memberships there, the publications, and blocks between each user
 * and the object's owners or anyone in `pairs`. Whatever takes access away
 * has then either committed before the caller reads it, or waits until the
 * caller has acted on what it read (PS-OBJ-014–015). In the lock order of
 * the module, with the social pairs last as in `assessOrigin`. The accounts
 * of the users and the owners come first (account/store.ts): whether they
 * are active decides it too (PS-ADM-002).
 */
export async function holdFinding(
  tx: Db,
  finders: readonly Finder[],
  pairs: readonly (readonly [string, string])[] = [],
): Promise<void> {
  const objectIds = [...new Set(finders.map((finder) => finder.objectId))];

  if (objectIds.length === 0) {
    return;
  }

  const ownersBefore = await tx
    .selectFrom("app.object_owners")
    .select("user_id")
    .where("object_id", "in", objectIds)
    .execute();
  await lockAccounts(tx, [
    ...finders.map((finder) => finder.userId),
    ...ownersBefore.map((owner) => owner.user_id),
  ]);
  await tx
    .selectFrom("app.objects")
    .select("id")
    .where("id", "in", objectIds)
    .orderBy("id")
    .forShare()
    .execute();

  const owners = await tx
    .selectFrom("app.object_owners")
    .select(["object_id", "user_id"])
    .where("object_id", "in", objectIds)
    .execute();
  const publications = await tx
    .selectFrom("app.environment_publications")
    .select(["id", "environment_id"])
    .where("object_id", "in", objectIds)
    .where("status", "=", "active")
    .orderBy("id")
    .execute();
  const environmentIds = [
    ...new Set(publications.map((row) => row.environment_id)),
  ];
  const people = [
    ...new Set([
      ...finders.map((finder) => finder.userId),
      ...owners.map((owner) => owner.user_id),
    ]),
  ];

  if (publications.length > 0) {
    await tx
      .selectFrom("app.environments")
      .select("id")
      .where("id", "in", environmentIds)
      .orderBy("id")
      .forShare()
      .execute();
    await tx
      .selectFrom("app.environment_memberships")
      .select("id")
      .where("environment_id", "in", environmentIds)
      .where("user_id", "in", people)
      .orderBy("id")
      .forShare()
      .execute();
    await tx
      .selectFrom("app.environment_publications")
      .select("id")
      .where(
        "id",
        "in",
        publications.map((row) => row.id),
      )
      .orderBy("id")
      .forShare()
      .execute();
  }

  await lockPairs(tx, [
    ...pairs,
    ...finders.flatMap(({ userId, objectId }) =>
      owners
        .filter((owner) => owner.object_id === objectId)
        .map((owner) => [userId, owner.user_id] as const),
    ),
  ]);
}

/** Whether an owner of the object has active access to the environment now. */
export async function hasOwnerAccess(
  db: Db,
  objectId: string,
  environmentId: string,
  now: Date,
): Promise<boolean> {
  const row = await db
    .selectNoFrom(ownerHasAccess(objectId, environmentId, now).as("access"))
    .executeTakeFirstOrThrow();

  return row.access;
}

/**
 * PS-ENV-012: once winding down is final, the environment's pending and
 * active publications end. Rejections and blocks stay as the decisions they
 * were; the objects themselves are not touched.
 */
export async function endEnvironmentPublications(
  db: Db,
  environmentId: string,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const ended = await db
    .updateTable("app.environment_publications")
    .set({
      status: "unpublished",
      status_changed_at: now,
      ended_at: now,
      end_reason: "environment_wound_down",
    })
    .where("environment_id", "=", environmentId)
    .where("status", "in", [...livePublicationStatuses])
    .returning(["id", "object_id"])
    .execute();

  for (const row of ended) {
    events.record(publicationEnded, {
      resourceId: row.id,
      payload: {
        objectId: row.object_id,
        environmentId,
        reason: "environment_wound_down",
      },
    });
  }
}

/** The object's current visibility to friends (PS-OBJ-020). */
export interface FriendPublicationRecord {
  readonly id: string;
  readonly objectId: string;
  readonly publishedByUserId: string;
  readonly publishedAt: Date;
}

/**
 * The object's current friend publication, or null while it is not visible
 * to friends. Commands lock the object first, then this row.
 */
export async function findFriendPublication(
  db: Db,
  objectId: string,
  options: { lock?: boolean } = {},
): Promise<FriendPublicationRecord | null> {
  let query = db
    .selectFrom("app.object_friend_publications")
    .select(["id", "object_id", "published_by_user_id", "published_at"])
    .where("object_id", "=", objectId)
    .where("withdrawn_at", "is", null);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row
    ? {
        id: row.id,
        objectId: row.object_id,
        publishedByUserId: row.published_by_user_id,
        publishedAt: row.published_at,
      }
    : null;
}

/**
 * Takes the object back from friends. In the same transaction the database
 * ends its open direct requests neutrally (PS-OBJ-020, PS-LOAN-002).
 */
export async function endFriendPublication(
  db: Db,
  publicationId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await db
    .updateTable("app.object_friend_publications")
    .set({ withdrawn_at: now, withdrawn_by_user_id: userId })
    .where("id", "=", publicationId)
    .where("withdrawn_at", "is", null)
    .execute();
}

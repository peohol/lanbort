import type {
  PublicationEndReason,
  PublicationStatus,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Expression, type Kysely, type RawBuilder, sql } from "kysely";
import { toPosition } from "../environment/privacy";
import type { EventRecorder } from "../events/recorder";
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

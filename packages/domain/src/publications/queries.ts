import {
  type EnvironmentObjectList,
  type EnvironmentPublicationList,
  environmentObjectsQuerySchema,
  environmentPublicationsQuerySchema,
  type ObjectPublicationList,
  objectIdSchema,
  type PublicationEndReason,
  type PublicationStatus,
  publicationPageSize,
  publishedObjectImageSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import type { Actor } from "../actor";
import type { DomainContext } from "../commands/command";
import { defineQuery, executeQuery } from "../commands/query";
import {
  acceptsNewActivity,
  activeFrom,
  type EnvironmentAccess,
} from "../environment/model";
import {
  mayExposeHistory,
  type PositionSpan,
  toOptionalPosition,
  toPosition,
  widenedAfterCreation,
} from "../environment/privacy";
import { loadEnvironmentAccess, loadUserAccess } from "../environment/store";
import {
  concealedHistory,
  createdOutside,
  typeHistories,
} from "../environment/type-change-store";
import { DomainError } from "../errors";
import {
  calendarDate,
  deriveAvailability,
  toApiInterval,
} from "../objects/availability";
import { loadAvailabilityBlocks } from "../objects/blocks";
import { objectImageKey, type ObjectImageStore } from "../objects/images";
import {
  inSnapshot,
  loadAvailability,
  loadImages,
  loadObjectState,
  type ObjectImageRow,
} from "../objects/state";
import {
  listEnvironmentObjectsPolicy,
  listEnvironmentPublicationsPolicy,
  listObjectPublicationsPolicy,
  readPublishedImagePolicy,
} from "./policies";
import { ownerHasAccess } from "./store";

type Db = Kysely<Database>;

function viewerIdOf(actor: Actor): string | null {
  return actor.kind === "user" ? actor.userId : null;
}

/**
 * The publications an active member finds in the environment (PS-OBJ-006,
 * PS-OBJ-009, PS-USR-006). Only active publications of active, unfrozen
 * objects that an owner still has active access behind and no steward has
 * blocked (WP-52), and never an object whose owner and the viewer have
 * blocked each other. Nor one published
 * under a stricter type than the environment has had since, unless the
 * viewer was already active then (PS-ENV-009, `concealed`). This is the one
 * place discovery is decided.
 */
function discoverablePublications(
  db: Db,
  environmentId: string,
  viewerId: string,
  concealed: readonly PositionSpan[],
  now: Date,
) {
  return db
    .selectFrom("app.environment_publications as publication")
    .innerJoin("app.objects as object", "object.id", "publication.object_id")
    .where("publication.environment_id", "=", environmentId)
    .where("publication.status", "=", "active")
    .where(createdOutside(sql.ref("publication.position"), concealed))
    .where("object.status", "=", "active")
    .where(sql<boolean>`not app.object_platform_blocked(publication.object_id)`)
    .where(
      ownerHasAccess(
        sql.ref("publication.object_id"),
        sql.ref("publication.environment_id"),
        now,
      ),
    )
    .where(
      sql<boolean>`not exists (
        select 1 from app.object_freezes as open_freeze
        where open_freeze.object_id = publication.object_id and open_freeze.ended_at is null
      )`,
    )
    .where(
      sql<boolean>`not exists (
        select 1
        from app.object_owners as blocked_owner
        join app.user_blocks as block
          on block.lifted_at is null
          and ((block.blocker_id = blocked_owner.user_id and block.blocked_id = ${viewerId})
            or (block.blocker_id = ${viewerId} and block.blocked_id = blocked_owner.user_id))
        where blocked_owner.object_id = publication.object_id
      )`,
    );
}

/** Rows after the cursor, newest first. */
function afterCursor(cursor: string | undefined) {
  return cursor === undefined
    ? sql<boolean>`true`
    : sql<boolean>`(publication.created_at, publication.id) < (
        select created_at, id from app.environment_publications where id = ${cursor}
      )`;
}

/** One page, and the cursor for the next one. */
function page<T extends { id: string }>(rows: readonly T[]) {
  const items = rows.slice(0, publicationPageSize);

  return {
    items,
    nextCursor:
      rows.length > publicationPageSize ? (items.at(-1)?.id ?? null) : null,
  };
}

export interface ContentRow {
  readonly object_id: string;
  readonly title: string;
  readonly category_id: string;
  readonly description: string;
  readonly loan_terms: string | null;
}

/** The object's global content as it is shown through a publication. */
export function presentContent(
  row: ContentRow,
  images: ReadonlyMap<string, readonly ObjectImageRow[]>,
) {
  return {
    title: row.title,
    categoryId: row.category_id,
    description: row.description,
    loanTerms: row.loan_terms,
    images: (images.get(row.object_id) ?? []).map(({ id, width, height }) => ({
      id,
      width,
      height,
    })),
  };
}

/**
 * The object's publications as its owners see them: the latest one per
 * environment. A co-owner learns that the object is published somewhere,
 * but the environment and who published it only where they can see it
 * themselves: an open environment, or one they are a member of (vision:
 * «Medeierskap ved deaktivering, publisering og uttreden»), and not where it
 * was published under a stricter type before they became active there.
 */
export const listObjectPublications = defineQuery({
  name: "environment_publication.list_for_object",
  input: z.strictObject({ objectId: objectIdSchema }),
  policy: listObjectPublicationsPolicy,
  load: ({ db, actor, input }) =>
    inSnapshot(db, async (tx) => {
      const object = await loadObjectState(tx, input.objectId);

      if (!object) {
        return null;
      }

      const rows = await tx
        .selectFrom("app.environment_publications as publication")
        .innerJoin(
          "app.environments as environment",
          "environment.id",
          "publication.environment_id",
        )
        .leftJoin("app.environment_memberships as membership", (join) =>
          join
            .onRef(
              "membership.environment_id",
              "=",
              "publication.environment_id",
            )
            .on("membership.user_id", "=", viewerIdOf(actor))
            .on("membership.state", "in", ["active", "passive"]),
        )
        .distinctOn("publication.environment_id")
        .select([
          "publication.id",
          "publication.environment_id",
          "publication.published_by_user_id",
          "publication.status",
          "publication.end_reason",
          "publication.created_at",
          "publication.status_changed_at",
          "environment.type",
          "environment.name",
          "membership.id as membership_id",
          "membership.state as membership_state",
          "membership.activated_position as membership_activated_position",
          "publication.position",
        ])
        .where("publication.object_id", "=", object.objectId)
        .orderBy("publication.environment_id")
        .orderBy("publication.created_at", "desc")
        .orderBy("publication.id", "desc")
        .execute();
      const histories = await typeHistories(
        tx,
        rows.map((row) => row.environment_id),
      );
      const viewerId = viewerIdOf(actor);
      const located = rows.map((row) => ({
        ...row,
        visible:
          (row.type === "open" || row.membership_id !== null) &&
          // PS-ENV-009: where the object was published under a stricter
          // type stays with those who were there, and with its publisher.
          (row.published_by_user_id === viewerId ||
            mayExposeHistory(
              widenedAfterCreation(
                histories.get(row.environment_id) ?? [],
                toPosition(row.position),
              ),
              row.membership_state === "active"
                ? toOptionalPosition(row.membership_activated_position)
                : null,
            )),
      }));

      return { resource: { ...object, rows: located }, context: undefined };
    }),
  present: ({ resource }): ObjectPublicationList => ({
    publications: [...resource.rows]
      .sort(
        (a, b) =>
          b.created_at.getTime() - a.created_at.getTime() ||
          (a.id < b.id ? 1 : -1),
      )
      .map((row) => {
        const { visible } = row;

        return {
          id: row.id,
          status: row.status as PublicationStatus,
          endReason: row.end_reason as PublicationEndReason | null,
          environment: visible
            ? {
                id: row.environment_id,
                type: row.type as "open" | "closed" | "hidden",
                name: row.name,
              }
            : null,
          publishedByUserId: visible ? row.published_by_user_id : null,
          createdAt: row.created_at.toISOString(),
          statusChangedAt: row.status_changed_at.toISOString(),
        };
      }),
  }),
});

/**
 * Publications for the environment's administrators to review (PS-ENV-011):
 * pending, active, rejected and blocked ones, with the object's global
 * content. Administrators see who published, a member of their environment.
 * Like members, they never see what was published under a stricter type
 * before they became active (PS-ENV-009).
 */
export const listEnvironmentPublications = defineQuery({
  name: "environment_publication.list_for_environment",
  input: environmentPublicationsQuerySchema,
  policy: listEnvironmentPublicationsPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const access = await loadEnvironmentAccess(
        tx,
        input.environmentId,
        actor,
        now,
      );

      if (!access) {
        return null;
      }

      // Nothing is read for callers the policy will turn away.
      const rows = access.viewer.roles.includes("administrator")
        ? await tx
            .selectFrom("app.environment_publications as publication")
            .innerJoin(
              "app.objects as object",
              "object.id",
              "publication.object_id",
            )
            .select([
              "publication.id",
              "publication.object_id",
              "publication.status",
              "publication.published_by_user_id",
              "publication.created_at",
              "publication.status_changed_at",
              "object.title",
              "object.category_id",
              "object.description",
              "object.loan_terms",
            ])
            .where("publication.environment_id", "=", access.environment.id)
            .where(
              createdOutside(
                sql.ref("publication.position"),
                await concealedFrom(tx, access),
              ),
            )
            .where(
              "publication.status",
              "in",
              input.status
                ? [input.status]
                : ["pending", "active", "rejected", "blocked"],
            )
            .where(afterCursor(input.cursor))
            .orderBy("publication.created_at", "desc")
            .orderBy("publication.id", "desc")
            .limit(publicationPageSize + 1)
            .execute()
        : [];
      const { items, nextCursor } = page(rows);
      const images = await loadImages(
        tx,
        items.map((row) => row.object_id),
      );

      return {
        resource: { ...access, items, nextCursor, images },
        context: undefined,
      };
    }),
  present: ({ resource }): EnvironmentPublicationList => ({
    publications: resource.items.map((row) => ({
      id: row.id,
      objectId: row.object_id,
      status: row.status as PublicationStatus,
      publishedByUserId: row.published_by_user_id,
      createdAt: row.created_at.toISOString(),
      statusChangedAt: row.status_changed_at.toISOString(),
      object: presentContent(row, resource.images),
    })),
    nextCursor: resource.nextCursor,
  }),
});

/** What the caller may not see of the environment's history (PS-ENV-009). */
const concealedFrom = (db: Db, access: EnvironmentAccess) =>
  concealedHistory(db, access.environment.id, activeFrom(access.ownMembership));

/** An active member may discover objects only while the environment is active. */
const discovers = (access: EnvironmentAccess) =>
  access.viewer.membership?.state === "active" &&
  acceptsNewActivity(access.environment);

/**
 * The objects an active member finds in the environment, newest publication
 * first. The owners are not named, and actual availability is derived from
 * the object's global truth without saying what blocks it (UX-05).
 */
export const listEnvironmentObjects = defineQuery({
  name: "environment_object.list",
  input: environmentObjectsQuerySchema,
  policy: listEnvironmentObjectsPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const access = await loadEnvironmentAccess(
        tx,
        input.environmentId,
        actor,
        now,
      );
      const viewerId = viewerIdOf(actor);

      if (!access) {
        return null;
      }

      const rows =
        viewerId && discovers(access)
          ? await discoverablePublications(
              tx,
              access.environment.id,
              viewerId,
              await concealedFrom(tx, access),
              now,
            )
              .select([
                "publication.id",
                "publication.object_id",
                "object.title",
                "object.category_id",
                "object.description",
                "object.loan_terms",
                sql<boolean>`exists (
                  select 1 from app.object_owners
                  where object_id = publication.object_id and user_id = ${viewerId}
                )`.as("owned_by_you"),
              ])
              .where(afterCursor(input.cursor))
              .orderBy("publication.created_at", "desc")
              .orderBy("publication.id", "desc")
              .limit(publicationPageSize + 1)
              .execute()
          : [];
      const { items, nextCursor } = page(rows);
      const ids = items.map((row) => row.object_id);
      // One connection serves the snapshot, so these run one after another.
      const images = await loadImages(tx, ids);
      const availability = await loadAvailability(tx, ids);
      const blocks = await loadAvailabilityBlocks(tx, ids);

      return {
        resource: {
          ...access,
          items,
          nextCursor,
          images,
          availability,
          blocks,
        },
        context: undefined,
      };
    }),
  present: ({ resource, now }): EnvironmentObjectList => ({
    objects: resource.items.map((row) => {
      const derived = deriveAvailability({
        status: "active",
        availability: resource.availability.get(row.object_id) ?? [],
        blocks: resource.blocks.get(row.object_id) ?? [],
        today: calendarDate(now),
      });

      return {
        publicationId: row.id,
        objectId: row.object_id,
        ...presentContent(row, resource.images),
        effectiveAvailability: derived.effective.map(toApiInterval),
        availableForNewLoans: derived.availableForNewLoans,
        ownedByYou: row.owned_by_you,
      };
    }),
    nextCursor: resource.nextCursor,
  }),
});

/**
 * The publication through which the viewer finds each of the objects in the
 * environment now, by the same rule as the list (PS-OBJ-006, PS-ENV-009).
 * Objects the viewer does not find there are left out.
 */
export async function findPublications(
  db: Db,
  access: EnvironmentAccess,
  objectIds: readonly string[],
  viewerId: string,
  now: Date,
): Promise<Map<string, string>> {
  if (!discovers(access) || objectIds.length === 0) {
    return new Map();
  }

  const rows = await discoverablePublications(
    db,
    access.environment.id,
    viewerId,
    await concealedFrom(db, access),
    now,
  )
    .select(["publication.id", "publication.object_id"])
    .where("publication.object_id", "in", [...objectIds])
    .execute();

  return new Map(rows.map((row) => [row.object_id, row.id]));
}

/**
 * Whether the viewer finds the object in the environment now. Phase 3 uses
 * it before a loan request is made through the environment.
 */
export async function findsObject(
  db: Db,
  access: EnvironmentAccess,
  objectId: string,
  viewerId: string,
  now: Date,
): Promise<boolean> {
  return (await findPublications(db, access, [objectId], viewerId, now)).has(
    objectId,
  );
}

/** One place a user finds an object. */
export interface FoundPublication {
  readonly environmentId: string;
  readonly publicationId: string;
}

/**
 * Every environment in which the user finds each of the objects now, by the
 * rule above. This is what seeing an object means for someone who does not
 * own it, so whatever follows an object outside its environments (such as a
 * subscription, PS-OBJ-014) asks this, not the access it once had.
 */
export async function whereUserFinds(
  db: Db,
  userId: string,
  objectIds: readonly string[],
  now: Date,
): Promise<Map<string, FoundPublication[]>> {
  const found = new Map<string, FoundPublication[]>();

  if (objectIds.length === 0) {
    return found;
  }

  // Only the user's own environments can have a publication they find.
  const environments = await db
    .selectFrom("app.environment_publications as publication")
    .innerJoin("app.environment_memberships as membership", (join) =>
      join
        .onRef("membership.environment_id", "=", "publication.environment_id")
        .on("membership.user_id", "=", userId)
        .on("membership.state", "=", "active"),
    )
    .select("publication.environment_id")
    .distinct()
    .where("publication.object_id", "in", [...objectIds])
    .where("publication.status", "=", "active")
    .orderBy("publication.environment_id")
    .execute();

  // One after another: the caller may hold a single connection.
  for (const { environment_id: environmentId } of environments) {
    const access = await loadUserAccess(db, environmentId, userId, now);
    const publications = access
      ? await findPublications(db, access, objectIds, userId, now)
      : new Map<string, string>();

    for (const [objectId, publicationId] of publications) {
      found.set(objectId, [
        ...(found.get(objectId) ?? []),
        { environmentId, publicationId },
      ]);
    }
  }

  return found;
}

/** Authorizes reading an image through a publication. */
const publishedImageFile = defineQuery({
  name: "environment_object.read_image",
  input: publishedObjectImageSchema,
  policy: readPublishedImagePolicy,
  load: async ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const access = await loadEnvironmentAccess(
        tx,
        input.environmentId,
        actor,
        now,
      );
      const image =
        access &&
        (await tx
          .selectFrom("app.object_images")
          .select(["id", "content_type"])
          .where("id", "=", input.imageId)
          .where("object_id", "=", input.objectId)
          .executeTakeFirst());
      const viewerId = viewerIdOf(actor);

      if (!access || !image || !viewerId) {
        return null;
      }

      const concealed = await concealedFrom(tx, access);
      const discoverable = await findsObject(
        tx,
        access,
        input.objectId,
        viewerId,
        now,
      );
      const underReview =
        (await tx
          .selectFrom("app.environment_publications")
          .select("id")
          .where("environment_id", "=", access.environment.id)
          .where("object_id", "=", input.objectId)
          .where("status", "<>", "unpublished")
          .where(createdOutside(sql.ref("position"), concealed))
          .executeTakeFirst()) !== undefined;

      return {
        resource: {
          access,
          discoverable,
          underReview,
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

/** An object's image, for those who find or review it in the environment. */
export async function readPublishedObjectImage(
  domain: Pick<DomainContext, "db" | "clock">,
  store: ObjectImageStore,
  request: { actor: Actor; input: unknown },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const file = await executeQuery(domain, publishedImageFile, request);
  const bytes = await store.get(file.key);

  if (!bytes) {
    throw new DomainError("not_found", "Image file is missing");
  }

  return { bytes, contentType: file.contentType };
}

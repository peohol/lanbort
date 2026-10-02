import type { ObjectStatus, OwnObject } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Updateable } from "kysely";
import type { Actor } from "../actor";
import { DomainError } from "../errors";
import {
  type AvailabilityBlock,
  calendarDate,
  type DateInterval,
  deriveAvailability,
  toApiInterval,
} from "./availability";
import { loadAvailabilityBlocks } from "./blocks";
import type { ObjectResource } from "./policies";

/** The object's own row and current owners, as policies and commands see it. */
export interface ObjectState extends ObjectResource {
  readonly title: string;
  readonly categoryId: string;
  readonly description: string;
  readonly loanTerms: string | null;
  readonly status: ObjectStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ObjectImageRow {
  readonly id: string;
  readonly position: number;
  readonly width: number;
  readonly height: number;
}

/** An object with everything its owners see. */
export interface ObjectDetails extends ObjectState {
  readonly availability: readonly DateInterval[];
  readonly images: readonly ObjectImageRow[];
  readonly blocks: readonly AvailabilityBlock[];
}

/** The acting user; object commands only ever run for signed-in users. */
export function actingUserId(actor: Actor): string {
  if (actor.kind !== "user") {
    throw new Error("Object commands require a user actor");
  }

  return actor.userId;
}

const objectColumns = [
  "id",
  "title",
  "category_id",
  "description",
  "loan_terms",
  "status",
  "version",
  "created_at",
  "updated_at",
] as const;

async function ownersOf(
  db: Kysely<Database>,
  objectIds: readonly string[],
): Promise<Map<string, string[]>> {
  const owners = new Map<string, string[]>(objectIds.map((id) => [id, []]));

  if (objectIds.length > 0) {
    const rows = await db
      .selectFrom("app.object_owners")
      .select(["object_id", "user_id"])
      .where("object_id", "in", objectIds)
      .execute();

    for (const row of rows) owners.get(row.object_id)?.push(row.user_id);
  }

  return owners;
}

function toState(
  row: {
    id: string;
    title: string;
    category_id: string;
    description: string;
    loan_terms: string | null;
    status: string;
    version: number;
    created_at: Date;
    updated_at: Date;
  },
  ownerIds: readonly string[],
): ObjectState {
  return {
    objectId: row.id,
    ownerIds,
    title: row.title,
    categoryId: row.category_id,
    description: row.description,
    loanTerms: row.loan_terms,
    status: row.status as ObjectStatus,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Loads one object and its owners, or null if it does not exist. With
 * `lock`, the object row stays locked for the rest of the transaction, so
 * concurrent changes to the same object are serialized and each one sees the
 * version the previous one committed.
 */
export async function loadObjectState(
  db: Kysely<Database>,
  objectId: string,
  options: { lock?: boolean } = {},
): Promise<ObjectState | null> {
  let query = db
    .selectFrom("app.objects")
    .select(objectColumns)
    .where("id", "=", objectId);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    return null;
  }

  const owners = await ownersOf(db, [row.id]);

  return toState(row, owners.get(row.id) ?? []);
}

/** Stored general availability per object, sorted. */
export async function loadAvailability(
  db: Kysely<Database>,
  objectIds: readonly string[],
): Promise<Map<string, DateInterval[]>> {
  const availability = new Map<string, DateInterval[]>(
    objectIds.map((id) => [id, []]),
  );

  if (objectIds.length > 0) {
    const rows = await db
      .selectFrom("app.object_availability_intervals")
      .select([
        "object_id",
        sql<string>`lower(period)::text`.as("from"),
        sql<string | null>`upper(period)::text`.as("until"),
      ])
      .where("object_id", "in", objectIds)
      .orderBy("object_id")
      .orderBy(sql`lower(period)`)
      .execute();

    for (const row of rows) {
      availability
        .get(row.object_id)
        ?.push({ from: row.from, until: row.until });
    }
  }

  return availability;
}

async function loadImages(
  db: Kysely<Database>,
  objectIds: readonly string[],
): Promise<Map<string, ObjectImageRow[]>> {
  const images = new Map<string, ObjectImageRow[]>(
    objectIds.map((id) => [id, []]),
  );

  if (objectIds.length > 0) {
    const rows = await db
      .selectFrom("app.object_images")
      .select(["object_id", "id", "position", "width", "height"])
      .where("object_id", "in", objectIds)
      .orderBy("object_id")
      .orderBy("position")
      .execute();

    for (const { object_id, ...image } of rows) {
      images.get(object_id)?.push(image);
    }
  }

  return images;
}

/** Everything the owners see, for the given objects in the given order. */
async function loadDetails(
  db: Kysely<Database>,
  states: readonly ObjectState[],
): Promise<ObjectDetails[]> {
  const ids = states.map((state) => state.objectId);
  const [availability, images, blocks] = await Promise.all([
    loadAvailability(db, ids),
    loadImages(db, ids),
    loadAvailabilityBlocks(db, ids),
  ]);

  return states.map((state) => ({
    ...state,
    availability: availability.get(state.objectId) ?? [],
    images: images.get(state.objectId) ?? [],
    blocks: blocks.get(state.objectId) ?? [],
  }));
}

export async function loadObjectDetails(
  db: Kysely<Database>,
  objectId: string,
): Promise<ObjectDetails | null> {
  const state = await loadObjectState(db, objectId);

  return state ? ((await loadDetails(db, [state]))[0] ?? null) : null;
}

/** Every object the user owns, newest first. */
export async function loadOwnedObjectDetails(
  db: Kysely<Database>,
  userId: string,
): Promise<ObjectDetails[]> {
  const rows = await db
    .selectFrom("app.objects as object")
    .innerJoin("app.object_owners as owner", "owner.object_id", "object.id")
    .select(objectColumns.map((column) => `object.${column}` as const))
    .where("owner.user_id", "=", userId)
    .orderBy("object.created_at", "desc")
    .orderBy("object.id")
    .execute();
  const owners = await ownersOf(
    db,
    rows.map((row) => row.id),
  );

  return loadDetails(
    db,
    rows.map((row) => toState(row, owners.get(row.id) ?? [])),
  );
}

/** A category that can be chosen for an object now. */
export async function requireSelectableCategory(
  db: Kysely<Database>,
  categoryId: string,
): Promise<void> {
  const category = await db
    .selectFrom("app.object_categories")
    .select("id")
    .where("id", "=", categoryId)
    .where("retired_at", "is", null)
    .executeTakeFirst();

  if (!category) {
    throw new DomainError("invalid_input", "Unknown category", ["categoryId"]);
  }
}

/** Every change moves the object to a new version. */
export async function bumpVersion(
  db: Kysely<Database>,
  state: ObjectState,
  now: Date,
  changes: Updateable<Database["app.objects"]> = {},
): Promise<number> {
  const { version } = await db
    .updateTable("app.objects")
    .set({ ...changes, version: state.version + 1, updated_at: now })
    .where("id", "=", state.objectId)
    .returning("version")
    .executeTakeFirstOrThrow();

  return version;
}

/** The owners' view of an object, with actual availability derived now. */
export function presentOwnObject(details: ObjectDetails, now: Date): OwnObject {
  const derived = deriveAvailability({
    status: details.status,
    availability: details.availability,
    blocks: details.blocks,
    today: calendarDate(now),
  });

  return {
    id: details.objectId,
    title: details.title,
    categoryId: details.categoryId,
    description: details.description,
    loanTerms: details.loanTerms,
    status: details.status,
    version: details.version,
    availability: details.availability.map(toApiInterval),
    effectiveAvailability: derived.effective.map(toApiInterval),
    availableForNewLoans: derived.availableForNewLoans,
    images: details.images.map(({ id, width, height }) => ({
      id,
      width,
      height,
    })),
    createdAt: details.createdAt.toISOString(),
    updatedAt: details.updatedAt.toISOString(),
  };
}

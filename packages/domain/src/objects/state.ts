import type { ObjectStatus, OwnObject } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Updateable } from "kysely";
import { lockAccounts } from "../account/store";
import type { Actor } from "../actor";
import { DomainError } from "../errors";
import {
  type AvailabilityBlock,
  calendarDate,
  type DateInterval,
  deriveAvailability,
  toApiInterval,
} from "./availability";
import {
  type AvailabilityBlockSource,
  availabilityBlockSources,
  loadAvailabilityBlocks,
} from "./blocks";
import { returnPhaseStatuses } from "../loans/model";
import { loadFreezes } from "./co-owner-blocks";
import type { ObjectResource } from "./policies";
import { type RevisionNote, recordRevision } from "./revisions";

export interface ObjectOwnerRow {
  readonly userId: string;
  readonly since: Date;
}

/** The object's own row and current owners, as policies and commands see it. */
export interface ObjectState extends ObjectResource {
  /** In the order they became owners. */
  readonly owners: readonly ObjectOwnerRow[];
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

export interface ObjectRestrictionRow {
  readonly id: string;
  readonly setByUserId: string;
  /** Null restricts every date. */
  readonly period: DateInterval | null;
  readonly createdAt: Date;
}

export interface PendingInvitationRow {
  readonly id: string;
  readonly userId: string;
  readonly invitedByUserId: string;
  readonly createdAt: Date;
}

/** How the object's owners currently share it (PS-OBJ-007–011). */
export interface CoOwnershipDetails {
  readonly restrictions: readonly ObjectRestrictionRow[];
  readonly frozen: boolean;
  readonly deletionConsents: readonly string[];
  readonly pendingInvitations: readonly PendingInvitationRow[];
}

/** An object with everything its owners see. */
export interface ObjectDetails extends ObjectState, CoOwnershipDetails {
  readonly availability: readonly DateInterval[];
  readonly images: readonly ObjectImageRow[];
  readonly blocks: readonly AvailabilityBlock[];
  /** Handed over in a loan that has not ended. */
  readonly lentOut: boolean;
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

/** Rows per object id, in query order; every id gets an entry. */
function groupByObject<Row extends { object_id: string }, T>(
  objectIds: readonly string[],
  rows: readonly Row[],
  map: (row: Row) => T,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>(objectIds.map((id) => [id, []]));

  for (const row of rows) grouped.get(row.object_id)?.push(map(row));

  return grouped;
}

async function ownersOf(
  db: Kysely<Database>,
  objectIds: readonly string[],
): Promise<Map<string, ObjectOwnerRow[]>> {
  const rows =
    objectIds.length === 0
      ? []
      : await db
          .selectFrom("app.object_owners")
          .select(["object_id", "user_id", "added_at"])
          .where("object_id", "in", objectIds)
          .orderBy("added_at")
          .orderBy("user_id")
          .execute();

  return groupByObject(objectIds, rows, (row) => ({
    userId: row.user_id,
    since: row.added_at,
  }));
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
  owners: readonly ObjectOwnerRow[],
): ObjectState {
  return {
    objectId: row.id,
    owners,
    ownerIds: owners.map((owner) => owner.userId),
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
  options: {
    lock?: boolean;
    /** With `lock`, further accounts to lock along with the owners'. */
    accounts?: readonly string[];
  } = {},
): Promise<ObjectState | null> {
  let query = db
    .selectFrom("app.objects")
    .select(objectColumns)
    .where("id", "=", objectId);

  if (options.lock) {
    // Accounts before the object (account/store.ts), so the owners' states
    // and those of `accounts` hold until commit.
    const owners = (await ownersOf(db, [objectId])).get(objectId) ?? [];
    await lockAccounts(db, [
      ...(options.accounts ?? []),
      ...owners.map((owner) => owner.userId),
    ]);
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  if (!row) {
    return null;
  }

  const owners = await ownersOf(db, [row.id]);

  return toState(row, owners.get(row.id) ?? []);
}

/** The object, locked for the rest of the command, as its policy resource. */
export async function loadLockedObject(
  db: Kysely<Database>,
  objectId: string,
): Promise<{ resource: ObjectState; context: undefined } | null> {
  const state = await loadObjectState(db, objectId, { lock: true });

  return state ? { resource: state, context: undefined } : null;
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

export async function loadImages(
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

/**
 * The objects that are out of their owners' hands: handed over in a loan
 * that has not ended (PS-LOAN-014–017).
 */
async function loadLentOut(
  db: Kysely<Database>,
  objectIds: readonly string[],
): Promise<Set<string>> {
  if (objectIds.length === 0) return new Set();

  const rows = await db
    .selectFrom("app.loans")
    .select("object_id")
    .distinct()
    .where("object_id", "in", objectIds)
    .where("status", "in", returnPhaseStatuses)
    .execute();

  return new Set(rows.flatMap((row) => row.object_id ?? []));
}

/** Restrictions in force, oldest first. */
async function loadRestrictions(
  db: Kysely<Database>,
  objectIds: readonly string[],
): Promise<Map<string, ObjectRestrictionRow[]>> {
  const rows =
    objectIds.length === 0
      ? []
      : await db
          .selectFrom("app.object_restrictions")
          .select([
            "object_id",
            "id",
            "set_by_user_id",
            "created_at",
            sql<boolean>`period is null`.as("all_dates"),
            sql<string | null>`lower(period)::text`.as("from"),
            sql<string | null>`upper(period)::text`.as("until"),
          ])
          .where("object_id", "in", objectIds)
          .where("lifted_at", "is", null)
          .orderBy("created_at")
          .orderBy("id")
          .execute();

  return groupByObject(objectIds, rows, (row) => ({
    id: row.id,
    setByUserId: row.set_by_user_id,
    period: row.all_dates ? null : { from: row.from, until: row.until },
    createdAt: row.created_at,
  }));
}

async function loadCoOwnership(
  db: Kysely<Database>,
  objectIds: readonly string[],
): Promise<(objectId: string) => CoOwnershipDetails> {
  const none = objectIds.length === 0;
  const restrictions = await loadRestrictions(db, objectIds);
  const freezes = await loadFreezes(db, objectIds);
  const consents = groupByObject(
    objectIds,
    none
      ? []
      : await db
          .selectFrom("app.object_deletion_consents")
          .select(["object_id", "user_id"])
          .where("object_id", "in", objectIds)
          .orderBy("consented_at")
          .orderBy("user_id")
          .execute(),
    (row) => row.user_id,
  );
  const invitations = groupByObject(
    objectIds,
    none
      ? []
      : await db
          .selectFrom("app.object_co_owner_invitations")
          .select([
            "object_id",
            "id",
            "invited_user_id",
            "invited_by_user_id",
            "created_at",
          ])
          .where("object_id", "in", objectIds)
          .where("status", "=", "pending")
          .orderBy("created_at")
          .orderBy("id")
          .execute(),
    (row) => ({
      id: row.id,
      userId: row.invited_user_id,
      invitedByUserId: row.invited_by_user_id,
      createdAt: row.created_at,
    }),
  );

  return (objectId) => ({
    restrictions: restrictions.get(objectId) ?? [],
    frozen: freezes.has(objectId),
    deletionConsents: consents.get(objectId) ?? [],
    pendingInvitations: invitations.get(objectId) ?? [],
  });
}

/** Everything the owners see, for the given objects in the given order. */
async function loadDetails(
  db: Kysely<Database>,
  states: readonly ObjectState[],
  sources: readonly AvailabilityBlockSource[],
): Promise<ObjectDetails[]> {
  const ids = states.map((state) => state.objectId);
  // One connection serves the snapshot, so these run one after another.
  const blocks = await loadAvailabilityBlocks(db, ids, sources);
  const availability = await loadAvailability(db, ids);
  const images = await loadImages(db, ids);
  const coOwnership = await loadCoOwnership(db, ids);
  const lentOut = await loadLentOut(db, ids);

  return states.map((state) => ({
    ...state,
    ...coOwnership(state.objectId),
    availability: availability.get(state.objectId) ?? [],
    images: images.get(state.objectId) ?? [],
    blocks: blocks.get(state.objectId) ?? [],
    lentOut: lentOut.has(state.objectId),
  }));
}

/**
 * Runs several reads against one snapshot, so an object and its child rows
 * always come from the same committed state, even while it is being edited.
 */
export function inSnapshot<T>(
  db: Kysely<Database>,
  read: (db: Kysely<Database>) => Promise<T>,
): Promise<T> {
  return db.isTransaction
    ? read(db)
    : db.transaction().setIsolationLevel("repeatable read").execute(read);
}

export function loadObjectDetails(
  db: Kysely<Database>,
  objectId: string,
  sources = availabilityBlockSources,
): Promise<ObjectDetails | null> {
  return inSnapshot(db, async (tx) => {
    const state = await loadObjectState(tx, objectId);

    return state
      ? ((await loadDetails(tx, [state], sources))[0] ?? null)
      : null;
  });
}

/** Every object the user owns, newest first. */
export function loadOwnedObjectDetails(
  db: Kysely<Database>,
  userId: string,
): Promise<ObjectDetails[]> {
  return inSnapshot(db, (tx) => loadOwnedDetails(tx, userId));
}

async function loadOwnedDetails(
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
    availabilityBlockSources,
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

/**
 * Every change moves the object to a new version and records the content it
 * led to (PS-OBJ-013). Call it after the change's child rows are written.
 */
export async function bumpVersion(
  db: Kysely<Database>,
  state: ObjectState,
  now: Date,
  note: RevisionNote,
  changes: Updateable<Database["app.objects"]> = {},
): Promise<number> {
  const { version } = await db
    .updateTable("app.objects")
    .set({ ...changes, version: state.version + 1, updated_at: now })
    .where("id", "=", state.objectId)
    .returning("version")
    .executeTakeFirstOrThrow();
  await recordRevision(db, state.objectId, note, now);

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
    owners: details.owners.map((owner) => ({
      userId: owner.userId,
      since: owner.since.toISOString(),
    })),
    restrictions: details.restrictions.map((restriction) => ({
      id: restriction.id,
      setByUserId: restriction.setByUserId,
      period: restriction.period && toApiInterval(restriction.period),
      createdAt: restriction.createdAt.toISOString(),
    })),
    frozenForNewLoans: details.frozen,
    lentOut: details.lentOut,
    deletionConsents: [...details.deletionConsents],
    pendingInvitations: details.pendingInvitations.map((invitation) => ({
      id: invitation.id,
      userId: invitation.userId,
      invitedByUserId: invitation.invitedByUserId,
      createdAt: invitation.createdAt.toISOString(),
    })),
    createdAt: details.createdAt.toISOString(),
    updatedAt: details.updatedAt.toISOString(),
  };
}

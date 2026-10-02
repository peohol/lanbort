import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { AvailabilityBlockSource } from "./blocks";

/** Every date: a block without start or end. */
const allDates = { from: null, until: null } as const;

/**
 * Objects frozen by a block between two of their co-owners (PS-OBJ-009), with
 * when the freeze started. A frozen object takes no new loans and must be
 * left out of ordinary discovery (WP-25) until its ownership is clarified to
 * one owner; lifting the block alone does not end it.
 */
export async function loadFreezes(
  db: Kysely<Database>,
  objectIds: readonly string[],
): Promise<Map<string, Date>> {
  if (objectIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom("app.object_freezes")
    .select(["object_id", "started_at"])
    .where("object_id", "in", objectIds)
    .where("ended_at", "is", null)
    .execute();

  return new Map(rows.map((row) => [row.object_id, row.started_at]));
}

/** A freeze blocks every date for new loans. */
export const coOwnerFreezeBlocks: AvailabilityBlockSource = {
  name: "co_owner_freeze",
  load: async (db, objectIds) =>
    [...(await loadFreezes(db, objectIds)).keys()].map((objectId) => ({
      objectId,
      period: allDates,
    })),
};

/**
 * A co-owner's restriction blocks its period for new loans, whatever the
 * general availability says, so another co-owner cannot reopen it by editing
 * availability (PS-OBJ-008).
 */
export const coOwnerRestrictionBlocks: AvailabilityBlockSource = {
  name: "co_owner_restrictions",
  load: async (db, objectIds) => {
    if (objectIds.length === 0) {
      return [];
    }

    const rows = await db
      .selectFrom("app.object_restrictions")
      .select([
        "object_id",
        sql<string | null>`lower(period)::text`.as("from"),
        sql<string | null>`upper(period)::text`.as("until"),
      ])
      .where("object_id", "in", objectIds)
      .where("lifted_at", "is", null)
      .execute();

    return rows.map((row) => ({
      objectId: row.object_id,
      period: { from: row.from, until: row.until },
    }));
  },
};

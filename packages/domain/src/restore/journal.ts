import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { z } from "zod";

/**
 * One event from the database that is being replaced, as a restore carries
 * it over to the restored copy (WP-72, docs/architecture/09 «Restore»).
 * Like the event itself it holds ids and codes only, never names, contact
 * details or free text, so the journal file is as minimal as the audit
 * events it is read from.
 */
export const restoreJournalEntrySchema = z.strictObject({
  id: z.uuid(),
  /** The event's place in the global order (`app.audit_events.position`). */
  position: z.string().regex(/^\d{1,19}$/),
  occurredAt: z.iso.datetime({ offset: true }),
  type: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  /** The user who acted, when a user did; null for a system process. */
  actorUserId: z.uuid().nullable(),
  payload: z.record(z.string(), z.unknown()),
  /**
   * Ids and dates the event does not carry but its re-application needs,
   * read from the replaced database at export (for example who blocked whom).
   */
  captured: z.record(z.string(), z.union([z.uuid(), z.iso.date()])).nullable(),
});

export type RestoreJournalEntry = z.infer<typeof restoreJournalEntrySchema>;

/** Reads the events of the given types since `since`, in their order. */
export async function readJournalEvents(
  db: Kysely<Database>,
  types: readonly string[],
  since: Date,
): Promise<RestoreJournalEntry[]> {
  const rows = await db
    .selectFrom("app.audit_events")
    .select([
      "id",
      "position",
      "occurred_at",
      "event_type",
      "resource_type",
      "resource_id",
      "actor_user_id",
      "payload",
    ])
    .where("occurred_at", ">=", since)
    .where("event_type", "in", [...types])
    .orderBy("position")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    position: String(row.position),
    occurredAt: row.occurred_at.toISOString(),
    type: row.event_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    actorUserId: row.actor_user_id,
    payload: row.payload as Record<string, unknown>,
    captured: null,
  }));
}

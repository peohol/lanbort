import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { z } from "zod";
import {
  type DomainContext,
  defineCommand,
  executeCommand,
} from "../commands/command";
import { isDomainError } from "../errors";
import {
  readJournalEvents,
  type RestoreJournalEntry,
  restoreJournalEntrySchema,
} from "./journal";
import { replayJournalEntryPolicy } from "./policies";
import { type RestoreReplay, restoreActor, restoreReplays } from "./replays";

const replayByType = new Map(
  restoreReplays.flatMap((replay) =>
    replay.events.map((event) => [event.type, replay] as const),
  ),
);

/** Every event type a journal carries: what is replayed and what settles it. */
export const journalEventTypes: readonly string[] = [
  ...new Set(
    restoreReplays.flatMap((replay) =>
      [...replay.events, ...(replay.settledBy ?? [])].map(
        (event) => event.type,
      ),
    ),
  ),
];

/**
 * Reads the journal from the database that is being replaced, from `since`
 * (the backup's time, with a margin: entries the backup already has are
 * skipped). Run it before an in-place restore overwrites that database.
 */
export async function exportRestoreJournal(
  db: Kysely<Database>,
  since: Date,
): Promise<RestoreJournalEntry[]> {
  const entries = await readJournalEvents(db, journalEventTypes, since);

  for (const [index, entry] of entries.entries()) {
    const capture = replayByType.get(entry.type)?.capture;

    if (capture) {
      entries[index] = { ...entry, captured: await capture(db, entry) };
    }
  }

  return entries;
}

export type ReplayOutcome =
  /** Re-applied to the restored copy. */
  | "applied"
  /** The restored copy already had it, or has nothing it concerns. */
  | "unchanged"
  /** The backup already has the event itself. */
  | "in_backup"
  /** A later entry lifted it again, or a stronger replay covers it. */
  | "settled"
  /** Only lifts or settles others. */
  | "not_replayed"
  /** Could not be re-applied safely; the restore must not open. */
  | "needs_handling";

export interface ReplayResult {
  readonly entryId: string;
  readonly type: string;
  readonly outcome: ReplayOutcome;
  /** Why it needs handling. Codes and ids only. */
  readonly reason?: string;
}

const subjectOf = (replay: RestoreReplay, entry: RestoreJournalEntry) =>
  (replay.subject ?? ((e: RestoreJournalEntry) => e.resourceId))(entry);

/** Whether a later entry for the same subject settles the entry at `index`. */
function isSettled(
  replay: RestoreReplay,
  entries: readonly RestoreJournalEntry[],
  index: number,
): boolean {
  const settling = new Set((replay.settledBy ?? []).map((event) => event.type));
  const subject = subjectOf(replay, entries[index] as RestoreJournalEntry);

  return entries
    .slice(index + 1)
    .some(
      (later) =>
        settling.has(later.type) && subjectOf(replay, later) === subject,
    );
}

/**
 * Re-applies one entry as the restore process, in its own transaction. The
 * entry's id is the idempotency key, so running the restore again after an
 * interruption returns the first result instead of applying it twice.
 */
export const replayJournalEntry = defineCommand({
  name: "restore.replay_entry",
  input: restoreJournalEntrySchema,
  output: z.strictObject({ outcome: z.enum(["applied", "unchanged"]) }),
  policy: replayJournalEntryPolicy,
  idempotency: "required",
  load: async ({ input }) => ({ resource: input, context: undefined }),
  execute: async ({ tx, input, events, now }) => {
    const replay = replayByType.get(input.type);

    return {
      outcome: replay
        ? await replay.replay({ tx, entry: input, events, now })
        : "unchanged",
    };
  },
});

/**
 * Brings the restored database up to the erasures and restrictions in the
 * journal (docs/architecture/09 «Restore», PS-NFR-014), in their original
 * order. An entry that cannot be re-applied safely is reported and the rest
 * go on; any other failure stops the restore.
 */
export async function replayRestoreJournal(
  domain: DomainContext,
  journal: readonly RestoreJournalEntry[],
): Promise<ReplayResult[]> {
  const entries = [...journal].sort((a, b) =>
    BigInt(a.position) < BigInt(b.position) ? -1 : 1,
  );
  const ids = entries.map((entry) => entry.id);
  const inBackup = new Set(
    ids.length === 0
      ? []
      : (
          await domain.db
            .selectFrom("app.audit_events")
            .select("id")
            .where("id", "in", ids)
            .execute()
        ).map((row) => row.id),
  );
  const results: ReplayResult[] = [];

  for (const [index, entry] of entries.entries()) {
    const replay = replayByType.get(entry.type);
    const result = (outcome: ReplayOutcome, reason?: string) =>
      results.push({
        entryId: entry.id,
        type: entry.type,
        outcome,
        ...(reason !== undefined && { reason }),
      });

    if (!replay) {
      result("not_replayed");
    } else if (inBackup.has(entry.id)) {
      result("in_backup");
    } else if (isSettled(replay, entries, index)) {
      result("settled");
    } else {
      try {
        const { output } = await executeCommand(domain, replayJournalEntry, {
          actor: restoreActor,
          input: entry,
          idempotencyKey: entry.id,
        });
        result(output.outcome);
      } catch (error) {
        if (!isDomainError(error)) {
          throw error;
        }

        result("needs_handling", `${error.code}: ${error.message}`);
      }
    }
  }

  return results;
}

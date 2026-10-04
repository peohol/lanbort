import { definePolicy } from "../authorization/policy";
import { requireSystemProcess } from "../authorization/rules";
import type { RestoreJournalEntry } from "./journal";

/**
 * The audited operational process that finishes a restore (WP-72,
 * `pnpm ops:restore`). Only it re-applies journal entries.
 */
export const restoreProcess = "ops.restore";

export const replayJournalEntryPolicy = definePolicy<RestoreJournalEntry, void>(
  {
    action: "restore.replay_entry",
    actor: [requireSystemProcess(restoreProcess)],
  },
);

export const restorePolicies = [replayJournalEntryPolicy];

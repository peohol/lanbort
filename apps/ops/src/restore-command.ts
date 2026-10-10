import { readdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { Database } from "@lanbort/database";
import {
  type DomainContext,
  executeCommand,
  purgeExpiredData,
  exportRestoreJournal,
  reconcileSearchIndex,
  type ReplayResult,
  replayRestoreJournal,
  type RestoreCheckResult,
  type RestoreJournalEntry,
  restartChatGroups,
  restoreActor,
  restoreJournalEntrySchema,
  retentionProcess,
  runRestoreChecks,
  searchIndexProcess,
  systemActor,
} from "@lanbort/domain";
import { type Kysely, sql } from "kysely";

export const usage = `Finishes a database restore before the service opens again
(WP-72, docs/implementation/backup-restore.md).

  pnpm ops:restore journal --since <time> --out <file>
      Against the database being replaced: writes what it erased or
      restricted since <time> (the backup's time, minus a margin).
  pnpm ops:restore finish --journal <file>
      Against the restored database: checks its migrations, re-applies the
      journal, rebuilds the search index, deletes what has passed its
      retention time and runs the checks. Repeatable.
  pnpm ops:restore verify
      Checks migrations and runs the checks only.

The journal holds ids and codes only. Exit code 0 means ready to open.
`;

export interface CommandOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly message: string;
}

/** Where the command reads and writes files; fakes in tests. */
export interface RestoreIo {
  readonly migrationsDir: URL;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  /** Milliseconds, for the report's timings. */
  clock?(): number;
}

export interface MigrationState {
  /** In the repository, not applied to the database. */
  readonly missing: readonly string[];
  /** Applied to the database, unknown to the repository. */
  readonly unknown: readonly string[];
}

/**
 * Compares the database's applied migrations with the repository's
 * (`supabase/migrations`, the authoritative schema history). A restored
 * database must be at the schema the code expects before anything runs.
 */
export async function checkMigrations(
  db: Kysely<Database>,
  migrationsDir: URL,
): Promise<MigrationState> {
  const files = (await readdir(migrationsDir))
    .map((name) => /^(\d{14})_.*\.sql$/.exec(name)?.[1])
    .filter((version): version is string => version !== undefined);
  const { rows } = await sql<{ version: string }>`
    select version from supabase_migrations.schema_migrations
  `.execute(db);
  const applied = new Set(rows.map((row) => row.version));

  return {
    missing: files.filter((version) => !applied.has(version)).sort(),
    unknown: [...applied].filter((version) => !files.includes(version)).sort(),
  };
}

function parseJournal(content: string): RestoreJournalEntry[] {
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => restoreJournalEntrySchema.parse(JSON.parse(line)));
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function migrationLines({ missing, unknown }: MigrationState): string[] {
  return [
    missing.length === 0 && unknown.length === 0
      ? "Migrations: in line with the repository."
      : `Migrations: ${missing.length} not applied (${missing.join(", ") || "-"}), ${unknown.length} unknown (${unknown.join(", ") || "-"}).`,
  ];
}

function replayLines(results: readonly ReplayResult[]): string[] {
  const counts = new Map<string, number>();

  for (const { outcome } of results) {
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  }

  return [
    `Journal: ${results.length} ${results.length === 1 ? "entry" : "entries"}${[...counts].map(([outcome, count]) => `, ${count} ${outcome}`).join("")}.`,
    ...results
      .filter((result) => result.outcome === "needs_handling")
      .map(
        (result) =>
          `  Needs handling: ${result.type} ${result.entryId} (${result.reason})`,
      ),
  ];
}

function checkLines(results: readonly RestoreCheckResult[]): string[] {
  return results.map((result) => {
    const found = Object.entries(result.findings)
      .filter(([, count]) => count > 0)
      .map(([where, count]) => `${where}: ${count}`)
      .join(", ");

    return `Check ${result.name}: ${result.passed ? "passed" : `failed (${found})`}.`;
  });
}

/**
 * The audited operational path that finishes a restore (WP-72): it changes
 * the restored database only through the domain's commands, as the system
 * process `ops.restore`, so every re-applied erasure is validated and
 * recorded like the original, and its side effects (removing sign-in
 * identities and image files, the search index) follow through the outbox.
 */
export async function runRestoreCommand(
  domain: DomainContext,
  argv: readonly string[],
  io: RestoreIo,
): Promise<CommandOutcome> {
  let parsed;

  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        since: { type: "string" },
        out: { type: "string" },
        journal: { type: "string" },
      },
    });
  } catch {
    return { exitCode: 2, message: usage };
  }

  const [action, ...rest] = parsed.positionals;
  const { since, out, journal } = parsed.values;
  const clock = io.clock ?? (() => Date.now());
  const started = clock();

  if (rest.length > 0) {
    return { exitCode: 2, message: usage };
  }

  if (
    action === "journal" &&
    since &&
    out &&
    !Number.isNaN(Date.parse(since))
  ) {
    const entries = await exportRestoreJournal(domain.db, new Date(since));
    await io.writeFile(
      out,
      entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""),
    );

    return {
      exitCode: 0,
      message: `Wrote ${entries.length} journal entries since ${new Date(since).toISOString()} to ${out}.`,
    };
  }

  if (!(action === "verify" || (action === "finish" && journal))) {
    return { exitCode: 2, message: usage };
  }

  const migrations = await checkMigrations(domain.db, io.migrationsDir);
  const lines = migrationLines(migrations);

  if (migrations.missing.length > 0 || migrations.unknown.length > 0) {
    return {
      exitCode: 1,
      message: [
        ...lines,
        "Not ready: bring the schema in line before anything else runs.",
      ].join("\n"),
    };
  }

  let ready = true;

  if (action === "finish") {
    const results = await replayRestoreJournal(
      domain,
      parseJournal(await io.readFile(journal as string)),
    );
    lines.push(...replayLines(results));
    ready = results.every((result) => result.outcome !== "needs_handling");

    // The derived index is rebuilt from the authoritative tables (ADR-0005),
    // as the scheduled reconcile job does.
    const { output } = await executeCommand(domain, reconcileSearchIndex, {
      actor: systemActor(searchIndexProcess),
      input: {},
    });
    lines.push(`Search index: rebuilt, ${output.changed} rows changed.`);

    // Devices may be epochs ahead of the restored server (ADR-0010 §9).
    const chat = await executeCommand(domain, restartChatGroups, {
      actor: restoreActor,
      input: {},
    });
    lines.push(
      `Chat: ${chat.output.conversations} conversations start new groups.`,
    );

    // A backup holds what has since passed its retention time (OD-0002).
    const purged = await executeCommand(domain, purgeExpiredData, {
      actor: systemActor(retentionProcess),
      input: {},
    });
    const expired = Object.values(purged.output).reduce((a, b) => a + b, 0);
    lines.push(`Retention: ${expired} expired rows deleted.`);
  }

  const checks = await runRestoreChecks(domain.db);
  lines.push(...checkLines(checks));
  ready &&= checks.every((check) => check.passed);
  lines.push(
    `${ready ? "Ready to open" : "Not ready to open"} (${seconds(clock() - started)}).`,
  );

  return { exitCode: ready ? 0 : 1, message: lines.join("\n") };
}

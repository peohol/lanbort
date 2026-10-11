import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { CommandOutcome } from "./outcome";
import { checkMigrations, type MigrationState } from "./restore-command";

export const usage = `Holds a production deploy until the database has every migration
the code was built with (docs/implementation/local-development.md).

  pnpm ops:migrations
      Only in a Vercel production build (VERCEL_ENV=production); elsewhere it
      does nothing. Waits until no migration in supabase/migrations is
      missing from the database, and fails the build if one still is.
  pnpm ops:migrations --now
      Checks once, wherever it runs.
`;

export interface MigrationWait {
  readonly migrationsDir: URL;
  /** How long to wait for migrate before failing. */
  readonly timeoutMs: number;
  readonly intervalMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (line: string) => void;
}

const versions = (list: readonly string[]) => list.join(", ");

function waiting({ missing }: MigrationState): string {
  return `Waiting for the "Supabase production" migrate action: ${missing.length} not applied (${versions(missing)}).`;
}

/**
 * Checks the database's migrations against the repository's until none is
 * missing or the time is up. Code that expects a schema the database does
 * not have never goes live: the build fails and the previous deploy keeps
 * serving. Migrations the repository does not know (a later deploy, rolled
 * back) only warn, since older code runs on a newer schema.
 */
export async function waitForMigrations(
  db: Kysely<Database>,
  wait: MigrationWait,
): Promise<CommandOutcome> {
  const deadline = wait.now() + wait.timeoutMs;

  for (;;) {
    const state = await checkMigrations(db, wait.migrationsDir);

    if (state.missing.length === 0) {
      return {
        exitCode: 0,
        message:
          state.unknown.length === 0
            ? "Migrations: in line with the repository."
            : `Migrations: none missing; ${state.unknown.length} unknown to this code (${versions(state.unknown)}).`,
      };
    }

    if (wait.now() >= deadline) {
      return {
        exitCode: 1,
        message: `Migrations: ${state.missing.length} not applied in the database (${versions(state.missing)}). Run the "Supabase production" migrate action, then deploy again.`,
      };
    }

    wait.log(waiting(state));
    await wait.sleep(wait.intervalMs);
  }
}

/** The command line: `[--now]`. */
export function migrationWaitFor(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): "skip" | "now" | "wait" | "usage" {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--now")) {
    return "usage";
  }

  if (argv[0] === "--now") {
    return "now";
  }

  return env.VERCEL_ENV === "production" ? "wait" : "skip";
}

import { setTimeout } from "node:timers/promises";
import {
  migrationWaitFor,
  usage,
  waitForMigrations,
} from "./migrations-command";
import { runAgainstDatabase } from "./ops-domain";

const mode = migrationWaitFor(process.argv.slice(2), process.env);

if (mode === "usage") {
  console.error(usage);
  process.exit(2);
}

if (mode === "skip") {
  console.log("Migrations: not a production deploy, nothing to check.");
  process.exit(0);
}

await runAgainstDatabase(({ db }) =>
  waitForMigrations(db, {
    migrationsDir: new URL("../../../supabase/migrations/", import.meta.url),
    // Far within Vercel's build limit, and time to run migrate after a merge.
    timeoutMs: mode === "wait" ? 20 * 60 * 1000 : 0,
    intervalMs: 15 * 1000,
    sleep: (ms) => setTimeout(ms),
    now: () => Date.now(),
    log: (line) => console.log(line),
  }),
);

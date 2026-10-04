import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabase } from "@lanbort/database";
import { type DomainContext, outboxConsumers } from "@lanbort/domain";
import { runRestoreCommand } from "./restore-command";

// Locally the repository's .env is used; an explicit DATABASE_URL wins.
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}

// pnpm runs the script in apps/ops; paths are meant from where it was called.
const here = (path: string) => resolve(process.env.INIT_CWD ?? ".", path);

const db = createDatabase({ connectionString, maxConnections: 1 });
// The app's outbox consumers, so re-applied events reach the same side
// effects. They run in the app's worker, never here.
const domain: DomainContext = {
  db,
  consumers: outboxConsumers({
    domain: () => domain,
    imageStore: () => undefined,
    identities: () => undefined,
  }),
};

try {
  const outcome = await runRestoreCommand(domain, process.argv.slice(2), {
    migrationsDir: new URL("../../../supabase/migrations/", import.meta.url),
    readFile: (path) => readFile(here(path), "utf8"),
    // Never overwrites: a journal is evidence of what was carried over.
    writeFile: (path, content) =>
      writeFile(here(path), content, { flag: "wx" }),
  });

  (outcome.exitCode === 0 ? console.log : console.error)(outcome.message);
  process.exitCode = outcome.exitCode;
} finally {
  await db.destroy();
}

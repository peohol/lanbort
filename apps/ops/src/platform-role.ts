import { existsSync } from "node:fs";
import { createDatabase } from "@lanbort/database";
import { ConsumerRegistry } from "@lanbort/domain";
import { runPlatformRoleCommand } from "./platform-role-command";

// Locally the repository's .env is used; an explicit DATABASE_URL wins.
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}

const db = createDatabase({ connectionString, maxConnections: 1 });

try {
  // Events from this command have no outbox side effects yet.
  const outcome = await runPlatformRoleCommand(
    { db, consumers: new ConsumerRegistry() },
    process.argv.slice(2),
  );

  (outcome.exitCode === 0 ? console.log : console.error)(outcome.message);
  process.exitCode = outcome.exitCode;
} finally {
  await db.destroy();
}

import { existsSync } from "node:fs";
import { createDatabase } from "@lanbort/database";
import { type DomainContext, outboxConsumers } from "@lanbort/domain";
import type { CommandOutcome } from "./outcome";

/**
 * Runs an operational command against the product's database and prints its
 * outcome. The app's outbox consumers are registered, so events recorded
 * here reach the same side effects (notifications, the search index); they
 * run in the app's worker, never here.
 */
export async function runAgainstDatabase(
  run: (domain: DomainContext) => Promise<CommandOutcome>,
) {
  // Locally the repository's .env is used; an explicit DATABASE_URL wins.
  const rootEnv = new URL("../../../.env", import.meta.url);
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }

  const db = createDatabase({ connectionString, maxConnections: 1 });
  const domain: DomainContext = {
    db,
    consumers: outboxConsumers({
      domain: () => domain,
      imageStore: () => undefined,
      pictureStore: () => undefined,
      identities: () => undefined,
    }),
  };

  try {
    const outcome = await run(domain);

    (outcome.exitCode === 0 ? console.log : console.error)(outcome.message);
    process.exitCode = outcome.exitCode;
  } finally {
    await db.destroy();
  }
}

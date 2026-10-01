import { createDatabase } from "@lanbort/database";

/** Connection to the local test database for `*.integration.test.ts`. */
export function connectTestDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for integration tests.");
  }

  return createDatabase({ connectionString, maxConnections: 10 });
}

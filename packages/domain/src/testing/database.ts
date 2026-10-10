import { createDatabase } from "@lanbort/database";

/** Connection to the local test database for `*.integration.test.ts`. */
export function connectTestDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for integration tests.");
  }

  return createDatabase({ connectionString, maxConnections: 10 });
}

/**
 * The owner's connection to the same database, for fixtures in schemas the
 * server's own role cannot reach, such as Auth's sessions.
 */
export function connectAdminTestDatabase() {
  const connectionString =
    process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("ADMIN_DATABASE_URL is required for integration tests.");
  }

  return createDatabase({ connectionString, maxConnections: 2 });
}

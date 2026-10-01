import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "./generated/database";

/**
 * Types for the private `app` schema, generated from the migrated database
 * (`pnpm db:types`). CI fails if they drift from the migrations.
 */
export type Database = DB;

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
}

export function createDatabase(options: DatabaseOptions): Kysely<Database> {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 5,
    application_name: "lanbort",
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

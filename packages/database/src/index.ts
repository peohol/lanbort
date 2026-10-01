import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

export type Database = Record<never, never>;

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

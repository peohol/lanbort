import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

export interface Database {}

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

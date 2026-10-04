import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createDatabase } from "@lanbort/database";

/**
 * Logical backups of the local Supabase database for the restore drill
 * (WP-72). The tools run inside the database container, so their version
 * always matches the server's, and as `supabase_admin`, which owns the
 * platform schemas a full backup contains.
 */
function container(): string {
  const config = readFileSync(
    new URL("../../../../supabase/config.toml", import.meta.url),
    "utf8",
  );
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];

  if (!projectId) {
    throw new Error("supabase/config.toml has no project_id");
  }

  return `supabase_db_${projectId}`;
}

const asAdmin = ["-U", "supabase_admin"];
const largeOutput = { maxBuffer: 1024 * 1024 * 1024 };

function psql(command: string): void {
  execFileSync(
    "docker",
    ["exec", container(), "psql", ...asAdmin, "-d", "postgres", "-c", command],
    { stdio: "pipe" },
  );
}

/** A full backup of the database `name`, in pg_dump's custom format. */
export function backUpDatabase(name: string): Buffer {
  return execFileSync(
    "docker",
    ["exec", container(), "pg_dump", "-Fc", ...asAdmin, "-d", name],
    largeOutput,
  );
}

/** Restores `backup` into a new, isolated database `name`. */
export function restoreDatabase(name: string, backup: Buffer): void {
  psql(`create database "${name}"`);
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container(),
      "pg_restore",
      "--exit-on-error",
      ...asAdmin,
      "-d",
      name,
    ],
    { ...largeOutput, input: backup },
  );
}

export function dropDatabase(name: string): void {
  psql(`drop database if exists "${name}" with (force)`);
}

function testDatabaseUrl(): URL {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required for integration tests.");
  }

  return new URL(url);
}

/** The name of the test database itself. */
export const testDatabaseName = () => testDatabaseUrl().pathname.slice(1);

/** A connection to database `name` on the test database's server. */
export function connectDatabase(name: string) {
  const url = testDatabaseUrl();
  url.pathname = `/${name}`;

  return createDatabase({ connectionString: url.href, maxConnections: 4 });
}

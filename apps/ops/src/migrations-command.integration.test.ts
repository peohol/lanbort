import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabase } from "@lanbort/database";
import { afterAll, describe, expect, it } from "vitest";
import { type MigrationWait, waitForMigrations } from "./migrations-command";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const db = createDatabase({ connectionString, maxConnections: 1 });
const migrationsDir = new URL("../../../supabase/migrations/", import.meta.url);
const dirs: string[] = [];
afterAll(async () => {
  await db.destroy();
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true })));
});

/** A copy of the repository's migrations to add to or take from. */
async function repository() {
  const dir = await mkdtemp(join(tmpdir(), "migrations-"));
  dirs.push(dir);
  await cp(migrationsDir, dir, { recursive: true });

  return { dir, url: pathToFileURL(`${dir}/`) };
}

/** A clock that only moves when the command sleeps. */
function waitIn(dir: URL, timeoutMs: number, onSleep = async () => {}) {
  let time = 0;
  const lines: string[] = [];
  const wait: MigrationWait = {
    migrationsDir: dir,
    timeoutMs,
    intervalMs: 1000,
    now: () => time,
    sleep: async (ms) => {
      time += ms;
      await onSleep();
    },
    log: (line) => lines.push(line),
  };

  return { wait, lines };
}

describe("ops:migrations", () => {
  it("lets a deploy through when the database has every migration", async () => {
    const { wait, lines } = waitIn(migrationsDir, 0);

    expect(await waitForMigrations(db, wait)).toEqual({
      exitCode: 0,
      message: "Migrations: in line with the repository.",
    });
    expect(lines).toEqual([]);
  });

  it("waits for a missing migration, and fails the deploy if it never comes", async () => {
    const { dir, url } = await repository();
    await writeFile(join(dir, "29991231235959_later.sql"), "select 1;");
    const { wait, lines } = waitIn(url, 3000);

    expect(await waitForMigrations(db, wait)).toEqual({
      exitCode: 1,
      message:
        'Migrations: 1 not applied in the database (29991231235959). Run the "Supabase production" migrate action, then deploy again.',
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("1 not applied (29991231235959)");
  });

  it("goes on once the missing migration is applied while it waits", async () => {
    const { dir, url } = await repository();
    const later = join(dir, "29991231235959_later.sql");
    await writeFile(later, "select 1;");
    // Applying it is, to the check, the same as the repository not having it.
    const { wait, lines } = waitIn(url, 60_000, () =>
      rm(later, { force: true }),
    );

    expect(await waitForMigrations(db, wait)).toMatchObject({ exitCode: 0 });
    expect(lines).toHaveLength(1);
  });

  it("only warns about migrations this code does not know", async () => {
    const { dir, url } = await repository();
    const newest = (await readdir(dir)).sort().at(-1)!;
    await rm(join(dir, newest));

    expect(await waitForMigrations(db, waitIn(url, 0).wait)).toEqual({
      exitCode: 0,
      message: `Migrations: none missing; 1 unknown to this code (${newest.slice(0, 14)}).`,
    });
  });
});

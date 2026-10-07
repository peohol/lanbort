import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabase } from "@lanbort/database";
import {
  type DomainContext,
  outboxConsumers,
  restoreJournalEntrySchema,
} from "@lanbort/domain";
import { afterAll, describe, expect, it } from "vitest";
import { type RestoreIo, runRestoreCommand } from "./restore-command";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const db = createDatabase({ connectionString, maxConnections: 2 });
afterAll(() => db.destroy());
const domain: DomainContext = {
  db,
  consumers: outboxConsumers({
    domain: () => domain,
    imageStore: () => undefined,
    pictureStore: () => undefined,
    identities: () => undefined,
  }),
};

const migrationsDir = new URL("../../../supabase/migrations/", import.meta.url);

/** Files kept in memory. */
function memoryIo(overrides: Partial<RestoreIo> = {}) {
  const files = new Map<string, string>();
  const io: RestoreIo = {
    migrationsDir,
    readFile: async (path) => files.get(path) ?? "",
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    ...overrides,
  };

  return { files, io };
}

describe("ops:restore", () => {
  it("explains its use when called wrongly", async () => {
    for (const argv of [
      [],
      ["finish"],
      ["journal", "--since", "yesterday", "--out", "j"],
      ["verify", "extra"],
    ]) {
      expect(
        await runRestoreCommand(domain, argv, memoryIo().io),
      ).toMatchObject({ exitCode: 2 });
    }
  });

  it("writes the journal as one entry per line, ids and codes only", async () => {
    const { files, io } = memoryIo();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const outcome = await runRestoreCommand(
      domain,
      ["journal", "--since", since, "--out", "journal.jsonl"],
      io,
    );

    expect(outcome.exitCode).toBe(0);
    const lines = (files.get("journal.jsonl") ?? "")
      .split("\n")
      .filter(Boolean);
    expect(outcome.message).toContain(`Wrote ${lines.length} journal entries`);
    for (const line of lines) {
      restoreJournalEntrySchema.parse(JSON.parse(line));
    }
  });

  it("stops before anything runs while the schema differs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lanbort-migrations-"));

    try {
      for (const name of await readdir(migrationsDir)) {
        await copyFile(new URL(name, migrationsDir), join(dir, name));
      }
      await writeFile(join(dir, "29991231235959_from_the_future.sql"), "");

      const outcome = await runRestoreCommand(
        domain,
        ["verify"],
        memoryIo({ migrationsDir: pathToFileURL(`${dir}/`) }).io,
      );

      expect(outcome).toEqual({
        exitCode: 1,
        message:
          "Migrations: 1 not applied (29991231235959), 0 unknown (-).\n" +
          "Not ready: bring the schema in line before anything else runs.",
      });
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("does not report ready while a journal entry needs handling", async () => {
    const { files, io } = memoryIo();
    const entryId = randomUUID();
    files.set(
      "journal.jsonl",
      `${JSON.stringify({
        id: entryId,
        position: "9000000000000000000",
        occurredAt: new Date().toISOString(),
        type: "user_block.created",
        resourceType: "user_block",
        resourceId: randomUUID(),
        actorUserId: null,
        payload: {},
        captured: null,
      })}\n`,
    );

    const outcome = await runRestoreCommand(
      domain,
      ["finish", "--journal", "journal.jsonl"],
      io,
    );

    expect(outcome.exitCode).toBe(1);
    expect(outcome.message).toContain(
      "Migrations: in line with the repository.",
    );
    expect(outcome.message).toContain("Journal: 1 entry, 1 needs_handling.");
    expect(outcome.message).toContain(
      `Needs handling: user_block.created ${entryId}`,
    );
    expect(outcome.message).toContain("Search index: rebuilt");
    expect(outcome.message).toMatch(
      /Chat: \d+ conversations start new groups\./,
    );
    expect(outcome.message).toMatch(/Not ready to open \(\d+\.\d s\)\.$/);
  });
});

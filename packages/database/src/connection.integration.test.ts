import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./index";

describe("database connection", () => {
  it("can execute a query against the local test database", async () => {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required for the database integration test.");
    }

    const database = createDatabase({
      connectionString,
      maxConnections: 1,
    });

    try {
      const result = await sql<{ value: number }>`select 1::int as value`.execute(
        database,
      );

      expect(result.rows[0]?.value).toBe(1);
    } finally {
      await database.destroy();
    }
  });
});

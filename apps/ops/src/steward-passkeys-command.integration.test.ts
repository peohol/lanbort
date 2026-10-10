import { randomUUID } from "node:crypto";
import { createDatabase } from "@lanbort/database";
import { ConsumerRegistry } from "@lanbort/domain";
import { afterAll, describe, expect, it } from "vitest";
import { runPlatformRoleCommand } from "./platform-role-command";
import { registeredAccount } from "./testing";
import { runStewardPasskeysCommand } from "./steward-passkeys-command";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const db = createDatabase({ connectionString, maxConnections: 2 });
afterAll(() => db.destroy());
const domain = { db, consumers: new ConsumerRegistry() };

const run = (...argv: string[]) => runStewardPasskeysCommand(domain, argv);

describe("ops:steward-passkeys", () => {
  it("issues a code once to the operator, for stewards only, and never logs the reason", async () => {
    const { email, userId } = await registeredAccount(domain);

    expect(
      await run("enroll", "--email", email, "--reason", "Første nøkkel"),
    ).toEqual({ exitCode: 1, message: "Refused: forbidden." });

    await runPlatformRoleCommand(domain, [
      "grant",
      "--email",
      email,
      "--reason",
      "Pilot steward",
    ]);
    const enrolled = await run(
      "enroll",
      "--email",
      email,
      "--reason",
      "Første nøkkel",
    );
    expect(enrolled).toMatchObject({
      exitCode: 0,
      message: expect.stringMatching(
        /^Enrollment code: [0-9A-Z]{4}(-[0-9A-Z]{4}){3} \(valid until .+, once\)\.$/,
      ),
    });
    expect(enrolled.message).not.toContain("Første nøkkel");

    const reset = await run("reset", "--email", email, "--reason", "Mistet");
    expect(reset.message).toMatch(/^Removed 0 passkeys\. Enrollment code: /);

    // Only the hash is kept, and the newer code voided the first.
    const codes = await db
      .selectFrom("app.steward_enrollment_codes")
      .select(["code_hash", "voided_at"])
      .where("user_id", "=", userId)
      .orderBy("issued_at")
      .execute();
    expect(codes).toHaveLength(2);
    expect(codes[0]!.voided_at).not.toBeNull();
    expect(codes[1]!.voided_at).toBeNull();
    const code = reset.message.match(/code: (\S+)/)![1]!;
    expect(Buffer.from(codes[1]!.code_hash).toString("hex")).not.toContain(
      Buffer.from(code).toString("hex"),
    );
  });

  it("refuses unknown accounts and incomplete input", async () => {
    expect(
      await run(
        "enroll",
        "--email",
        `nobody-${randomUUID()}@example.test`,
        "--reason",
        "x",
      ),
    ).toEqual({ exitCode: 1, message: "Refused: not_found." });
    expect(await run("enroll", "--email", "a@b.no")).toEqual({
      exitCode: 1,
      message: "Refused: invalid_input (reason).",
    });
  });
});

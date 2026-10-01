import { randomUUID } from "node:crypto";
import { createDatabase } from "@lanbort/database";
import {
  completeRegistration,
  ConsumerRegistry,
  executeCommand,
  resolveUserActor,
} from "@lanbort/domain";
import { afterAll, describe, expect, it } from "vitest";
import { runPlatformRoleCommand } from "./platform-role-command";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const db = createDatabase({ connectionString, maxConnections: 2 });
afterAll(() => db.destroy());
const domain = { db, consumers: new ConsumerRegistry() };

async function registeredEmail() {
  const email = `ops-${randomUUID()}@example.test`;
  const actor = await resolveUserActor(domain, {
    provider: "supabase",
    subject: randomUUID(),
    email,
    emailVerified: true,
    authentication: { sessionId: randomUUID(), assurance: "aal1", methods: [] },
  });
  await executeCommand(domain, completeRegistration, {
    actor: actor!,
    input: { realName: "Drift Testesen", adultConfirmed: true },
    idempotencyKey: randomUUID(),
  });
  return email;
}

describe("ops:platform-role", () => {
  it("grants and revokes through the audited command", async () => {
    const email = await registeredEmail();

    const granted = await runPlatformRoleCommand(domain, [
      "grant",
      "--email",
      email,
      "--reason",
      "Pilot steward",
    ]);
    expect(granted).toMatchObject({
      exitCode: 0,
      message: expect.stringMatching(/^Granted platform_steward \(grant /),
    });
    // The reason is stored, never echoed.
    expect(granted.message).not.toContain("Pilot steward");

    expect(
      await runPlatformRoleCommand(domain, [
        "grant",
        "--email",
        email,
        "--reason",
        "Again",
      ]),
    ).toEqual({ exitCode: 1, message: "Refused: conflict." });

    expect(
      (
        await runPlatformRoleCommand(domain, [
          "revoke",
          "--email",
          email,
          "--reason",
          "Stepped down",
        ])
      ).exitCode,
    ).toBe(0);
  });

  it("refuses unknown accounts and incomplete input", async () => {
    expect(
      await runPlatformRoleCommand(domain, [
        "grant",
        "--email",
        "nobody@example.test",
        "--reason",
        "x",
      ]),
    ).toEqual({ exitCode: 1, message: "Refused: not_found." });

    expect(
      await runPlatformRoleCommand(domain, ["grant", "--email", "a@b.no"]),
    ).toEqual({ exitCode: 1, message: "Refused: invalid_input (reason)." });
  });
});

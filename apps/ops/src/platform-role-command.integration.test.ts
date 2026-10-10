import { createDatabase } from "@lanbort/database";
import { ConsumerRegistry } from "@lanbort/domain";
import { afterAll, describe, expect, it } from "vitest";
import { runPlatformRoleCommand } from "./platform-role-command";
import { registeredAccount } from "./testing";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

const db = createDatabase({ connectionString, maxConnections: 2 });
afterAll(() => db.destroy());
const domain = { db, consumers: new ConsumerRegistry() };

describe("ops:platform-role", () => {
  it("grants and revokes through the audited command", async () => {
    const { email } = await registeredAccount(domain);

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

  it("retries a change safely with the announced key", async () => {
    const { email, userId } = await registeredAccount(domain);
    const keys: string[] = [];
    const grant = (...extra: string[]) =>
      runPlatformRoleCommand(
        domain,
        ["grant", "--email", email, "--reason", "Pilot steward", ...extra],
        { announceKey: (key) => keys.push(key) },
      );

    const first = await grant();
    expect(first.exitCode).toBe(0);
    expect(keys).toHaveLength(1);

    // The same key repeats the first result instead of refusing or regranting.
    const retried = await grant("--idempotency-key", keys[0]!);
    expect(retried).toEqual({
      exitCode: 0,
      message: `${first.message.slice(0, -1)}, already applied with this key.`,
    });
    expect(keys[1]).toBe(keys[0]);

    const events = await db
      .selectFrom("app.audit_events")
      .select("event_type")
      .where("resource_type", "=", "user")
      .where("resource_id", "=", userId)
      .where("event_type", "=", "platform_role.granted")
      .execute();
    expect(events).toHaveLength(1);

    // A new key is a new change, which the active grant refuses.
    expect(await grant()).toEqual({
      exitCode: 1,
      message: "Refused: conflict.",
    });
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

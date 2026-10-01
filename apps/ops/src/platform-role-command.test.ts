import { describe, expect, it } from "vitest";
import { runPlatformRoleCommand, usage } from "./platform-role-command";

// Malformed calls are rejected before the database is touched.
const noDatabase = {} as never;

describe("ops:platform-role arguments", () => {
  it.each([
    [[]],
    [["promote", "--email", "a@b.no", "--reason", "x"]],
    [["grant", "extra", "--email", "a@b.no", "--reason", "x"]],
    [["grant", "--bogus"]],
  ])("prints usage for %j", async (argv) => {
    expect(await runPlatformRoleCommand(noDatabase, argv)).toEqual({
      exitCode: 2,
      message: usage,
    });
  });
});

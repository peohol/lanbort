import { describe, expect, it } from "vitest";
import { runStewardPasskeysCommand, usage } from "./steward-passkeys-command";

// Malformed calls are rejected before the database is touched.
const noDatabase = {} as never;

describe("ops:steward-passkeys arguments", () => {
  it.each([
    [[]],
    [["revoke", "--email", "a@b.no", "--reason", "x"]],
    [["enroll", "extra", "--email", "a@b.no", "--reason", "x"]],
    [["reset", "--idempotency-key", "k"]],
  ])("prints usage for %j", async (argv) => {
    expect(await runStewardPasskeysCommand(noDatabase, argv)).toEqual({
      exitCode: 2,
      message: usage,
    });
  });
});

import { describe, expect, it } from "vitest";
import { migrationWaitFor } from "./migrations-command";

describe("ops:migrations", () => {
  it("waits only in a production deploy, or checks once on request", () => {
    expect(migrationWaitFor([], { VERCEL_ENV: "production" })).toBe("wait");
    expect(migrationWaitFor([], { VERCEL_ENV: "preview" })).toBe("skip");
    expect(migrationWaitFor([], {})).toBe("skip");
    expect(migrationWaitFor(["--now"], {})).toBe("now");
    expect(migrationWaitFor(["--now", "x"], {})).toBe("usage");
    expect(migrationWaitFor(["--wait"], {})).toBe("usage");
  });
});

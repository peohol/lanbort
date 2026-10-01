import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./index";

describe("health response contract", () => {
  it("accepts the non-sensitive readiness body", () => {
    expect(
      healthResponseSchema.parse({ status: "ok", service: "lanbort-web" }),
    ).toEqual({ status: "ok", service: "lanbort-web" });
  });

  it("rejects any additional field instead of stripping it", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        service: "lanbort-web",
        databaseUrl: "postgresql://user:secret@example/db",
      }).success,
    ).toBe(false);
  });
});

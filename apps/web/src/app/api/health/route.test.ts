import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@lanbort/contracts";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns a non-sensitive readiness response", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(healthResponseSchema.parse(body)).toEqual({
      status: "ok",
      service: "lanbort-web",
    });
  });
});

import { healthResponseSchema } from "@lanbort/contracts";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  it("returns a non-sensitive readiness response", async () => {
    const response = await GET(new NextRequest("http://localhost/api/health"), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(healthResponseSchema.parse(body)).toEqual({
      status: "ok",
      service: "lanbort-web",
    });
  });
});

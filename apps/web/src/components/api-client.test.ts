import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "./api-client";

function respond(body: string, status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("postJson", () => {
  it("returns the API's error code", async () => {
    respond(JSON.stringify({ error: { code: "invalid_code" } }), 400);

    expect(await postJson("/api/x", {})).toEqual({
      ok: false,
      code: "invalid_code",
    });
  });

  it.each([
    [502, "unavailable"],
    [429, "rate_limited"],
    [404, "internal_error"],
    [200, "internal_error"],
  ])("turns a non-JSON %i page into %s", async (status, code) => {
    respond("<html>Bad gateway</html>", status);

    expect(await postJson("/api/x", {})).toEqual({ ok: false, code });
  });

  it("reports a failed connection as a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect(await postJson("/api/x", {})).toEqual({
      ok: false,
      code: "network",
    });
  });
});

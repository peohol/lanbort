import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, postFile, postJson } from "./api-client";

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

describe("an answer that does not come", () => {
  it("is a network error once the time runs out, not a wait for ever", async () => {
    const clock = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(clock.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_path: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );

    const result = postJson("/api/x", {});
    clock.abort(new DOMException("timed out", "TimeoutError"));

    expect(await result).toEqual({ ok: false, code: "network" });
    expect(timeout).toHaveBeenCalledWith(60_000);
    timeout.mockRestore();
  });

  it("is a network error when the connection breaks during the answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new TypeError("network error");
        },
      })),
    );

    expect(await getJson("/api/x")).toEqual({ ok: false, code: "network" });
  });
});

describe("getJson", () => {
  it("returns the API's data", async () => {
    respond(JSON.stringify({ unreadCount: 2 }), 200);

    expect(await getJson("/api/x")).toEqual({
      ok: true,
      data: { unreadCount: 2 },
    });
  });
});

describe("postFile", () => {
  it("sends the file as the body, with its type and the command's key", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const file = new Blob(["png"], { type: "image/png" });

    await postFile("/api/x", file, { idempotencyKey: "key" });

    expect(fetch).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "content-type": "image/png", "Idempotency-Key": "key" },
      body: file,
      signal: expect.any(AbortSignal),
    });
  });
});

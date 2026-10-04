import type { AuthGateway } from "@lanbort/auth";
import {
  AuthorizationError,
  ConsumerRegistry,
  RateLimitedError,
} from "@lanbort/domain";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { Runtime } from "../runtime";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { createRouteFactory } = await import("./route");

const signedOut: AuthGateway = {
  requestEmailCode: async () => {},
  verifyEmailCode: async () => {
    throw new Error("not used");
  },
  currentIdentity: async () => null,
  refreshSession: async () => {},
  signOut: async () => {},
};

function factory(overrides: Partial<Runtime> = {}) {
  return createRouteFactory({
    domain: () => ({ db: {} as never, consumers: new ConsumerRegistry() }),
    auth: () => signedOut,
    cronSecret: () => "s".repeat(40),
    ...overrides,
  });
}

const call = (
  handler: ReturnType<ReturnType<typeof factory>["public"]>,
  init: { method?: string; headers?: Record<string, string> } = {},
) =>
  handler(
    new NextRequest("https://lanbort.test/api/x", {
      ...init,
      headers: { host: "lanbort.test", ...init.headers },
    }),
    { params: Promise.resolve({}) },
  );

const ok = async () => Response.json({ ok: true });

describe("route boundary: request origin", () => {
  const route = factory();

  it.each([
    ["a foreign Origin", { origin: "https://evil.test" }],
    ["no Origin from a cross-site context", { "sec-fetch-site": "cross-site" }],
    ["no Origin and no fetch metadata", {}],
    ["a malformed Origin", { origin: "null" }],
    [
      "our host behind a different forwarded host",
      { origin: "https://lanbort.test", "x-forwarded-host": "proxy.example" },
    ],
  ])("rejects state-changing requests with %s", async (_name, headers) => {
    const handler = vi.fn(ok);
    const response = await call(route.public(handler), {
      method: "POST",
      headers,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "cross_site_request" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["our own Origin", { origin: "https://lanbort.test" }],
    ["same-origin fetch metadata", { "sec-fetch-site": "same-origin" }],
  ])("accepts state-changing requests with %s", async (_name, headers) => {
    const response = await call(route.public(ok), { method: "POST", headers });

    expect(response.status).toBe(200);
  });

  it("does not require an Origin for reads", async () => {
    expect((await call(route.public(ok))).status).toBe(200);
  });
});

describe("route boundary: actors and errors", () => {
  it("rejects user routes without a signed-in user before running them", async () => {
    const handler = vi.fn(ok);
    const response = await call(factory().user(handler));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthenticated" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("maps policy denials to their public code", async () => {
    const response = await call(
      factory().public(async () => {
        throw new AuthorizationError("account.read", "not_found");
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
  });

  it("says when to try again after a rate limit, and nothing else", async () => {
    const response = await call(
      factory().public(async () => {
        throw new RateLimitedError("contact", 42);
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toEqual({ error: { code: "rate_limited" } });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const response = await call(
      factory().public(async () => {
        throw new Error(
          "connection to db.internal:5432 failed for kari@example.no",
        );
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: { code: "internal_error" } });
    expect(text).not.toContain("kari@example.no");
  });

  it("passes the dynamic route segments to the handler", async () => {
    const handler = vi.fn(async ({ params }: { params: unknown }) =>
      Response.json(params),
    );
    const response = await factory().public(handler)(
      new NextRequest("https://lanbort.test/api/objects/abc", {
        headers: { host: "lanbort.test" },
      }),
      { params: Promise.resolve({ objectId: "abc" }) },
    );

    expect(await response.json()).toEqual({ objectId: "abc" });
  });

  it("never lets responses be cached and tags them with a request id", async () => {
    const response = await call(factory().public(ok));

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("route boundary: scheduled jobs", () => {
  const secret = "s".repeat(40);

  it("requires the exact cron secret", async () => {
    const handler = vi.fn(ok);
    const job = factory().scheduler("outbox.worker", handler);

    for (const authorization of [
      undefined,
      `Bearer ${"x".repeat(40)}`,
      secret,
    ]) {
      const response = await call(job, {
        headers: authorization ? { authorization } : {},
      });
      expect(response.status).toBe(401);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs as the named system process with the right secret", async () => {
    const handler = vi.fn(async ({ actor }: { actor: unknown }) =>
      Response.json(actor),
    );
    const response = await call(factory().scheduler("outbox.worker", handler), {
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(await response.json()).toEqual({
      kind: "system",
      process: "outbox.worker",
    });
  });

  it("is unavailable when no secret is configured", async () => {
    const response = await call(
      factory({ cronSecret: () => undefined }).scheduler("outbox.worker", ok),
      { headers: { authorization: "Bearer " } },
    );

    expect(response.status).toBe(503);
  });
});

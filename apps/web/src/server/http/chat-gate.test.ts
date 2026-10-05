import { ConsumerRegistry } from "@lanbort/domain";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { createRouteFactory, boundaryOf } = await import("./route");
const { chatOnly } = await import("./chat-gate");

const route = createRouteFactory({
  domain: () => ({ db: {} as never, consumers: new ConsumerRegistry() }),
  auth: () => {
    throw new Error("not used");
  },
  cronSecret: () => undefined,
});

const handler = chatOnly(
  route.public(async () => Response.json({ reached: true })),
);
const call = () =>
  handler(new NextRequest("http://localhost/api/chat/inbox"), {
    params: Promise.resolve({}),
  });

describe("private chat gate (Port C)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers as if the route did not exist unless chat is turned on", async () => {
    for (const value of [undefined, "", "1", "TRUE", "false"]) {
      vi.stubEnv("CHAT_ENABLED", value);
      const response = await call();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: "not_found" } });
    }
  });

  it("passes through when chat is on, keeping the route's boundary", async () => {
    vi.stubEnv("CHAT_ENABLED", "true");
    expect(await (await call()).json()).toEqual({ reached: true });
    expect(boundaryOf(handler)).toEqual({ access: "public" });
  });
});

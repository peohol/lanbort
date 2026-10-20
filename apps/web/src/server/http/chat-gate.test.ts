import { ConsumerRegistry } from "@lanbort/domain";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

/** Whether the auth provider makes accounts for new addresses. */
let newAccounts = true;
vi.mock("../new-accounts", () => ({
  newAccountsAreOpen: async () => newAccounts,
}));

const { createRouteFactory, boundaryOf } = await import("./route");
const { chatOnly, pilotOnly, stewardsOnly } = await import("./chat-gate");

const route = createRouteFactory({
  domain: () => ({ db: {} as never, consumers: new ConsumerRegistry() }),
  auth: () => {
    throw new Error("not used");
  },
  cronSecret: () => undefined,
});

describe.each([
  { gate: chatOnly, flag: "CHAT_ENABLED", what: "private chat (Port C)" },
  {
    gate: stewardsOnly,
    flag: "PLATFORM_STEWARDS_ENABLED",
    what: "platform stewards (ADR-0011)",
  },
  { gate: pilotOnly, flag: "PILOT_ENABLED", what: "the pilot workspace" },
])("$what gate", ({ gate, flag }) => {
  const handler = gate(
    route.public(async () => Response.json({ reached: true })),
  );
  const call = () =>
    handler(new NextRequest("http://localhost/api/gated"), {
      params: Promise.resolve({}),
    });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers as if the route did not exist unless turned on", async () => {
    for (const value of [undefined, "", "1", "TRUE", "false"]) {
      vi.stubEnv(flag, value);
      const response = await call();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: "not_found" } });
    }
  });

  it("passes through when turned on, keeping the route's boundary", async () => {
    vi.stubEnv(flag, "true");
    expect(await (await call()).json()).toEqual({ reached: true });
    expect(boundaryOf(handler)).toEqual({ access: "public" });
  });
});

describe("private chat in the closed pilot (PS-NFR-015, PS-COM-023)", () => {
  const handler = chatOnly(
    route.public(async () => Response.json({ reached: true })),
  );
  const call = () =>
    handler(new NextRequest("http://localhost/api/gated"), {
      params: Promise.resolve({}),
    });

  afterEach(() => {
    vi.unstubAllEnvs();
    newAccounts = true;
  });

  it("is on only while new addresses get no account", async () => {
    vi.stubEnv("CHAT_ENABLED", "pilot");

    newAccounts = false;
    expect(await (await call()).json()).toEqual({ reached: true });

    newAccounts = true;
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });
  });
});

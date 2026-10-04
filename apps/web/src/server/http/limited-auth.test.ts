import type { AuthGateway } from "@lanbort/auth";
import { ConsumerRegistry, type RateLimit } from "@lanbort/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const consumed: [string, string][] = [];
let refuse: string | undefined;

vi.mock("@lanbort/domain", async (original) => {
  const actual = await original<typeof import("@lanbort/domain")>();

  return {
    ...actual,
    consumeRateLimit: async (_: unknown, limit: RateLimit, subject: string) => {
      consumed.push([limit.rule, subject]);
      if (limit.rule === refuse) {
        throw new actual.RateLimitedError(limit.rule, 60);
      }
    },
  };
});

const { withCodeLimits } = await import("./limited-auth");

const provider = {
  requestEmailCode: vi.fn(async () => {}),
  verifyEmailCode: vi.fn(async () => ({
    providerUserId: "p",
    email: "a@x.test",
  })),
  currentIdentity: async () => null,
  refreshSession: async () => {},
  signOut: async () => {},
} as unknown as AuthGateway;

const domain = () => ({ db: {} as never, consumers: new ConsumerRegistry() });

beforeEach(() => {
  consumed.length = 0;
  refuse = undefined;
  vi.clearAllMocks();
});

describe("sign-in codes with rate limits (WP-73)", () => {
  it("counts per client and per normalized address before asking the provider", async () => {
    const auth = withCodeLimits(provider, domain, "203.0.113.7");

    await auth.requestEmailCode(" A@X.test ");
    await auth.verifyEmailCode("a@x.test", "123456");

    expect(consumed).toEqual([
      ["email_codes_per_client", "client:203.0.113.7"],
      ["email_codes_per_address", "email:a@x.test"],
      ["code_attempts_per_client", "client:203.0.113.7"],
      ["code_attempts_per_address", "email:a@x.test"],
    ]);
    expect(provider.requestEmailCode).toHaveBeenCalledOnce();
    expect(provider.verifyEmailCode).toHaveBeenCalledOnce();
  });

  it("counts only per address when the client is unknown", async () => {
    await withCodeLimits(provider, domain, null).requestEmailCode("a@x.test");

    expect(consumed).toEqual([["email_codes_per_address", "email:a@x.test"]]);
  });

  it("never reaches the provider when a limit refuses", async () => {
    refuse = "code_attempts_per_address";
    const auth = withCodeLimits(provider, domain, "203.0.113.7");

    await expect(
      auth.verifyEmailCode("a@x.test", "123456"),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 60 });
    expect(provider.verifyEmailCode).not.toHaveBeenCalled();
  });
});

import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AuthProviderError } from "./errors";
import { toIdentity } from "./identity";

const subject = "7b6a3f9e-2c1d-4e5f-8a9b-0c1d2e3f4a5b";

function token(claims: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  return `${encode({ alg: "ES256" })}.${encode(claims)}.signature`;
}

function user(
  overrides: { [K in keyof User]?: User[K] | undefined } = {},
): User {
  return {
    id: subject,
    email: "kari@example.com",
    email_confirmed_at: "2026-10-01T10:00:00Z",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-10-01T10:00:00Z",
    ...overrides,
  } as User;
}

const claims = {
  sub: subject,
  session_id: "session-1",
  aal: "aal1",
  amr: [{ method: "otp", timestamp: 1_790_000_000 }],
};

describe("toIdentity", () => {
  it("maps the verified user and session claims", () => {
    expect(toIdentity(user(), token(claims))).toEqual({
      provider: "supabase",
      subject,
      email: "kari@example.com",
      emailVerified: true,
      authentication: {
        sessionId: "session-1",
        assurance: "aal1",
        methods: [{ method: "otp", at: new Date(1_790_000_000 * 1000) }],
      },
    });
  });

  it("treats an unconfirmed e-mail as unverified", () => {
    const identity = toIdentity(
      user({ email_confirmed_at: undefined }),
      token(claims),
    );

    expect(identity.emailVerified).toBe(false);
  });

  it("rejects a token that belongs to another user", () => {
    expect(() =>
      toIdentity(user(), token({ ...claims, sub: "someone-else" })),
    ).toThrow(AuthProviderError);
  });

  it("rejects malformed tokens and unknown assurance levels", () => {
    expect(() => toIdentity(user(), "not-a-token")).toThrow(AuthProviderError);
    expect(() => toIdentity(user(), token({ ...claims, aal: "aal3" }))).toThrow(
      AuthProviderError,
    );
  });

  it("never reads user-editable metadata", () => {
    const identity = toIdentity(
      user({
        user_metadata: { role: "platform_steward", email_verified: true },
        email_confirmed_at: undefined,
      }),
      token(claims),
    );

    expect(identity.emailVerified).toBe(false);
    expect(JSON.stringify(identity)).not.toContain("platform_steward");
  });
});

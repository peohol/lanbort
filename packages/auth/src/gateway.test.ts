import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProviderError, createAuthGateway, newAccountsOpen } from "./index";
import { MemoryCookieStore } from "./testing";

const config = {
  url: "http://127.0.0.1:54321",
  publishableKey: "test-publishable-key",
  secureCookies: false,
};

/** A stored, unexpired session, so only the server check hits the network. */
function signedInCookies() {
  const payload = Buffer.from(
    JSON.stringify({ sub: "user-1", session_id: "s", aal: "aal1", amr: [] }),
  ).toString("base64url");
  const session = {
    access_token: `e30.${payload}.signature`,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "user-1" },
  };
  const cookies = new MemoryCookieStore();
  cookies.cookies.set(
    "sb-127-auth-token",
    `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
  );
  return cookies;
}

function providerResponds(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ code: status, msg: "provider says no" }, { status }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("currentIdentity", () => {
  it("reports provider throttling instead of treating the user as signed out", async () => {
    providerResponds(429);

    await expect(
      createAuthGateway(config, signedInCookies()).currentIdentity(),
    ).rejects.toEqual(new AuthProviderError("rate_limited"));
  });

  it("treats a session the provider rejects as signed out", async () => {
    providerResponds(403);

    expect(
      await createAuthGateway(config, signedInCookies()).currentIdentity(),
    ).toBeNull();
  });

  it("reports provider outages as unavailable", async () => {
    providerResponds(503);

    await expect(
      createAuthGateway(config, signedInCookies()).currentIdentity(),
    ).rejects.toEqual(new AuthProviderError("unavailable"));
  });
});

describe("requestEmailCode", () => {
  function providerAnswers(status: number, code: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: status, error_code: code, msg: "no" },
          { status },
        ),
      ),
    );
  }

  it("answers as if a code was sent when new accounts are closed", async () => {
    for (const code of ["signup_disabled", "otp_disabled"]) {
      providerAnswers(422, code);

      await expect(
        createAuthGateway(config, new MemoryCookieStore()).requestEmailCode(
          "ny@example.com",
        ),
      ).resolves.toBeUndefined();
    }
  });

  it("still reports other refusals", async () => {
    providerAnswers(422, "validation_failed");

    await expect(
      createAuthGateway(config, new MemoryCookieStore()).requestEmailCode(
        "ny@example.com",
      ),
    ).rejects.toEqual(new AuthProviderError("unavailable"));
  });
});

describe("newAccountsOpen", () => {
  it("reads the provider's own setting", async () => {
    for (const disabled of [true, false]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ disable_signup: disabled })),
      );

      expect(await newAccountsOpen(config)).toBe(!disabled);
    }
  });

  it("reports an unreachable provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await expect(newAccountsOpen(config)).rejects.toEqual(
      new AuthProviderError("unavailable"),
    );
  });
});

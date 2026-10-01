import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuthProviderError, createAuthGateway } from "./index";
import { MemoryCookieStore, readEmailCode, totpCode } from "./testing";

const config = {
  url: process.env.SUPABASE_URL ?? "",
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  secureCookies: false,
};

if (!config.url || !config.publishableKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for auth integration tests.",
  );
}

const email = () => `auth-${randomUUID()}@example.test`;

async function signIn(address: string, cookies = new MemoryCookieStore()) {
  const gateway = createAuthGateway(config, cookies);
  const since = new Date();
  await gateway.requestEmailCode(address);
  const identity = await gateway.verifyEmailCode(
    address,
    await readEmailCode(address, { since }),
  );

  return { gateway, identity, cookies };
}

describe("Supabase auth adapter (WP-10)", () => {
  it("signs a new address in with an e-mailed code and verifies it", async () => {
    const address = email();
    const { identity, cookies } = await signIn(address);

    expect(identity).toMatchObject({
      provider: "supabase",
      email: address,
      emailVerified: true,
      authentication: {
        assurance: "aal1",
        methods: [{ method: "otp", at: expect.any(Date) }],
      },
    });
    expect(cookies.cookies.size).toBeGreaterThan(0);
  });

  it("restores the verified identity from the session cookies", async () => {
    const { identity, cookies } = await signIn(email());

    const restored = await createAuthGateway(config, cookies).currentIdentity();

    expect(restored).toEqual(identity);
  });

  it("returns the same subject when an existing address signs in again", async () => {
    const address = email();
    const first = await signIn(address);
    const second = await signIn(address);

    expect(second.identity.subject).toBe(first.identity.subject);
    expect(second.identity.authentication.sessionId).not.toBe(
      first.identity.authentication.sessionId,
    );
  });

  it("rejects a wrong code without creating a session", async () => {
    const address = email();
    const cookies = new MemoryCookieStore();
    const gateway = createAuthGateway(config, cookies);
    await gateway.requestEmailCode(address);

    await expect(gateway.verifyEmailCode(address, "000000")).rejects.toEqual(
      new AuthProviderError("invalid_code"),
    );
    expect(await gateway.currentIdentity()).toBeNull();
  });

  it("has no identity without cookies or with forged cookies", async () => {
    expect(
      await createAuthGateway(
        config,
        new MemoryCookieStore(),
      ).currentIdentity(),
    ).toBeNull();

    const { cookies } = await signIn(email());
    const forged = new MemoryCookieStore();
    for (const [name] of cookies.cookies) {
      forged.cookies.set(name, "base64-eyJhY2Nlc3NfdG9rZW4iOiJmb3JnZWQifQ");
    }
    expect(
      await createAuthGateway(config, forged).currentIdentity(),
    ).toBeNull();
  });

  it("revokes the session on sign-out, also for a copy of the cookies", async () => {
    const { gateway, cookies } = await signIn(email());
    const stolenCopy = new MemoryCookieStore();
    for (const [name, value] of cookies.cookies)
      stolenCopy.cookies.set(name, value);

    await gateway.signOut();

    expect(cookies.cookies.size).toBe(0);
    expect(
      await createAuthGateway(config, stolenCopy).currentIdentity(),
    ).toBeNull();
  });
});

describe("authenticator app (WP-12)", () => {
  it("enrolls, confirms and raises the session to aal2", async () => {
    const address = email();
    const { gateway, cookies } = await signIn(address);
    expect(await gateway.totpStatus()).toBe("none");

    // A first, abandoned attempt is replaced by the next one.
    await gateway.enrollTotp();
    expect(await gateway.totpStatus()).toBe("pending");
    const { secret, qrCode } = await gateway.enrollTotp();
    expect(qrCode).toMatch(/^data:image\/svg\+xml/);

    await expect(gateway.verifyTotp("000000")).rejects.toEqual(
      new AuthProviderError("invalid_code"),
    );

    const confirmed = await gateway.verifyTotp(totpCode(secret));
    expect(confirmed.authentication.assurance).toBe("aal2");
    expect(confirmed.authentication.methods.map((m) => m.method)).toContain(
      "totp",
    );
    expect(await gateway.totpStatus()).toBe("verified");
    expect(
      (await createAuthGateway(config, cookies).currentIdentity())
        ?.authentication.assurance,
    ).toBe("aal2");

    // A confirmed app cannot be silently replaced.
    await expect(gateway.enrollTotp()).rejects.toBeInstanceOf(
      AuthProviderError,
    );

    // A new sign-in starts at aal1 and steps up with the app.
    const again = await signIn(address);
    expect(again.identity.authentication.assurance).toBe("aal1");
    expect(await again.gateway.totpStatus()).toBe("verified");
    const raised = await again.gateway.verifyTotp(totpCode(secret));
    expect(raised).toMatchObject({
      subject: again.identity.subject,
      authentication: {
        sessionId: again.identity.authentication.sessionId,
        assurance: "aal2",
      },
    });
  });

  it("has nothing to verify without an app", async () => {
    const { gateway } = await signIn(email());

    await expect(gateway.verifyTotp("123456")).rejects.toEqual(
      new AuthProviderError("invalid_code"),
    );
  });
});

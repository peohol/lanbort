import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuthProviderError, createAuthAdmin, createAuthGateway } from "./index";
import { MemoryCookieStore, readEmailCode } from "./testing";

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

describe("Supabase auth administration (WP-53)", () => {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
  const admin = createAuthAdmin({ url: config.url, secretKey });

  it("deletes an identity, which ends its sessions, and repeats harmlessly", async () => {
    if (!secretKey) {
      throw new Error("SUPABASE_SECRET_KEY is required for this test.");
    }

    const address = email();
    const { identity, cookies } = await signIn(address);

    await admin.deleteUser(identity.subject);
    await admin.deleteUser(identity.subject);

    expect(
      await createAuthGateway(config, cookies).currentIdentity(),
    ).toBeNull();

    // The address can start over with a new, unrelated identity.
    const again = await signIn(address);
    expect(again.identity.subject).not.toBe(identity.subject);
  });
});

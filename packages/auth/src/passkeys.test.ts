import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TestPasskey } from "./passkey-testing";
import { createPasskeyCeremonies, passkeyConfigFor } from "./passkeys";

const config = passkeyConfigFor(
  "https://www.xn--lnbort-iua.no",
  "xn--lnbort-iua.no",
);
const ceremonies = createPasskeyCeremonies(config);
const site = {
  rpId: "xn--lnbort-iua.no",
  origin: "https://www.xn--lnbort-iua.no",
};

async function registered(passkey = new TestPasskey(site)) {
  const challenge = randomBytes(32);
  const options = await ceremonies.registrationOptions({
    challenge,
    userHandle: randomBytes(16),
    userName: "forvalter@example.test",
    existing: [],
  });
  const credential = await ceremonies.verifyRegistration({
    response: passkey.register(options),
    challenge,
  });

  return { passkey, credential: credential! };
}

async function confirm(
  passkey: TestPasskey,
  credential: Awaited<ReturnType<typeof registered>>["credential"],
) {
  const challenge = randomBytes(32);
  const options = await ceremonies.confirmationOptions({
    challenge,
    allowed: [credential],
  });

  return ceremonies.verifyConfirmation({
    response: passkey.confirm(options),
    challenge,
    credential,
  });
}

describe("passkey ceremonies (ADR-0011)", () => {
  it("registers a passkey and confirms with it, counting its uses", async () => {
    const { passkey, credential } = await registered();

    expect(credential.id).toEqual(new Uint8Array(passkey.credentialId));
    expect(await confirm(passkey, credential)).toEqual({ signCount: 1 });
    expect(await confirm(passkey, { ...credential, signCount: 1 })).toEqual({
      signCount: 2,
    });
  });

  it("refuses a response made for another domain or origin", async () => {
    for (const elsewhere of [
      { rpId: "xn--lnbort-iua.no.example", origin: site.origin },
      { rpId: site.rpId, origin: "https://lanbort.vercel.app" },
      { rpId: "evil.example", origin: "https://evil.example" },
    ]) {
      const challenge = randomBytes(32);
      const options = await ceremonies.registrationOptions({
        challenge,
        userHandle: randomBytes(16),
        userName: "x",
        existing: [],
      });

      expect(
        await ceremonies.verifyRegistration({
          response: new TestPasskey(elsewhere).register(options),
          challenge,
        }),
      ).toBeNull();
    }

    // A confirmation phished through another site fails the same way.
    const { credential } = await registered();
    const phished = new TestPasskey({
      ...site,
      origin: "https://evil.example",
    });
    expect(await confirm(phished, credential)).toBeNull();
  });

  it("refuses a response to another challenge, without user verification, or replayed", async () => {
    const { passkey, credential } = await registered();
    const challenge = randomBytes(32);
    const options = await ceremonies.confirmationOptions({
      challenge,
      allowed: [credential],
    });
    const answer = passkey.confirm(options);

    expect(
      await ceremonies.verifyConfirmation({
        response: answer,
        challenge: randomBytes(32),
        credential,
      }),
    ).toBeNull();

    // The counter moved on, so the same answer cannot be used again.
    expect(
      await ceremonies.verifyConfirmation({
        response: answer,
        challenge,
        credential: { ...credential, signCount: 5 },
      }),
    ).toBeNull();

    const bareTap = new TestPasskey({ ...site, withoutUserVerification: true });
    const challenge2 = randomBytes(32);
    expect(
      await ceremonies.verifyRegistration({
        response: bareTap.register(
          await ceremonies.registrationOptions({
            challenge: challenge2,
            userHandle: randomBytes(16),
            userName: "x",
            existing: [],
          }),
        ),
        challenge: challenge2,
      }),
    ).toBeNull();
  });

  it("treats malformed answers as a failed check", async () => {
    const { credential } = await registered();

    for (const response of [null, {}, { id: "x", response: {} }, "junk"]) {
      expect(
        await ceremonies.verifyConfirmation({
          response,
          challenge: randomBytes(32),
          credential,
        }),
      ).toBeNull();
    }
    expect(ceremonies.credentialIdOf({})).toBeNull();
  });

  it("takes the relying party from configuration, and only one that fits the address", () => {
    expect(passkeyConfigFor("http://localhost:3000")).toEqual({
      rpId: "localhost",
      rpName: "Lånbort",
      origins: ["http://localhost:3000"],
    });
    expect(() =>
      passkeyConfigFor("https://lanbort.vercel.app", "xn--lnbort-iua.no"),
    ).toThrow();
  });
});

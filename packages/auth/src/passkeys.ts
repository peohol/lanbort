import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

/**
 * WebAuthn for platform stewards (ADR-0011, OD-0023): the only place that
 * knows the WebAuthn library. Lånbort verifies passkeys itself on the server
 * instead of using the auth provider's experimental factor; the domain
 * decides who may do what with the result.
 *
 * The relying party comes from the server's configuration, never from the
 * request: a response made for another domain or origin fails. Every
 * ceremony requires user verification (fingerprint, face, PIN), and no
 * attestation is asked for.
 */
export interface PasskeyConfig {
  /** The domain passkeys are bound to, e.g. `xn--lnbort-iua.no`. */
  readonly rpId: string;
  readonly rpName: string;
  /** Exact origins the browser may answer from, e.g. the app's address. */
  readonly origins: readonly string[];
}

export interface PasskeyCredential {
  readonly id: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly signCount: number;
  readonly transports: readonly string[];
}

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromB64url = (value: string) =>
  new Uint8Array(Buffer.from(value, "base64url"));

const timeout = 5 * 60 * 1000;

/** The relying party's settings from the app's public address. */
export function passkeyConfigFor(appUrl: string, rpId?: string): PasskeyConfig {
  const url = new URL(appUrl);
  const id = rpId ?? url.hostname;

  // WebAuthn only binds a passkey to the origin's own host or a domain it
  // belongs to; anything else would fail in every browser.
  if (url.hostname !== id && !url.hostname.endsWith(`.${id}`)) {
    throw new Error("The passkey domain must contain the app's host");
  }

  return { rpId: id, rpName: "Lånbort", origins: [url.origin] };
}

function descriptor(credential: PasskeyCredential) {
  return {
    id: b64url(credential.id),
    transports: [...credential.transports],
  };
}

/** Failing checks, malformed input and wrong origins are all just «no». */
async function orNull<T>(check: () => Promise<T | null>): Promise<T | null> {
  try {
    return await check();
  } catch {
    return null;
  }
}

export function createPasskeyCeremonies(config: PasskeyConfig) {
  const expected = {
    expectedOrigin: [...config.origins],
    expectedRPID: config.rpId,
    requireUserVerification: true,
  };

  return {
    registrationOptions: ({
      challenge,
      userHandle,
      userName,
      existing,
    }: {
      challenge: Uint8Array;
      userHandle: Uint8Array;
      userName: string;
      existing: readonly PasskeyCredential[];
    }) =>
      generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpId,
        userName,
        userID: new Uint8Array(userHandle),
        userDisplayName: userName,
        challenge: new Uint8Array(challenge),
        timeout,
        attestationType: "none",
        excludeCredentials: existing.map(descriptor),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
      }),

    verifyRegistration: ({
      response,
      challenge,
    }: {
      response: unknown;
      challenge: Uint8Array;
    }) =>
      orNull(async () => {
        const result = await verifyRegistrationResponse({
          response: response as RegistrationResponseJSON,
          expectedChallenge: b64url(challenge),
          ...expected,
        });

        if (!result.verified) {
          return null;
        }

        const { credential } = result.registrationInfo;

        return {
          id: fromB64url(credential.id),
          publicKey: new Uint8Array(credential.publicKey),
          signCount: credential.counter,
          transports: credential.transports ?? [],
        } satisfies PasskeyCredential;
      }),

    confirmationOptions: ({
      challenge,
      allowed,
    }: {
      challenge: Uint8Array;
      allowed: readonly PasskeyCredential[];
    }) =>
      generateAuthenticationOptions({
        rpID: config.rpId,
        challenge: new Uint8Array(challenge),
        allowCredentials: allowed.map(descriptor),
        userVerification: "required",
        timeout,
      }),

    credentialIdOf: (response: unknown): Uint8Array | null => {
      const id = (response as { id?: unknown } | null)?.id;

      return typeof id === "string" && id.length > 0 ? fromB64url(id) : null;
    },

    verifyConfirmation: ({
      response,
      challenge,
      credential,
    }: {
      response: unknown;
      challenge: Uint8Array;
      credential: PasskeyCredential;
    }) =>
      orNull(async () => {
        const result = await verifyAuthenticationResponse({
          response: response as AuthenticationResponseJSON,
          expectedChallenge: b64url(challenge),
          ...expected,
          credential: {
            id: b64url(credential.id),
            publicKey: new Uint8Array(credential.publicKey),
            counter: credential.signCount,
            transports: [...credential.transports],
          },
        });

        return result.verified
          ? { signCount: result.authenticationInfo.newCounter }
          : null;
      }),
  };
}

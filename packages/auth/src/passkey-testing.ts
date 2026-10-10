import {
  createHash,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
} from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * A software authenticator for tests: real ES256 keys and the bytes a
 * browser and a passkey produce, so the server's verification runs
 * unchanged. Never imported by production code.
 */

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const sha256 = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest();

/** Flags: user present, user verified, and attested credential data. */
const userPresent = 0x01;
const userVerified = 0x04;
const attestedData = 0x40;

function counter(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function coseKey(publicKey: KeyObject): Uint8Array {
  const jwk = publicKey.export({ format: "jwk" });

  return isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, Buffer.from(jwk.x as string, "base64url")],
      [-3, Buffer.from(jwk.y as string, "base64url")],
    ]),
  );
}

function clientData(type: string, challenge: string, origin: string) {
  return Buffer.from(
    JSON.stringify({ type, challenge, origin, crossOrigin: false }),
  );
}

export interface TestPasskeyOptions {
  readonly rpId: string;
  readonly origin: string;
  /** Answer without user verification, as a bare security key tap would. */
  readonly withoutUserVerification?: boolean;
}

/** One passkey on one test authenticator. */
export class TestPasskey {
  readonly credentialId = randomBytes(32);
  private readonly keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  private signCount = 0;

  constructor(private readonly options: TestPasskeyOptions) {}

  private flags(extra = 0) {
    return (
      userPresent |
      (this.options.withoutUserVerification ? 0 : userVerified) |
      extra
    );
  }

  /** What `navigator.credentials.create()` returns, as JSON. */
  register(creationOptions: object) {
    const { challenge } = creationOptions as { challenge: string };
    const authData = Buffer.concat([
      sha256(this.options.rpId),
      Buffer.from([this.flags(attestedData)]),
      counter(this.signCount),
      Buffer.alloc(16), // AAGUID: none
      Buffer.from([0, this.credentialId.length]),
      this.credentialId,
      coseKey(this.keys.publicKey),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]) as never,
    );
    const id = b64url(this.credentialId);

    return {
      id,
      rawId: id,
      type: "public-key" as const,
      response: {
        clientDataJSON: b64url(
          clientData("webauthn.create", challenge, this.options.origin),
        ),
        attestationObject: b64url(attestationObject),
        transports: ["usb"],
      },
      clientExtensionResults: {},
    };
  }

  /** What `navigator.credentials.get()` returns, as JSON. */
  confirm(requestOptions: object) {
    const { challenge } = requestOptions as { challenge: string };
    this.signCount += 1;
    const authData = Buffer.concat([
      sha256(this.options.rpId),
      Buffer.from([this.flags()]),
      counter(this.signCount),
    ]);
    const clientDataJSON = clientData(
      "webauthn.get",
      challenge,
      this.options.origin,
    );
    const signature = sign(
      "sha256",
      Buffer.concat([authData, sha256(clientDataJSON)]),
      this.keys.privateKey,
    );
    const id = b64url(this.credentialId);

    return {
      id,
      rawId: id,
      type: "public-key" as const,
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
      },
      clientExtensionResults: {},
    };
  }
}

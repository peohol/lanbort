import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import {
  type ChatSignaturePurpose,
  chatSignatureLabel,
  type DeviceCertificateWire,
  type DeviceRevocationWire,
  deviceCertificateBody,
  deviceRevocationBody,
} from "@lanbort/contracts";

/**
 * Test doubles for what a chat client sends: real Ed25519 certificates and
 * revocations, and MLS messages that are well formed up to the fields the
 * delivery service reads (mls.test.ts checks them against real ones). The
 * rest is random bytes, as ciphertext looks to the server.
 */

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);

  return {
    publicKey: b64(raw),
    sign: (purpose: ChatSignaturePurpose, body: string) =>
      b64(
        sign(null, Buffer.from(chatSignatureLabel(purpose) + body), privateKey),
      ),
  };
}

export interface TestChatAccount {
  readonly accountId: string;
  readonly accountKey: string;
  certify(deviceId: string, deviceKey: string): DeviceCertificateWire;
  revoke(deviceId: string): DeviceRevocationWire;
}

export function testChatAccount(accountId: string): TestChatAccount {
  const key = keyPair();
  const accountKey = key.publicKey;

  return {
    accountId,
    accountKey,
    certify: (deviceId, deviceKey) => {
      const body = { accountId, deviceId, deviceKey, accountKey };
      return {
        v: 1,
        ...body,
        signature: key.sign("device-certificate", deviceCertificateBody(body)),
      };
    },
    revoke: (deviceId) => {
      const body = { accountId, deviceId, accountKey };
      return {
        v: 1,
        ...body,
        signature: key.sign("device-revocation", deviceRevocationBody(body)),
      };
    },
  };
}

export interface TestChatDevice {
  readonly deviceId: string;
  readonly deviceKey: string;
  readonly certificate: DeviceCertificateWire;
  /** A key package this device made for itself. */
  keyPackage(): string;
}

/** A new device; `certifiedBy` is the account key that certifies it. */
export function testChatDevice(certifiedBy: TestChatAccount): TestChatDevice {
  const deviceId = randomUUID();
  const deviceKey = keyPair().publicKey;
  const certificate = certifiedBy.certify(deviceId, deviceKey);

  return {
    deviceId,
    deviceKey,
    certificate,
    keyPackage: () =>
      encodeKeyPackage(
        Buffer.from(deviceKey, "base64"),
        Buffer.from(JSON.stringify(certificate)),
      ),
  };
}

const uint16 = (value: number) => [value >> 8, value & 0xff];

/** A variable-length vector (RFC 9420 §2.1.2). */
function vector(bytes: Uint8Array): number[] {
  const n = bytes.length;
  const prefix =
    n < 0x40
      ? [n]
      : n < 0x4000
        ? [0x40 | (n >> 8), n & 0xff]
        : [0x80 | (n >> 24), (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  return [...prefix, ...bytes];
}

const encode = (parts: number[]) => b64(Uint8Array.from(parts));
const mls10 = uint16(1);
const ciphersuite = uint16(1);

export function encodeKeyPackage(
  signatureKey: Uint8Array,
  identity: Uint8Array,
): string {
  return encode([
    ...mls10,
    ...uint16(5),
    ...mls10,
    ...ciphersuite,
    ...vector(randomBytes(32)),
    ...vector(randomBytes(32)),
    ...vector(signatureKey),
    ...uint16(1),
    ...vector(identity),
    ...randomBytes(96),
  ]);
}

export function encodePrivateMessage(
  groupId: string,
  epoch: number,
  contentType: "application" | "commit" | "proposal",
  ciphertextBytes = 64,
): string {
  const epochBytes = Array.from({ length: 8 }, (_, i) =>
    Number((BigInt(epoch) >> BigInt(8 * (7 - i))) & 0xffn),
  );
  return encode([
    ...mls10,
    ...uint16(2),
    ...vector(Buffer.from(groupId)),
    ...epochBytes,
    { application: 1, proposal: 2, commit: 3 }[contentType],
    ...vector(new Uint8Array()),
    ...vector(randomBytes(24)),
    ...vector(randomBytes(ciphertextBytes)),
  ]);
}

export function encodeWelcome(): string {
  return encode([
    ...mls10,
    ...uint16(3),
    ...ciphersuite,
    ...vector(randomBytes(120)),
    ...vector(randomBytes(200)),
  ]);
}

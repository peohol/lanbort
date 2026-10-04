import { createPublicKey, verify } from "node:crypto";
import {
  type ChatSignaturePurpose,
  chatSignatureLabel,
  type DeviceCertificateWire,
  type DeviceRevocationWire,
  deviceCertificateBody,
  deviceRevocationBody,
} from "@lanbort/contracts";

/** DER prefix that makes a raw Ed25519 public key an SPKI structure. */
const ed25519Spki = Buffer.from("302a300506032b6570032100", "hex");

export const fromBase64 = (value: string) => Buffer.from(value, "base64");
export const toBase64 = (value: Uint8Array) =>
  Buffer.from(value).toString("base64");

/**
 * Checks one of Lånbort's own signatures (ADR-0010 §3). The server checks
 * certificates and revocations as defence in depth: every client checks
 * them itself against the account key it has pinned, and never trusts the
 * server's word.
 */
export function verifyChatSignature(
  purpose: ChatSignaturePurpose,
  publicKey: Uint8Array,
  body: string,
  signature: Uint8Array,
): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) {
    return false;
  }

  try {
    return verify(
      null,
      Buffer.from(chatSignatureLabel(purpose) + body, "utf8"),
      createPublicKey({
        key: Buffer.concat([ed25519Spki, publicKey]),
        format: "der",
        type: "spki",
      }),
      signature,
    );
  } catch {
    return false;
  }
}

export const certificateIsSigned = (c: DeviceCertificateWire) =>
  verifyChatSignature(
    "device-certificate",
    fromBase64(c.accountKey),
    deviceCertificateBody(c),
    fromBase64(c.signature),
  );

export const revocationIsSigned = (r: DeviceRevocationWire) =>
  verifyChatSignature(
    "device-revocation",
    fromBase64(r.accountKey),
    deviceRevocationBody(r),
    fromBase64(r.signature),
  );

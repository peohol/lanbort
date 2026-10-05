import {
  type CiphersuiteImpl,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
} from "ts-mls";

/**
 * The one MLS ciphersuite Lånbort uses (ADR-0010): RFC 9420's
 * mandatory-to-implement suite, X25519 + AES-128-GCM + SHA-256 + Ed25519.
 * Changing it means creating new groups, so it is set here and nowhere else.
 */
export const CIPHERSUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

let suite: Promise<CiphersuiteImpl> | undefined;

export function loadSuite(): Promise<CiphersuiteImpl> {
  suite ??= getCiphersuiteImpl(getCiphersuiteFromName(CIPHERSUITE));
  return suite;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const utf8 = (text: string): Uint8Array<ArrayBuffer> =>
  encoder.encode(text);
export const fromUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}

/**
 * Lånbort's own signatures (device certificates, revocations) are prefixed
 * with a purpose label so a signature made for one purpose can never be
 * replayed as another, or as an MLS signature.
 */
export type SignaturePurpose = "device-certificate" | "device-revocation";

const labelled = (purpose: SignaturePurpose, content: Uint8Array) => {
  const label = utf8(`Lanbort ${purpose} v1\0`);
  const message = new Uint8Array(label.length + content.length);
  message.set(label);
  message.set(content, label.length);
  return message;
};

export async function signFor(
  purpose: SignaturePurpose,
  signKey: Uint8Array,
  content: Uint8Array,
): Promise<Uint8Array> {
  const { signature } = await loadSuite();
  return signature.sign(signKey, labelled(purpose, content));
}

export async function verifyFor(
  purpose: SignaturePurpose,
  publicKey: Uint8Array,
  content: Uint8Array,
  signatureBytes: Uint8Array,
): Promise<boolean> {
  const { signature } = await loadSuite();
  try {
    return await signature.verify(
      publicKey,
      labelled(purpose, content),
      signatureBytes,
    );
  } catch {
    return false;
  }
}

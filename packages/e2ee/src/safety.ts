import { utf8 } from "./suite";

/**
 * The security code two contacts compare to rule out that the server swapped
 * an account key (ADR-0010 §3). It follows Signal's numeric fingerprint:
 * 5200 rounds of SHA-512 over each account's key and id, 30 digits each,
 * the lower half first, so both see the same 60 digits.
 */
const iterations = 5200;
const version = new Uint8Array([0, 0]);

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const sha512 = async (data: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest("SHA-512", data));

async function half(accountId: string, accountKey: Uint8Array) {
  let hash = await sha512(concat(version, accountKey, utf8(accountId)));
  for (let i = 0; i < iterations; i++) {
    hash = await sha512(concat(hash, accountKey));
  }
  let digits = "";
  for (let chunk = 0; chunk < 6; chunk++) {
    let value = 0;
    for (let i = 0; i < 5; i++) value = value * 256 + hash[chunk * 5 + i]!;
    digits += String(value % 100000).padStart(5, "0");
  }
  return digits;
}

export interface AccountIdentity {
  accountId: string;
  accountKey: Uint8Array;
}

/** 60 digits, the same on both sides, in 12 groups of 5 for display. */
export async function securityCode(
  a: AccountIdentity,
  b: AccountIdentity,
): Promise<string[]> {
  const halves = (
    await Promise.all([
      half(a.accountId, a.accountKey),
      half(b.accountId, b.accountKey),
    ])
  ).sort();
  return halves.join("").match(/\d{5}/g)!;
}

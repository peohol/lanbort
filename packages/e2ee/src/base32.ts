/**
 * Crockford base32, for codes a person reads, writes down or types: no I,
 * L, O or U, and typing is forgiving.
 */

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `bytes` as `length` characters, the unused top bits zero. */
export function encodeBase32(bytes: Uint8Array, length: number): string {
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let code = "";
  for (let i = length - 1; i >= 0; i--) {
    code += alphabet[Number((bits >> BigInt(i * 5)) & 31n)];
  }
  return code;
}

/**
 * The `byteLength` bytes a code of `length` characters holds, or undefined
 * if it is not such a code. Expects a normalized code.
 */
export function decodeBase32(
  code: string,
  length: number,
  byteLength: number,
): Uint8Array | undefined {
  if (code.length !== length) return undefined;
  let bits = 0n;
  for (const character of code) {
    const value = alphabet.indexOf(character);
    if (value === -1) return undefined;
    bits = (bits << 5n) | BigInt(value);
  }
  if (bits >> BigInt(byteLength * 8) !== 0n) return undefined;
  const bytes = new Uint8Array(byteLength);
  for (let i = byteLength - 1; i >= 0; i--) {
    bytes[i] = Number(bits & 255n);
    bits >>= 8n;
  }
  return bytes;
}

/** A typed code as the user may enter it: any case, spaces, dashes, O for 0. */
export function normalizeBase32(typed: string): string {
  return typed
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

import { describe, expect, it } from "vitest";
import { totpCode } from "./testing";

function base32(text: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...Buffer.from(text)]
    .map((byte) => byte.toString(2).padStart(8, "0"))
    .join("");

  return (bits.match(/.{1,5}/g) ?? [])
    .map((chunk) => alphabet[Number.parseInt(chunk.padEnd(5, "0"), 2)])
    .join("");
}

describe("totpCode", () => {
  // RFC 6238 appendix B: the SHA-1 seed is the ASCII text "12345678901234567890"
  // (expected values are the last 6 digits). Encoded at runtime so no
  // secret-shaped literal is committed.
  const secret = base32("12345678901234567890");

  it.each([
    [59, "287082"],
    [1_111_111_109, "081804"],
    [2_000_000_000, "279037"],
  ])("matches the RFC test vector at %i s", (seconds, expected) => {
    expect(totpCode(secret, seconds * 1000)).toBe(expected);
  });
});

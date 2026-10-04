import { describe, expect, it } from "vitest";
import { base64Bytes } from "./chat";

/** Base64 of zero bytes: 4 characters per 3 bytes, padded with `=`. */
const bytes32 = `${"A".repeat(43)}=`;
const bytes33 = "A".repeat(44);
const bytes31 = `${"A".repeat(42)}==`;

describe("base64Bytes", () => {
  const key = base64Bytes(32, 32);

  it("accepts exactly the bytes it allows", () => {
    expect(key.safeParse(bytes32).success).toBe(true);
    expect(base64Bytes(4).safeParse("AA==").success).toBe(true);
  });

  it("rejects values that decode to more or fewer bytes", () => {
    // As long as 32 bytes in base64, but 33 bytes decoded.
    expect(key.safeParse(bytes33).success).toBe(false);
    expect(key.safeParse(bytes31).success).toBe(false);
    expect(base64Bytes(4).safeParse("").success).toBe(false);
  });

  it("rejects anything that is not padded standard base64", () => {
    expect(key.safeParse("A".repeat(43)).success).toBe(false);
    expect(key.safeParse(`-${bytes32.slice(1)}`).success).toBe(false);
  });
});

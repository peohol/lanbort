import { describe, expect, it } from "vitest";
import { idempotencyKeyPattern, requestHash } from "./idempotency";

describe("idempotency request hash", () => {
  it("is independent of object key order", () => {
    expect(requestHash({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(
      requestHash({ b: { d: "x", c: [1, 2] }, a: 1 }),
    );
  });

  it("changes when the logical input changes", () => {
    expect(requestHash({ a: 1 })).not.toBe(requestHash({ a: 2 }));
    expect(requestHash({ list: [1, 2] })).not.toBe(
      requestHash({ list: [2, 1] }),
    );
  });

  it("ignores undefined fields like JSON does", () => {
    expect(requestHash({ a: 1, b: undefined })).toBe(requestHash({ a: 1 }));
  });
});

describe("idempotency key format", () => {
  it.each([
    ["a UUID", "7f1d3c4e-2b9a-4c1e-9f0a-1b2c3d4e5f60", true],
    ["too short", "abc", false],
    ["contains spaces", "key with spaces 123456", false],
    ["too long", "k".repeat(129), false],
  ])("%s", (_name, key, valid) => {
    expect(idempotencyKeyPattern.test(key)).toBe(valid);
  });
});

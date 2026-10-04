import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address";

const from = (forwardedFor?: string) =>
  clientAddress({
    headers: new Headers(
      forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
    ),
  });

describe("client address for rate limits", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["203.0.113.7, 10.0.0.1", "203.0.113.7"],
    ["2001:DB8::1", "2001:db8::1"],
  ])(
    "uses the first address the platform forwarded (%s)",
    (header, address) => {
      expect(from(header)).toBe(address);
    },
  );

  it.each([
    ["no header", undefined],
    ["loopback", "127.0.0.1"],
    ["IPv6 loopback", "::1"],
    ["mapped loopback", "::ffff:127.0.0.1"],
    ["something else", "evil<script>"],
    ["empty", ""],
  ])("knows no client for %s", (_, header) => {
    expect(from(header)).toBeNull();
  });
});

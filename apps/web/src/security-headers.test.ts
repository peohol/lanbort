import { describe, expect, it } from "vitest";
import { getSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("establishes a restrictive phase 0 browser baseline", () => {
    const headers = new Map(
      getSecurityHeaders().map(({ key, value }) => [key, value]),
    );

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");

    const csp = headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("only relaxes eval for the local development server", () => {
    const csp = new Map(
      getSecurityHeaders({ development: true }).map(({ key, value }) => [
        key,
        value,
      ]),
    ).get("Content-Security-Policy");

    expect(csp).toContain("'unsafe-eval'");
  });
});

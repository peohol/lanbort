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
    // The map loads its worker from the app and tiles from Kartverket only.
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("connect-src 'self' https://cache.kartverket.no");
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=(self)",
    );
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

  it("lets chat pages run only the request's own scripts", () => {
    const headers = (camera: boolean) =>
      new Map(
        getSecurityHeaders({ chat: { nonce: "abc123", camera } }).map(
          ({ key, value }) => [key, value],
        ),
      );
    const csp = headers(false).get("Content-Security-Policy")!;
    const scripts = csp.split("; ").find((d) => d.startsWith("script-src"));

    expect(scripts).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("kartverket");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers(false).get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(headers(true).get("Permissions-Policy")).toBe(
      "camera=(self), microphone=(), geolocation=()",
    );
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSecurityHeaders, unproxiedPaths } from "./security-headers";

const headersOf = (...options: Parameters<typeof getSecurityHeaders>) =>
  new Map(getSecurityHeaders(...options).map(({ key, value }) => [key, value]));

const scriptsOf = (csp: string) =>
  csp.split("; ").find((d) => d.startsWith("script-src"));

describe("security headers", () => {
  it("establishes a restrictive browser baseline", () => {
    const headers = headersOf({ nonce: "abc123" });

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");

    const csp = headers.get("Content-Security-Policy")!;
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

  it("never lets an inline script run without the page's nonce", () => {
    // The chat keys live in the whole origin's storage (ADR-0010 §10, §13).
    expect(
      scriptsOf(headersOf({ nonce: "abc123" }).get("Content-Security-Policy")!),
    ).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(scriptsOf(headersOf().get("Content-Security-Policy")!)).toBe(
      "script-src 'self'",
    );
  });

  it("only relaxes eval for the local development server", () => {
    expect(
      headersOf({ development: true }).get("Content-Security-Policy"),
    ).toContain("'unsafe-eval'");
  });

  it("lets chat pages load nothing from elsewhere, and only the approval page use the camera", () => {
    const headers = (camera: boolean) =>
      headersOf({ nonce: "abc123", chat: { camera } });
    const csp = headers(false).get("Content-Security-Policy")!;

    expect(scriptsOf(csp)).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic'",
    );
    expect(csp).not.toContain("kartverket");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers(false).get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(headers(true).get("Permissions-Policy")).toBe(
      "camera=(self), microphone=(), geolocation=()",
    );
  });

  it("covers in the Next.js config exactly what the proxy does not see", () => {
    const proxy = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");
    const excluded = /\(\?!([^)]*)\)/.exec(proxy)![1]!.split("|");
    const prefixes = unproxiedPaths.map((path) =>
      path.replace(/^\//, "").replace(/\/?:path\*$/, ""),
    );

    expect(
      prefixes.map((prefix) =>
        excluded.some((part) => part.replace(/\/$/, "") === prefix),
      ),
    ).toEqual(prefixes.map(() => true));
    expect(excluded).toHaveLength(prefixes.length);
  });
});

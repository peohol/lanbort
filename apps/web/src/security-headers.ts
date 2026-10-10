import { mapProvider } from "./map/provider";

export interface SecurityHeaderOptions {
  /** `next dev` needs `eval` for React's development tooling; never in production. */
  development?: boolean;
  /**
   * This page's script nonce, fresh for each request (`src/proxy.ts`).
   * Scripts run only with it, and what they load (`'strict-dynamic'`).
   * Without one, as for the files the proxy does not see, no inline script
   * runs at all. No page allows `'unsafe-inline'` for scripts: the chat
   * keys live in the whole origin's storage, so a script injected anywhere
   * could reach them (ADR-0010 §10, §13).
   */
  nonce?: string;
  /**
   * A private chat page (ADR-0010 §13): nothing is loaded from another
   * origin, and only the approval page may use the camera.
   */
  chat?: { camera: boolean };
}

const buildContentSecurityPolicy = ({
  development = false,
  nonce,
  chat,
}: SecurityHeaderOptions) => {
  const eval_ = development ? " 'unsafe-eval'" : "";
  // Map tiles come from the map provider only (ADR-0008); chat pages have
  // no map.
  const map = chat ? "" : ` ${mapProvider.origin}`;
  const scripts = nonce ? ` 'nonce-${nonce}' 'strict-dynamic'` : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' blob: data:${map}`,
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self'${scripts}${eval_}`,
    // The map's worker is served by the app itself (WP-62).
    "worker-src 'self'",
    `connect-src 'self'${map}`,
  ].join("; ");
};

const permissionsPolicy = ({ chat }: SecurityHeaderOptions) =>
  chat
    ? `camera=${chat.camera ? "(self)" : "()"}, microphone=(), geolocation=()`
    : // «Bruk der jeg er» in Finn asks once, on this site only (WP-62).
      "camera=(), microphone=(), geolocation=(self)";

export function getSecurityHeaders(
  options: SecurityHeaderOptions = {},
): Array<{ key: string; value: string }> {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options),
    },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    // No other site's window keeps a handle on the app's, and no other site
    // may embed its responses.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: permissionsPolicy(options) },
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    },
  ];
}

/**
 * What the proxy does not see (its `matcher` in `src/proxy.ts`): files and
 * the scheduler's and health check's routes. They get the headers from the
 * Next.js config instead, without a nonce. Every other path gets its
 * headers, with a fresh nonce, from the proxy.
 */
export const unproxiedPaths = [
  "/_next/static/:path*",
  "/_next/image/:path*",
  "/favicon.ico",
  "/fonts/:path*",
  "/maplibre/:path*",
  "/api/health",
  "/api/internal/:path*",
] as const;

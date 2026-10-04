import { mapProvider } from "./map/provider";

export interface SecurityHeaderOptions {
  /** `next dev` needs `eval` for React's development tooling; never in production. */
  development?: boolean;
}

const buildContentSecurityPolicy = ({
  development = false,
}: SecurityHeaderOptions) =>
  [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' blob: data: ${mapProvider.origin}`,
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    // The map's worker is served by the app itself (WP-62).
    "worker-src 'self'",
    // Map tiles are fetched from the map provider only (ADR-0008).
    `connect-src 'self' ${mapProvider.origin}`,
  ].join("; ");

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
    {
      key: "Permissions-Policy",
      // «Bruk der jeg er» in Finn asks once, on this site only (WP-62).
      value: "camera=(), microphone=(), geolocation=(self)",
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    },
  ];
}

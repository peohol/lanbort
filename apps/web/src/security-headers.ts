import { mapProvider } from "./map/provider";

export interface SecurityHeaderOptions {
  /** `next dev` needs `eval` for React's development tooling; never in production. */
  development?: boolean;
  /**
   * A private chat page (ADR-0010 §13): scripts run only with this
   * request's nonce, and nothing is loaded from another origin.
   */
  chat?: { nonce: string; camera: boolean };
}

const buildContentSecurityPolicy = ({
  development = false,
  chat,
}: SecurityHeaderOptions) => {
  const eval_ = development ? " 'unsafe-eval'" : "";
  // Map tiles come from the map provider only (ADR-0008); chat pages have
  // no map.
  const map = chat ? "" : ` ${mapProvider.origin}`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' blob: data:${map}`,
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    chat
      ? `script-src 'self' 'nonce-${chat.nonce}' 'strict-dynamic'${eval_}`
      : `script-src 'self' 'unsafe-inline'${eval_}`,
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
    { key: "Permissions-Policy", value: permissionsPolicy(options) },
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    },
  ];
}

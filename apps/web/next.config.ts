import { existsSync } from "node:fs";
import type { NextConfig } from "next";
import { getSecurityHeaders, unproxiedPaths } from "./src/security-headers";

// Local development reads the repository's single .env. Variables that are
// already set (CI, Vercel) always win: loadEnvFile never overrides them.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The stable lanbort.vercel.app alias is deliberately usable as an
  // alternative entry point for ordinary app use. Passkey ceremonies move to
  // APP_URL because WebAuthn is bound to that relying-party origin. Other
  // Vercel preview/deployment addresses send pages to APP_URL, so sessions and
  // links do not fragment across disposable origins. APIs and scheduled jobs
  // answer everywhere.
  async redirects() {
    if (!process.env.APP_URL) return [];
    const { host, origin } = new URL(process.env.APP_URL);

    return [
      {
        source: "/:path((?!api/|_next/).*)",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        missing: [
          { type: "host", value: "lanbort\\.vercel\\.app" },
          { type: "host", value: host.replaceAll(".", "\\.") },
        ],
        destination: `${origin}/:path`,
        permanent: false,
      },
    ];
  },
  async headers() {
    // Pages get their headers, with a fresh script nonce, from the proxy
    // (`src/proxy.ts`); this covers what it does not see.
    return unproxiedPaths.map((source) => ({
      source,
      headers: getSecurityHeaders({
        development: process.env.NODE_ENV === "development",
      }),
    }));
  },
};

export default nextConfig;

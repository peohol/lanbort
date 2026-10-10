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
  // Pages on Vercel's own addresses send people to the app's public address
  // (APP_URL, production), so sessions and links stay on one origin. The
  // domain's other names are redirected by Vercel itself, so this can never
  // loop with them. APIs, and the scheduled jobs Vercel calls on its own
  // address, answer on every address.
  async redirects() {
    if (!process.env.APP_URL) return [];
    const { host, origin } = new URL(process.env.APP_URL);

    return [
      {
        source: "/:path((?!api/|_next/).*)",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        missing: [{ type: "host", value: host.replaceAll(".", "\\.") }],
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

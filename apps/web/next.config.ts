import { existsSync } from "node:fs";
import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/security-headers";

// Local development reads the repository's single .env. Variables that are
// already set (CI, Vercel) always win: loadEnvFile never overrides them.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Pages answer on the app's public address only (APP_URL, production), so
  // sessions and links stay on one origin. APIs, and the scheduled jobs
  // Vercel calls on its own address, answer on every address.
  async redirects() {
    if (!process.env.APP_URL) return [];
    const { host, origin } = new URL(process.env.APP_URL);

    return [
      {
        source: "/:path((?!api/|_next/).*)",
        missing: [{ type: "host", value: host.replaceAll(".", "\\.") }],
        destination: `${origin}/:path`,
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // Chat pages get stricter headers with a nonce from the proxy
        // (`src/proxy.ts`, ADR-0010 §13).
        source: "/((?!samtaler(?:/|$)).*)",
        headers: getSecurityHeaders({
          development: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default nextConfig;

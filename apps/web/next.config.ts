import { existsSync, readdirSync } from "node:fs";
import type { NextConfig } from "next";
import { movedChatPages } from "./src/navigation/chat";
import { getSecurityHeaders, unproxiedPaths } from "./src/security-headers";

// Local development reads the repository's single .env. Variables that are
// already set (CI, Vercel) always win: loadEnvFile never overrides them.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// The migrations this build is made with, for the pilot's readiness check
// that the database has them all (`builtMigrations`).
const migrations = readdirSync(
  new URL("../../supabase/migrations/", import.meta.url),
)
  .map((name) => /^(\d{14})_.*\.sql$/.exec(name)?.[1])
  .filter(Boolean)
  .join(",");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { LANBORT_MIGRATIONS: migrations },
  reactStrictMode: true,
  // The stable lanbort.vercel.app alias is deliberately usable as an
  // alternative entry point for ordinary app use. Platform-steward pages that
  // depend on WebAuthn are stopped by the proxy on that alias because neither
  // passkeys nor session cookies can cross to APP_URL. Other Vercel
  // preview/deployment addresses send pages to APP_URL, so sessions and links
  // do not fragment across disposable origins. APIs and scheduled jobs answer
  // everywhere.
  async redirects() {
    // Pages that have moved: links to where they were still lead to them.
    const moved = movedChatPages.map(({ from, to }) => ({
      source: `${from}/:rest*`,
      destination: `${to}/:rest*`,
      permanent: false,
    }));
    if (!process.env.APP_URL) return moved;
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
      ...moved,
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

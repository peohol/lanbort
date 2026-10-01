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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: getSecurityHeaders({
          development: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default nextConfig;

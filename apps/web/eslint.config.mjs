import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const dataAndAuthModules = [
  "@lanbort/database",
  "@lanbort/auth",
  "@supabase/*",
  "kysely",
  "pg",
];

export default defineConfig(
  ...nextVitals,
  ...nextTs,
  {
    // Data and auth providers are only reachable through src/server, where
    // the route boundary and the domain policies are applied (ADR-0002).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: dataAndAuthModules,
              message:
                "Use src/server (route boundary, commands and queries) instead of direct data or auth access.",
            },
          ],
        },
      ],
    },
  },
  {
    // Client components only talk to the HTTP API.
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...dataAndAuthModules, "@lanbort/domain", "@/server/*"],
              message:
                "Client components must call the API, not server modules.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
);

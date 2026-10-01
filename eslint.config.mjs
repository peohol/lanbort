import { defineConfig, globalIgnores } from "eslint/config";
import nextTs from "eslint-config-next/typescript";

export default defineConfig(
  ...nextTs,
  globalIgnores([
    "**/.next/**",
    "**/node_modules/**",
    "**/next-env.d.ts",
    "**/src/generated/**",
  ]),
);

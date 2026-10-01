// Loaded synchronously by kysely-codegen, so this file must be CommonJS.
const { existsSync } = require("node:fs");
const { join } = require("node:path");

// Local runs read the repository's .env; an exported DATABASE_URL (as in CI)
// always wins because loadEnvFile never overrides existing variables.
const rootEnv = join(__dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

module.exports = {
  dialect: "postgres",
  url: "env(DATABASE_URL)",
  includePattern: "app.*",
  outFile: "./src/generated/database.ts",
};

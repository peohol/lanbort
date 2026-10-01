import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const configPath = new URL("../../../supabase/config.toml", import.meta.url);

/** Reads `key = [ "a", "b" ]` from one `[section]` of a TOML file. */
function readStringArray(toml: string, section: string, key: string) {
  const body = toml
    .split(/^\[/m)
    .find((part) => part.startsWith(`${section}]`));
  const match = body?.match(new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m"));

  if (!match?.[1]) {
    throw new Error(`[${section}] ${key} is missing from supabase/config.toml`);
  }

  return [...match[1].matchAll(/"([^"]*)"/g)].map(([, value]) => value);
}

describe("Supabase Data API exposure", () => {
  const exposed = readStringArray(
    readFileSync(configPath, "utf8"),
    "api",
    "schemas",
  );

  it("never exposes the private application schema", () => {
    expect(exposed).not.toContain("app");
  });

  it("exposes only the schemas covered by the RLS guard in supabase/tests", () => {
    // Keep in sync with the schema list in supabase/tests/0001_phase0_foundation.test.sql.
    expect([...exposed].sort()).toEqual(["graphql_public", "public"]);
  });
});

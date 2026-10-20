import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fillGeneratedSections } from "./catalogue-docs";

/**
 * The pilot's documents show the catalogue's tables (pilot-ui.md
 * «Énkildemodell»). With PILOT_DOCS=write (`pnpm pilot:docs`) this writes
 * them; otherwise, as in CI, it fails when they differ from the catalogue.
 */
const documents = ["pilot-testmatrise.md", "pilot-testplan.md"].map((name) =>
  fileURLToPath(
    new URL(`../../../../docs/implementation/${name}`, import.meta.url),
  ),
);

describe("the pilot documents follow the catalogue", () => {
  it.each(documents)("%s", (path) => {
    const document = readFileSync(path, "utf8");
    const filled = fillGeneratedSections(document);

    expect(document).toContain("<!-- generert:");

    if (process.env.PILOT_DOCS === "write") {
      writeFileSync(path, filled);
    } else {
      expect(document, "run `pnpm pilot:docs`").toBe(filled);
    }
  });
});

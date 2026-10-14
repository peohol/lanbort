import { describe, expect, it } from "vitest";
import { requiresCanonicalStewardOrigin } from "./origins";

describe("canonical steward origin", () => {
  it.each([
    "/forvaltning",
    "/forvaltning/passkeys",
    "/forvaltning/saksgrunnlag",
    "/saker/abc/inngrep/sperr",
  ])("keeps %s on the canonical origin", (pathname) => {
    expect(requiresCanonicalStewardOrigin(pathname)).toBe(true);
  });

  it.each(["/", "/finn", "/saker", "/saker/abc", "/miljoer/abc"])(
    "allows ordinary app page %s on the stable Vercel alias",
    (pathname) => {
      expect(requiresCanonicalStewardOrigin(pathname)).toBe(false);
    },
  );
});

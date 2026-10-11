import { describe, expect, it } from "vitest";
import { basisSchema } from "./account";

describe("an intervention's basis", () => {
  it("keeps line breaks and tabs, trimmed at the ends", () => {
    expect(basisSchema.parse("  Første avsnitt.\r\n\n\tAndre avsnitt.\n")).toBe(
      "Første avsnitt.\r\n\n\tAndre avsnitt.",
    );
  });

  it("refuses other control characters, and nothing at all", () => {
    expect(basisSchema.safeParse("Grunnlag\u0007").success).toBe(false);
    expect(basisSchema.safeParse("Grunn\u0000lag").success).toBe(false);
    expect(basisSchema.safeParse(" \n\t ").success).toBe(false);
    expect(basisSchema.safeParse("x".repeat(2001)).success).toBe(false);
  });
});

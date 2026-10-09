import { describe, expect, it } from "vitest";
import { describeStatement, statedBy } from "./loan-condition";

describe("statements on damage, deficiency or loss", () => {
  it("say who told what, never as a fact", () => {
    expect(describeStatement({ you: false, realName: "Kari" })).toBe(
      "Kari opplyste",
    );
    expect(
      describeStatement({ you: true, realName: "Ola", kind: "disagreement" }),
    ).toBe("Du er uenig");
    expect(
      describeStatement({ you: false, realName: "Ola", kind: "explanation" }),
    ).toBe("Ola la til sin forklaring");
    expect(
      describeStatement({ you: true, realName: "Ola", kind: "explanation" }),
    ).toBe("Du la til din forklaring");
  });

  it("name a deleted account as a former user", () => {
    expect(statedBy({ you: false, realName: null })).toBe("Tidligere bruker");
  });
});

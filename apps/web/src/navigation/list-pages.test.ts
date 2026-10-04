import { describe, expect, it } from "vitest";
import { morePagesHref, pagesShown } from "./list-pages";

describe("pages of a list in the address", () => {
  it("shows one page unless the address names more", () => {
    expect(pagesShown({}, "avsluttede")).toBe(1);
    expect(pagesShown({ avsluttede: "3" }, "avsluttede")).toBe(3);

    for (const value of ["0", "-2", "1.5", "x", "", "1e400"]) {
      expect(pagesShown({ avsluttede: value }, "avsluttede")).toBe(1);
    }

    expect(pagesShown({ avsluttede: ["2", "3"] }, "avsluttede")).toBe(1);
  });

  it("asks for one more page and keeps every other choice", () => {
    expect(
      morePagesHref(
        "/lan",
        { side: "lender", pagaende: "2" },
        "avsluttede",
        "liste-avsluttede-lan",
      ),
    ).toBe("/lan?side=lender&pagaende=2&avsluttede=2#liste-avsluttede-lan");
    expect(morePagesHref("/lan", { pagaende: "2" }, "pagaende", "liste")).toBe(
      "/lan?pagaende=3#liste",
    );
  });
});

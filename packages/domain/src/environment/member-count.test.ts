import { describe, expect, it } from "vitest";
import { approximateMembers } from "./member-count";

describe("approximateMembers (PS-ENV-016)", () => {
  it("only says fewer than ten below ten", () => {
    for (const count of [0, 1, 9]) {
      expect(approximateMembers(count)).toEqual({
        kind: "fewer_than",
        count: 10,
      });
    }
  });

  it("rounds to the nearest ten from ten", () => {
    expect(approximateMembers(10)).toEqual({ kind: "about", count: 10 });
    expect(approximateMembers(14)).toEqual({ kind: "about", count: 10 });
    expect(approximateMembers(15)).toEqual({ kind: "about", count: 20 });
    expect(approximateMembers(137)).toEqual({ kind: "about", count: 140 });
  });
});

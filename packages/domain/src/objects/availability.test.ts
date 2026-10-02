import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDate,
  deriveAvailability,
  normalizeAvailability,
  subtractIntervals,
  toApiInterval,
} from "./availability";

const api = (start: string, end: string | null = null) => ({ start, end });

describe("normalizeAvailability (PS-OBJ-003)", () => {
  it("stores intervals sorted and half-open", () => {
    expect(
      normalizeAvailability([
        api("2030-03-01", "2030-03-10"),
        api("2030-01-01", "2030-01-31"),
      ]),
    ).toEqual([
      { from: "2030-01-01", until: "2030-02-01" },
      { from: "2030-03-01", until: "2030-03-11" },
    ]);
  });

  it("merges touching intervals into one logical space", () => {
    const merged = normalizeAvailability([
      api("2030-01-11", "2030-01-20"),
      api("2030-01-01", "2030-01-10"),
      api("2030-01-21"),
    ]);

    expect(merged).toEqual([{ from: "2030-01-01", until: null }]);
    expect(merged.map(toApiInterval)).toEqual([api("2030-01-01")]);
  });

  it("keeps separate intervals separate", () => {
    expect(
      normalizeAvailability([
        api("2030-01-01", "2030-01-10"),
        api("2030-01-12", "2030-01-20"),
      ]),
    ).toHaveLength(2);
  });

  it.each([
    [
      "the same day twice",
      [api("2030-01-01", "2030-01-10"), api("2030-01-10", "2030-01-20")],
      ["availability.0", "availability.1"],
    ],
    [
      "an interval inside another",
      [api("2030-01-01", "2030-01-31"), api("2030-01-05", "2030-01-06")],
      ["availability.0", "availability.1"],
    ],
    [
      "two open intervals",
      [api("2030-01-01"), api("2031-01-01")],
      ["availability.0", "availability.1"],
    ],
    [
      "an interval after an open one",
      [
        api("2030-06-01", "2030-06-30"),
        api("2030-07-01", "2030-07-02"),
        api("2030-01-01"),
      ],
      ["availability.0", "availability.1", "availability.2"],
    ],
    [
      "identical intervals",
      [api("2030-01-01", "2030-01-01"), api("2030-01-01", "2030-01-01")],
      ["availability.0", "availability.1"],
    ],
  ])("refuses %s, naming the entries", (_name, input, fields) => {
    expect(() => normalizeAvailability(input)).toThrowError(
      expect.objectContaining({ code: "invalid_input", fields }),
    );
  });

  it("only names the overlapping entries", () => {
    expect(() =>
      normalizeAvailability([
        api("2030-05-01", "2030-05-02"),
        api("2030-01-01", "2030-01-10"),
        api("2030-01-05", "2030-01-06"),
      ]),
    ).toThrowError(
      expect.objectContaining({ fields: ["availability.1", "availability.2"] }),
    );
  });

  it("accepts no availability at all", () => {
    expect(normalizeAvailability([])).toEqual([]);
  });
});

describe("subtractIntervals", () => {
  const october = [{ from: "2030-10-01", until: "2030-11-01" }];

  it("cuts a block out of the middle", () => {
    expect(
      subtractIntervals(october, [{ from: "2030-10-10", until: "2030-10-13" }]),
    ).toEqual([
      { from: "2030-10-01", until: "2030-10-10" },
      { from: "2030-10-13", until: "2030-11-01" },
    ]);
  });

  it("handles blocks at the edges, outside and unbounded", () => {
    expect(
      subtractIntervals(october, [
        { from: null, until: "2030-10-03" },
        { from: "2030-10-30", until: null },
        { from: "2031-01-01", until: "2031-01-02" },
      ]),
    ).toEqual([{ from: "2030-10-03", until: "2030-10-30" }]);
  });

  it("removes everything under an unbounded block", () => {
    expect(
      subtractIntervals(
        [{ from: "2030-01-01", until: null }],
        [{ from: null, until: null }],
      ),
    ).toEqual([]);
  });
});

describe("deriveAvailability: actual availability is derived (PS-OBJ-001, 003–005)", () => {
  const today = "2030-10-05";
  const general = [{ from: "2030-10-01", until: "2030-11-01" }];

  it("is the general availability from today on when nothing blocks", () => {
    expect(
      deriveAvailability({
        status: "active",
        availability: general,
        blocks: [],
        today,
      }),
    ).toEqual({
      effective: [{ from: "2030-10-05", until: "2030-11-01" }],
      availableForNewLoans: true,
    });
  });

  it("subtracts every block, e.g. an approved loan (PS-OBJ-004)", () => {
    const derived = deriveAvailability({
      status: "active",
      availability: general,
      blocks: [{ period: { from: "2030-10-10", until: "2030-10-13" } }],
      today,
    });

    expect(derived.effective.map(toApiInterval)).toEqual([
      api("2030-10-05", "2030-10-09"),
      api("2030-10-13", "2030-10-31"),
    ]);
  });

  it("is empty while possession is unresolved (PS-OBJ-005)", () => {
    expect(
      deriveAvailability({
        status: "active",
        availability: general,
        blocks: [{ period: { from: "2030-09-01", until: null } }],
        today,
      }),
    ).toEqual({ effective: [], availableForNewLoans: false });
  });

  it("cannot be offered without general availability (PS-OBJ-002)", () => {
    expect(
      deriveAvailability({
        status: "active",
        availability: [],
        blocks: [],
        today,
      }),
    ).toEqual({ effective: [], availableForNewLoans: false });
  });

  it("cannot be offered when all availability is in the past", () => {
    expect(
      deriveAvailability({
        status: "active",
        availability: [{ from: "2030-01-01", until: "2030-02-01" }],
        blocks: [],
        today,
      }).availableForNewLoans,
    ).toBe(false);
  });

  it("is never offered while archived", () => {
    expect(
      deriveAvailability({
        status: "archived",
        availability: general,
        blocks: [],
        today,
      }),
    ).toEqual({ effective: [], availableForNewLoans: false });
  });
});

describe("calendar dates", () => {
  it("uses the product's time zone for today", () => {
    // 23:30 UTC on 31 December is already 1 January in Norway.
    expect(calendarDate(new Date("2030-12-31T23:30:00Z"))).toBe("2031-01-01");
    expect(calendarDate(new Date("2030-06-30T21:59:00Z"))).toBe("2030-06-30");
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2030-12-31", 1)).toBe("2031-01-01");
    expect(addDays("2030-03-01", -1)).toBe("2030-02-28");
  });
});

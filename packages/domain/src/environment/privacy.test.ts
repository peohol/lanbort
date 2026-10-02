import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import {
  classifyTypeChange,
  concealedSpans,
  isConcealed,
  mayExposeHistory,
  type TypePeriod,
  votePasses,
  widenedAfterCreation,
  widenedAfterPassivation,
} from "./privacy";

describe("type changes (PS-ENV-007–008)", () => {
  it.each([
    ["open", "closed"],
    ["closed", "hidden"],
    ["open", "hidden"],
  ] as const)("%s → %s is stricter and needs no consent", (from, to) => {
    expect(classifyTypeChange(from, to)).toEqual({ kind: "stricter" });
  });

  it("closed → open asks every member, hidden → closed is a vote", () => {
    expect(classifyTypeChange("closed", "open")).toEqual({
      kind: "weaker",
      process: "consent",
    });
    expect(classifyTypeChange("hidden", "closed")).toEqual({
      kind: "weaker",
      process: "vote",
    });
  });

  it("never goes from hidden to open in one step, or to the same type", () => {
    for (const [from, to] of [
      ["hidden", "open"],
      ["open", "open"],
    ] as const) {
      expect(() => classifyTypeChange(from, to)).toThrow(DomainError);
    }
  });

  it("passes a vote with at least 2/3 of all active members", () => {
    expect(votePasses(2, 3)).toBe(true);
    expect(votePasses(6, 9)).toBe(true);
    expect(votePasses(5, 8)).toBe(false);
    expect(votePasses(1, 2)).toBe(false);
    expect(votePasses(0, 0)).toBe(false);
  });
});

describe("historical privacy (PS-ENV-009)", () => {
  // Positions, not clock times: hidden from 10, closed from 100, hidden
  // again from 200, closed from 300 and open from 400.
  const periods: TypePeriod[] = [
    { type: "hidden", position: 10n },
    { type: "closed", position: 100n },
    { type: "hidden", position: 200n },
    { type: "closed", position: 300n },
    { type: "open", position: 400n },
  ];

  it("finds when activity became less private than it was created under", () => {
    expect(widenedAfterCreation(periods, 50n)).toBe(100n);
    expect(widenedAfterCreation(periods, 150n)).toBe(400n);
    expect(widenedAfterCreation(periods, 250n)).toBe(300n);
    expect(widenedAfterCreation(periods, 410n)).toBeNull();
  });

  it("orders by position, so the same clock time cannot reorder events", () => {
    // Published just before closed → … → open, whatever the clock said.
    expect(widenedAfterCreation(periods, 99n)).toBe(100n);
    expect(widenedAfterCreation(periods, 101n)).toBe(400n);
  });

  it("keeps a member passive since a weakening in the stricter context", () => {
    // A type change makes its members passive just before the new period.
    expect(widenedAfterPassivation(periods, 99n)).toBe(100n);
    // Passive for unmet requirements while closed, before closed → open.
    expect(widenedAfterPassivation(periods, 350n)).toBe(400n);
    expect(widenedAfterPassivation(periods, 410n)).toBeNull();
  });

  it("only shows widened history to members active since before the change", () => {
    expect(mayExposeHistory(null, null)).toBe(true);
    expect(mayExposeHistory(100n, 50n)).toBe(true);
    expect(mayExposeHistory(100n, 101n)).toBe(false);
    expect(mayExposeHistory(100n, null)).toBe(false);
  });

  it("conceals whole periods from viewers who joined after they widened", () => {
    // Active from 350: the hidden periods widened at 100 and 300, before the
    // viewer joined; the closed ones only at 400.
    expect(concealedSpans(periods, 350n)).toEqual([
      { from: 10n, until: 100n },
      { from: 200n, until: 300n },
    ]);
    expect(concealedSpans(periods, 20n)).toEqual([]);
    expect(concealedSpans(periods, null)).toHaveLength(4);
  });

  it("agrees with the rule for single things at every position", () => {
    const viewers = [null, 11n, 99n, 101n, 250n, 301n, 350n, 401n, 450n];

    for (const viewer of viewers) {
      const spans = concealedSpans(periods, viewer);
      for (let created = 11n; created <= 450n; created += 1n) {
        expect(isConcealed(spans, created)).toBe(
          !mayExposeHistory(widenedAfterCreation(periods, created), viewer),
        );
      }
    }
  });
});

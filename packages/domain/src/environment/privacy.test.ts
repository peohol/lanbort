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

const at = (day: number) => new Date(Date.UTC(2026, 9, day));

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
  // Hidden from day 1, closed from day 10, hidden again from day 20, closed
  // from day 30 and open from day 40.
  const periods: TypePeriod[] = [
    { type: "hidden", startedAt: at(1) },
    { type: "closed", startedAt: at(10) },
    { type: "hidden", startedAt: at(20) },
    { type: "closed", startedAt: at(30) },
    { type: "open", startedAt: at(40) },
  ];

  it("finds when activity became less private than it was created under", () => {
    expect(widenedAfterCreation(periods, at(5))).toEqual(at(10));
    expect(widenedAfterCreation(periods, at(15))).toEqual(at(40));
    expect(widenedAfterCreation(periods, at(25))).toEqual(at(30));
    expect(widenedAfterCreation(periods, at(41))).toBeNull();
  });

  it("counts a period that starts at the very moment as in force", () => {
    expect(widenedAfterCreation(periods, at(10))).toEqual(at(40));
  });

  it("keeps a member passive since a weakening in the stricter context", () => {
    // Made passive by hidden → closed on day 10.
    expect(widenedAfterPassivation(periods, at(10))).toEqual(at(10));
    // Passive for unmet requirements while closed, before closed → open.
    expect(widenedAfterPassivation(periods, at(35))).toEqual(at(40));
    expect(widenedAfterPassivation(periods, at(41))).toBeNull();
  });

  it("only shows widened history to members active since before the change", () => {
    expect(mayExposeHistory(null, null)).toBe(true);
    expect(mayExposeHistory(at(10), at(5))).toBe(true);
    expect(mayExposeHistory(at(10), at(10))).toBe(false);
    expect(mayExposeHistory(at(10), at(11))).toBe(false);
    expect(mayExposeHistory(at(10), null)).toBe(false);
  });

  it("conceals whole periods from viewers who joined after they widened", () => {
    // Active since day 35: the hidden periods widened on days 10 and 30,
    // before the viewer joined; the closed ones only on day 40.
    expect(concealedSpans(periods, at(35))).toEqual([
      { from: at(1), until: at(10) },
      { from: at(20), until: at(30) },
    ]);
    expect(concealedSpans(periods, at(2))).toEqual([]);
    expect(concealedSpans(periods, null)).toHaveLength(4);
  });

  it("agrees with the rule for single things at every moment", () => {
    const viewers = [null, ...[1, 9, 10, 11, 25, 30, 35, 40, 45].map(at)];

    for (const viewer of viewers) {
      const spans = concealedSpans(periods, viewer);
      for (let day = 1; day <= 45; day += 0.5) {
        const createdAt = new Date(at(1).getTime() + (day - 1) * 86_400_000);
        expect(isConcealed(spans, createdAt)).toBe(
          !mayExposeHistory(widenedAfterCreation(periods, createdAt), viewer),
        );
      }
    }
  });
});

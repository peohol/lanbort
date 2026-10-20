import { describe, expect, it } from "vitest";
import {
  pilotAreaOf,
  pilotAreas,
  pilotCases,
  pilotPhases,
  pilotPriorities,
  pilotTestIdPattern,
} from "./pilot-catalogue";

describe("the pilot catalogue", () => {
  it("has the 98 tests of pilot-testmatrise.md, each once", () => {
    const ids = pilotCases.map((test) => test.id);

    expect(ids).toHaveLength(98);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => pilotTestIdPattern.test(id))).toBe(true);
  });

  it("has the area counts of the matrix", () => {
    expect(
      Object.fromEntries(
        pilotAreas.map((area) => [
          area.code,
          pilotCases.filter((test) => pilotAreaOf(test.id) === area).length,
        ]),
      ),
    ).toEqual({ A: 11, M: 12, T: 15, L: 20, K: 14, R: 7, D: 10, S: 9 });
  });

  it("plans each test in a phase with a known priority and wording", () => {
    const phases = new Set(pilotPhases.map((phase) => phase.number));

    for (const test of pilotCases) {
      expect(phases.has(test.phase), test.id).toBe(true);
      expect(pilotPriorities, test.id).toContain(test.priority);
      expect(test.action.trim(), test.id).not.toBe("");
      expect(test.expected.trim(), test.id).not.toBe("");
    }
  });

  it("tries every basis test before the user test phase", () => {
    const userPhase = Math.min(
      ...pilotCases
        .filter((test) => test.priority === "U")
        .map((test) => test.phase),
    );

    expect(
      pilotCases.filter(
        (test) => test.priority === "B" && test.phase >= userPhase,
      ),
    ).toEqual([]);
  });

  it("numbers the phases from 0 without gaps", () => {
    expect(pilotPhases.map((phase) => phase.number)).toEqual(
      pilotPhases.map((_, index) => index),
    );
  });
});

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

  it("tells the tester what to have ready, every step and when it passed", () => {
    for (const test of pilotCases) {
      expect(test.prepare.length, test.id).toBeGreaterThan(0);
      expect(test.steps.length, test.id).toBeGreaterThanOrEqual(3);
      expect(test.passWhen.length, test.id).toBeGreaterThanOrEqual(2);

      for (const line of [...test.prepare, ...test.steps, ...test.passWhen]) {
        expect(line.trim(), test.id).toBe(line);
        expect(line, test.id).not.toBe("");
      }
    }
  });

  it("keeps the instructions within what a revision can store", () => {
    for (const test of pilotCases) {
      expect(test.action.length, test.id).toBeLessThanOrEqual(500);
      expect(test.expected.length, test.id).toBeLessThanOrEqual(500);
      expect(test.prepare.length, test.id).toBeLessThanOrEqual(20);
      expect(test.steps.length, test.id).toBeLessThanOrEqual(40);
      expect(test.passWhen.length, test.id).toBeLessThanOrEqual(20);
      expect(
        [...test.prepare, ...test.steps, ...test.passWhen].join("").length,
        test.id,
      ).toBeLessThanOrEqual(20_000);
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

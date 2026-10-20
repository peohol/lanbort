import { describe, expect, it } from "vitest";
import { pilotCases } from "@lanbort/contracts";
import { pilotAreaCode, pilotCase, pilotCaseRevision } from "./catalogue";
import {
  type PilotStanding,
  nextPseudonym,
  pilotGates,
  pilotProgress,
  pilotTestStatus,
} from "./model";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 12, minute));

const standings = (
  status: (id: string) => PilotStanding["status"] = () => "not_started",
): PilotStanding[] =>
  pilotCases.map((test) => ({
    id: test.id,
    area: pilotAreaCode(test.id),
    priority: test.priority,
    phase: test.phase,
    status: status(test.id),
  }));

describe("a pilot test's status", () => {
  it("is not started without runs", () => {
    expect(pilotTestStatus([])).toBe("not_started");
  });

  it("is the newest run's, whatever order the runs come in", () => {
    expect(
      pilotTestStatus([
        { status: "retest", recordedAt: at(3) },
        { status: "passed", recordedAt: at(1) },
        { status: "failed", recordedAt: at(2) },
      ]),
    ).toBe("retest");
  });
});

describe("the phase gates", () => {
  it("are all closed before anything is tried", () => {
    expect(pilotGates(standings(), 0).every((gate) => !gate.open)).toBe(true);
  });

  it("open when everything due has passed and nothing blocks", () => {
    const gates = pilotGates(
      standings(() => "passed"),
      0,
    );

    expect(gates.every((gate) => gate.open)).toBe(true);
  });

  it("stay closed while a P0 or P1 defect is unresolved", () => {
    const gates = pilotGates(
      standings(() => "passed"),
      1,
    );

    expect(gates.some((gate) => gate.open)).toBe(false);
  });

  it("take any result for other tests, but only a pass for basis tests", () => {
    const basis = pilotCases.find((test) => test.priority === "B")!;
    const other = pilotCases.find((test) => test.priority === "O")!;
    const gates = pilotGates(
      standings((id) =>
        id === basis.id ? "blocked" : id === other.id ? "failed" : "passed",
      ),
      0,
    );
    const gate = gates[gates.length - 1]!;

    expect(gate.basisNotPassed).toEqual([basis.id]);
    expect(gate.untried).toEqual([]);
  });

  it("count «test again» as untried", () => {
    const other = pilotCases.find((test) => test.priority !== "B")!;
    const gates = pilotGates(
      standings((id) => (id === other.id ? "retest" : "passed")),
      0,
    );

    expect(gates[gates.length - 1]!.untried).toEqual([other.id]);
    expect(gates[other.phase]!.open).toBe(false);
    expect(gates.slice(0, other.phase).every((gate) => gate.open)).toBe(true);
  });
});

describe("the pilot's progress", () => {
  it("counts every test once in each grouping", () => {
    const progress = pilotProgress(
      standings((id) => (id.startsWith("A") ? "passed" : "not_started")),
      0,
    );
    const sum = (groups: readonly { total: number }[]) =>
      groups.reduce((total, group) => total + group.total, 0);

    expect(progress.total).toBe(98);
    expect(progress.counts.passed).toBe(11);
    expect(progress.counts.not_started).toBe(87);
    expect(sum(progress.byArea)).toBe(98);
    expect(sum(progress.byPhase)).toBe(98);
    expect(sum(progress.byPriority)).toBe(98);
  });
});

describe("the catalogue's tests", () => {
  it("are found by id, and an unknown id is not found", () => {
    expect(pilotCase("A01").id).toBe("A01");
    expect(() => pilotCase("Z99")).toThrow(
      expect.objectContaining({ code: "not_found" }),
    );
  });

  it("have a revision that follows the wording", () => {
    const test = pilotCase("A01");

    expect(pilotCaseRevision(test)).toMatch(/^[0-9a-f]{12}$/);
    expect(pilotCaseRevision(test)).toBe(pilotCaseRevision({ ...test }));
    expect(pilotCaseRevision({ ...test, expected: "Noe annet." })).not.toBe(
      pilotCaseRevision(test),
    );
  });
});

describe("pseudonyms", () => {
  it("count on from the highest one taken", () => {
    expect(nextPseudonym([])).toBe("P-01");
    expect(nextPseudonym(["P-01", "P-03"])).toBe("P-04");
    expect(nextPseudonym(["P-99"])).toBe("P-100");
  });
});

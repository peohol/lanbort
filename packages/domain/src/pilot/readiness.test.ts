import { pilotCheckFreshMs, pilotRequirementsOf } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { pilotGates } from "./model";
import { type PilotCheckRecord, pilotReadiness } from "./readiness";

const now = new Date("2026-10-28T09:00:00Z");
const gate = pilotGates([], 0)[0]!;
const journal = { gate, tests: [], defects: [] };
const automatic = pilotRequirementsOf(0).filter(
  (requirement) => requirement.check === "automatic",
);
const manual = pilotRequirementsOf(0).filter(
  (requirement) => requirement.check === "manual",
);

const checks = (at: Date): PilotCheckRecord[] =>
  automatic.map((requirement) => ({
    requirementId: requirement.id,
    status: "passed",
    summary: "Grønt",
    details: [],
    links: [],
    at,
    by: "Pia Pilot",
  }));

const confirmations = manual.map((requirement) => ({
  requirementId: requirement.id,
  confirmed: true,
  note: "Sjekket",
  at: now,
  by: "Pia Pilot",
}));

describe("a phase's readiness checklist", () => {
  it("is ready only when every requirement holds on a shown ground", () => {
    const readiness = pilotReadiness(
      0,
      journal,
      checks(now),
      confirmations,
      now,
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.checkedAt).toBe(now.toISOString());
    for (const requirement of readiness.requirements) {
      expect(requirement.status, requirement.id).toBe("passed");
      expect(
        requirement.summary ?? requirement.note,
        requirement.id,
      ).toBeTruthy();
    }
  });

  it("does not count an automatic pass older than an hour", () => {
    const old = new Date(now.getTime() - pilotCheckFreshMs - 1);
    const readiness = pilotReadiness(
      0,
      journal,
      checks(old),
      confirmations,
      now,
    );

    expect(readiness.ready).toBe(false);
    expect(
      readiness.requirements.find((each) => each.id === "ci"),
    ).toMatchObject({ status: "unchecked", stale: true, summary: "Grønt" });
  });

  it("needs a manual requirement confirmed, and a withdrawal undoes it", () => {
    const readiness = pilotReadiness(
      0,
      journal,
      checks(now),
      [
        { ...confirmations[0]!, confirmed: false, note: null },
        ...confirmations.slice(1),
      ],
      now,
    );

    expect(readiness.ready).toBe(false);
    expect(
      readiness.requirements.find((each) => each.id === manual[0]!.id),
    ).toMatchObject({ status: "needs_confirmation", note: null, by: null });
  });

  it("follows the journal's tests and defects", () => {
    const failed = pilotReadiness(
      0,
      {
        gate: {
          ...gate,
          basisNotPassed: ["A02"],
          blockingDefects: 1,
          open: false,
        },
        tests: [
          {
            id: "A02",
            area: "A",
            priority: "B",
            phase: 0,
            action: "Prøv å lage konto",
            expected: "",
            status: "failed",
            lastRunAt: null,
            runs: 1,
            openDefects: 1,
            assignees: [],
          },
        ],
        defects: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            number: 3,
            title: "Kontoen ble laget",
            description: null,
            link: null,
            severity: "P0",
            status: "open",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            testIds: ["A02"],
          },
        ],
      },
      checks(now),
      confirmations,
      now,
    );
    const standing = (id: string) =>
      failed.requirements.find((each) => each.id === id);

    expect(failed.ready).toBe(false);
    expect(standing("phase-tests")).toMatchObject({
      status: "failed",
      details: ["A02 Prøv å lage konto: viktig, ikke bestått"],
    });
    expect(standing("critical-defects")).toMatchObject({
      status: "failed",
      details: ["F-3 Kontoen ble laget (P0)"],
    });
  });

  it("is empty and ready for a phase without a checklist", () => {
    expect(pilotReadiness(3, journal, [], [], now)).toMatchObject({
      requirements: [],
      ready: true,
    });
  });
});

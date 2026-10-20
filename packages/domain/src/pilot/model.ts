import {
  type PilotCounts,
  type PilotGate,
  type PilotProgress,
  type PilotRunStatus,
  type PilotSeverity,
  type PilotTestStatus,
  pilotAreas,
  pilotPhases,
  pilotPriorities,
  pilotTestStatusSchema,
} from "@lanbort/contracts";

/** What a test's standing needs to count it. */
export interface PilotStanding {
  readonly id: string;
  readonly area: string;
  readonly priority: string;
  readonly phase: number;
  readonly status: PilotTestStatus;
}

/**
 * A test's standing from its runs: the newest run's status, or not started.
 * A newer «Må testes igjen» overrides an earlier pass (pilot-testplan §4).
 */
export function pilotTestStatus(
  runs: readonly { status: PilotRunStatus; recordedAt: Date }[],
): PilotTestStatus {
  const newest = runs.reduce<(typeof runs)[number] | null>(
    (latest, run) =>
      latest && latest.recordedAt >= run.recordedAt ? latest : run,
    null,
  );

  return newest?.status ?? "not_started";
}

export function emptyPilotCounts(): PilotCounts {
  return Object.fromEntries(
    pilotTestStatusSchema.options.map((status) => [status, 0]),
  ) as PilotCounts;
}

function countsOf(tests: readonly PilotStanding[]): PilotCounts {
  const counts = emptyPilotCounts();

  for (const test of tests) counts[test.status] += 1;

  return counts;
}

function groups(
  tests: readonly PilotStanding[],
  keys: readonly string[],
  keyOf: (test: PilotStanding) => string,
) {
  return keys.map((key) => {
    const inGroup = tests.filter((test) => keyOf(test) === key);

    return { key, total: inGroup.length, counts: countsOf(inGroup) };
  });
}

/** A result that counts as tried: anything but untested or «test again». */
const tried: ReadonlySet<PilotTestStatus> = new Set([
  "passed",
  "failed",
  "blocked",
  "not_relevant",
]);

/** Defects that stop the pilot (P0) or the part they hit (P1). */
export const blockingSeverities: ReadonlySet<PilotSeverity> = new Set([
  "P0",
  "P1",
]);

/**
 * What stands between each phase and the next (pilot-testplan §3, §5):
 * every basis test planned for the phase or earlier has passed, every other
 * one has a result, and no P0/P1 defect is open. The lead decides; the gate
 * only shows what is left.
 */
export function pilotGates(
  tests: readonly PilotStanding[],
  blockingDefects: number,
): PilotGate[] {
  return pilotPhases.map(({ number }) => {
    const due = tests.filter((test) => test.phase <= number);
    const basisNotPassed = due
      .filter((test) => test.priority === "B" && test.status !== "passed")
      .map((test) => test.id);
    const untried = due
      .filter((test) => test.priority !== "B" && !tried.has(test.status))
      .map((test) => test.id);

    return {
      phase: number,
      basisNotPassed,
      untried,
      blockingDefects,
      open:
        basisNotPassed.length === 0 &&
        untried.length === 0 &&
        blockingDefects === 0,
    };
  });
}

/** The pilot's progress, overall and by area, phase and priority. */
export function pilotProgress(
  tests: readonly PilotStanding[],
  blockingDefects: number,
): PilotProgress {
  return {
    total: tests.length,
    counts: countsOf(tests),
    byArea: groups(
      tests,
      pilotAreas.map((area) => area.code),
      (test) => test.area,
    ),
    byPhase: groups(
      tests,
      pilotPhases.map((phase) => String(phase.number)),
      (test) => String(test.phase),
    ),
    byPriority: groups(tests, pilotPriorities, (test) => test.priority),
    gates: pilotGates(tests, blockingDefects),
  };
}

/** The next free pseudonym after those taken: P-01, P-02, … */
export function nextPseudonym(taken: readonly string[]): string {
  const highest = Math.max(
    0,
    ...taken.map((pseudonym) => Number(pseudonym.slice(2))),
  );

  return `P-${String(highest + 1).padStart(2, "0")}`;
}

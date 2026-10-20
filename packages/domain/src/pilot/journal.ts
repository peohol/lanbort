import {
  type PilotDefect,
  type PilotDefectStatus,
  type PilotRunStatus,
  type PilotSeverity,
  type PilotTestSummary,
  pilotCases,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { pilotAreaCode } from "./catalogue";
import {
  blockingSeverities,
  type PilotStanding,
  pilotProgress,
  pilotTestStatus,
} from "./model";

type Db = Kysely<Database>;

/** A defect is open until it is closed or put off. */
export const unresolvedDefect = (status: string) =>
  status === "open" || status === "fixed";

/** The campaign's defects, each with the tests whose runs failed with it. */
export async function loadDefects(
  db: Db,
  campaignId: string,
): Promise<PilotDefect[]> {
  const [defects, failures] = await Promise.all([
    db
      .selectFrom("app.pilot_defects")
      .selectAll()
      .where("campaign_id", "=", campaignId)
      .orderBy("number")
      .execute(),
    db
      .selectFrom("app.pilot_runs")
      .select(["defect_id", "test_id"])
      .distinct()
      .where("campaign_id", "=", campaignId)
      .where("defect_id", "is not", null)
      .orderBy("test_id")
      .execute(),
  ]);

  return defects.map((defect) => ({
    id: defect.id,
    number: defect.number,
    title: defect.title,
    description: defect.description,
    link: defect.link,
    severity: defect.severity as PilotSeverity,
    status: defect.status as PilotDefectStatus,
    createdAt: defect.created_at.toISOString(),
    updatedAt: defect.updated_at.toISOString(),
    testIds: failures
      .filter((failure) => failure.defect_id === defect.id)
      .map((failure) => failure.test_id),
  }));
}

/**
 * Every test of the catalogue with its standing in the campaign, and the
 * progress they add up to. Without a campaign, nothing is started.
 */
export async function loadStandings(
  db: Db,
  campaignId: string | null,
  defects: readonly PilotDefect[],
) {
  const [runs, tasks] = campaignId
    ? await Promise.all([
        db
          .selectFrom("app.pilot_runs")
          .select(["test_id", "status", "recorded_at"])
          .where("campaign_id", "=", campaignId)
          .execute(),
        db
          .selectFrom("app.pilot_assignments as task")
          .innerJoin(
            "app.pilot_participants as participant",
            "participant.id",
            "task.participant_id",
          )
          .select(["task.test_id", "participant.pseudonym"])
          .where("task.campaign_id", "=", campaignId)
          .where("task.withdrawn_at", "is", null)
          .orderBy("participant.pseudonym")
          .execute(),
      ])
    : [[], []];

  const tests: PilotTestSummary[] = pilotCases.map((test) => {
    const own = runs
      .filter((run) => run.test_id === test.id)
      .map((run) => ({
        status: run.status as PilotRunStatus,
        recordedAt: run.recorded_at,
      }));
    const last = own.reduce<Date | null>(
      (latest, run) =>
        latest && latest >= run.recordedAt ? latest : run.recordedAt,
      null,
    );

    return {
      id: test.id,
      area: pilotAreaCode(test.id),
      priority: test.priority,
      phase: test.phase,
      action: test.action,
      expected: test.expected,
      status: pilotTestStatus(own),
      lastRunAt: last?.toISOString() ?? null,
      runs: own.length,
      openDefects: defects.filter(
        (defect) =>
          unresolvedDefect(defect.status) && defect.testIds.includes(test.id),
      ).length,
      assignees: tasks
        .filter((task) => task.test_id === test.id)
        .map((task) => task.pseudonym),
    };
  });

  const blocking = defects.filter(
    (defect) =>
      unresolvedDefect(defect.status) &&
      blockingSeverities.has(defect.severity),
  ).length;

  return {
    tests,
    progress: pilotProgress(tests as readonly PilotStanding[], blocking),
  };
}

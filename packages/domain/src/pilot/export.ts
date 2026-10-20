import {
  type PilotDefectStatus,
  type PilotDevice,
  type PilotEnvironment,
  type PilotExport,
  type PilotOutcome,
  type PilotRunStatus,
  type PilotSeverity,
  pilotCatalogueVersion,
  pilotDefectStatusSchema,
  pilotExportInputSchema,
  pilotExportSchema,
  pilotOutcomeSchema,
  pilotSeveritySchema,
} from "@lanbort/contracts";
import { rateLimits } from "../abuse/rate-limits";
import { defineCommand } from "../commands/command";
import { loadDefects, loadStandings } from "./journal";
import { exportPilotPolicy } from "./policies";
import {
  loadChosenCampaign,
  loadPilotViewer,
  presentCampaign,
  recordPilotAudit,
} from "./store";

/**
 * The journal taken out (pilot-ui.md «Avslutning og eksport»), for the lead
 * only and recorded each time: `results` is every run, defect and task of
 * the current campaign, or an earlier one, with pseudonyms; `summary` is counts only, without
 * any pseudonym, note or comment, fit for a report. Never sent anywhere by
 * the app: the lead downloads it.
 */
export const exportPilot = defineCommand({
  name: "pilot.export",
  input: pilotExportInputSchema,
  output: pilotExportSchema,
  policy: exportPilotPolicy,
  // Each export is its own record; the result is never stored.
  idempotency: "none",
  rateLimit: rateLimits.pilot,
  load: async ({ tx, actor }) => ({
    resource: { viewer: await loadPilotViewer(tx, actor) },
    context: undefined,
  }),
  execute: async ({ tx, actor, input, now }): Promise<PilotExport> => {
    const row = await loadChosenCampaign(tx, input.campaignId);
    const campaign = row ? presentCampaign(row) : null;
    const defects = campaign ? await loadDefects(tx, campaign.id) : [];

    await recordPilotAudit(tx, actor, "exported", now, {
      campaignId: campaign?.id ?? null,
      details: { kind: input.kind },
    });

    const header = {
      generatedAt: now.toISOString(),
      catalogueVersion: pilotCatalogueVersion,
    };

    if (input.kind === "summary") {
      const { progress } = await loadStandings(
        tx,
        campaign?.id ?? null,
        defects,
      );
      const outcomes = campaign
        ? await tx
            .selectFrom("app.pilot_feedback as report")
            .innerJoin(
              "app.pilot_assignments as task",
              "task.id",
              "report.assignment_id",
            )
            .select("report.outcome")
            .where("task.campaign_id", "=", campaign.id)
            .execute()
        : [];

      return {
        kind: "summary",
        ...header,
        campaign: campaign && { name: campaign.name, phase: campaign.phase },
        progress,
        defects: pilotSeveritySchema.options.flatMap((severity) =>
          pilotDefectStatusSchema.options.map((status) => ({
            severity,
            status,
            count: defects.filter(
              (defect) =>
                defect.severity === severity && defect.status === status,
            ).length,
          })),
        ),
        feedback: pilotOutcomeSchema.options.map((outcome) => ({
          outcome,
          count: outcomes.filter((report) => report.outcome === outcome).length,
        })),
      };
    }

    const [runs, tasks, reports] = campaign
      ? await Promise.all([
          tx
            .selectFrom("app.pilot_runs as run")
            .innerJoin("app.pilot_case_revisions as wording", (join) =>
              join
                .onRef("wording.test_id", "=", "run.test_id")
                .onRef("wording.revision", "=", "run.revision"),
            )
            .leftJoin(
              "app.pilot_participants as tester",
              "tester.id",
              "run.tester_id",
            )
            .leftJoin(
              "app.pilot_defects as defect",
              "defect.id",
              "run.defect_id",
            )
            .select([
              "run.id",
              "run.campaign_id",
              "run.test_id",
              "run.revision",
              "wording.action",
              "wording.expected",
              "run.recorded_at",
              "run.status",
              "run.app_version",
              "run.environment",
              "run.device",
              "run.platform",
              "run.helped",
              "tester.pseudonym",
              "run.note",
              "defect.number as defect_number",
            ])
            .where("run.campaign_id", "=", campaign.id)
            .orderBy("run.recorded_at")
            .orderBy("run.test_id")
            .execute(),
          tx
            .selectFrom("app.pilot_assignments as task")
            .innerJoin(
              "app.pilot_participants as participant",
              "participant.id",
              "task.participant_id",
            )
            .select([
              "task.id",
              "task.test_id",
              "participant.pseudonym",
              "task.goal",
              "task.assigned_at",
              "task.withdrawn_at",
            ])
            .where("task.campaign_id", "=", campaign.id)
            .orderBy("task.assigned_at")
            .execute(),
          tx
            .selectFrom("app.pilot_feedback as report")
            .innerJoin(
              "app.pilot_assignments as task",
              "task.id",
              "report.assignment_id",
            )
            .select([
              "report.assignment_id",
              "report.outcome",
              "report.comment",
              "report.reported_at",
            ])
            .where("task.campaign_id", "=", campaign.id)
            .orderBy("report.reported_at", "desc")
            .execute(),
        ])
      : [[], [], []];

    return {
      kind: "results",
      ...header,
      campaign,
      runs: runs.map((run) => ({
        id: run.id,
        campaignId: run.campaign_id,
        testId: run.test_id,
        revision: run.revision,
        action: run.action,
        expected: run.expected,
        recordedAt: run.recorded_at.toISOString(),
        status: run.status as PilotRunStatus,
        appVersion: run.app_version,
        environment: run.environment as PilotEnvironment | null,
        device: run.device as PilotDevice | null,
        platform: run.platform,
        helped: run.helped,
        tester: run.pseudonym,
        note: run.note,
        defectNumber: run.defect_number,
      })),
      defects: defects.map((defect) => ({
        ...defect,
        severity: defect.severity as PilotSeverity,
        status: defect.status as PilotDefectStatus,
      })),
      tasks: tasks.map((task) => ({
        testId: task.test_id,
        pseudonym: task.pseudonym,
        goal: task.goal,
        assignedAt: task.assigned_at.toISOString(),
        withdrawnAt: task.withdrawn_at?.toISOString() ?? null,
        feedback: reports
          .filter((report) => report.assignment_id === task.id)
          .map((report) => ({
            outcome: report.outcome as PilotOutcome,
            comment: report.comment,
            reportedAt: report.reported_at.toISOString(),
          })),
      })),
    };
  },
});

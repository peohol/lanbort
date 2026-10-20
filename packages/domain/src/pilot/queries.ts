import {
  type PilotDefectStatus,
  type PilotDevice,
  type PilotEnvironment,
  type PilotOutcome,
  type PilotRole,
  type PilotRunStatus,
  type PilotSeverity,
  type PilotTasks,
  type PilotTestDetail,
  type PilotWorkspace,
  pilotTestRefSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { z } from "zod";
import type { Actor } from "../actor";
import { defineQuery } from "../commands/query";
import { pilotCase, pilotCaseRevision } from "./catalogue";
import { loadDefects, loadStandings, unresolvedDefect } from "./journal";
import {
  type PilotViewer,
  readPilotRolePolicy,
  readPilotTasksPolicy,
  readPilotTestPolicy,
  readPilotWorkspacePolicy,
} from "./policies";
import {
  loadCampaigns,
  loadCurrentCampaign,
  loadPilotViewer,
  presentCampaign,
} from "./store";

type Db = Kysely<Database>;

/**
 * The viewer, and what `read` loads for them only when `allowed`: nobody
 * outside the pilot causes its journal to be read.
 */
async function scoped<T>(
  db: Db,
  actor: Actor,
  allowed: (viewer: PilotViewer) => boolean,
  read: (viewer: PilotViewer) => Promise<T>,
) {
  const viewer = await loadPilotViewer(db, actor);

  return {
    resource: { viewer, data: allowed(viewer) ? await read(viewer) : null },
    context: undefined,
  };
}

const asLead = (viewer: PilotViewer) => viewer.leadId !== null;

/** What the data a policy allowed is, once it has. */
function loaded<T>(data: T | null): T {
  if (data === null) {
    throw new Error("A pilot query presented data its policy did not load");
  }

  return data;
}

/** Whether the signed-in user leads the pilot or takes part, for the menu. */
export const readPilotRole = defineQuery({
  name: "pilot.read_role",
  input: z.strictObject({}),
  policy: readPilotRolePolicy,
  load: async ({ db, actor }) => ({
    resource: { viewer: await loadPilotViewer(db, actor) },
    context: undefined,
  }),
  present: ({ resource: { viewer } }): PilotRole => ({
    role: viewer.leadId ? "lead" : "participant",
  }),
});

/**
 * The lead's overview (pilot-ui.md «Pilotoversikt»): the campaign, every
 * test with its standing, progress, defects and participants.
 */
export const readPilotWorkspace = defineQuery({
  name: "pilot.read_workspace",
  input: z.strictObject({}),
  policy: readPilotWorkspacePolicy,
  load: ({ db, actor }) =>
    scoped(db, actor, asLead, async (): Promise<PilotWorkspace> => {
      const [campaign, ...earlier] = await loadCampaigns(db).execute();
      const defects = campaign ? await loadDefects(db, campaign.id) : [];
      const [standings, participants] = await Promise.all([
        loadStandings(db, campaign?.id ?? null, defects),
        db
          .selectFrom("app.pilot_participants as participant")
          .leftJoin(
            "app.profiles as profile",
            "profile.user_id",
            "participant.user_id",
          )
          .select((eb) => [
            "participant.id",
            "participant.pseudonym",
            "profile.real_name",
            eb
              .selectFrom("app.pilot_assignments as task")
              .select(({ fn }) => fn.countAll<string>().as("n"))
              .whereRef("task.participant_id", "=", "participant.id")
              .where("task.campaign_id", "=", campaign?.id ?? null)
              .where("task.withdrawn_at", "is", null)
              .as("open_tasks"),
            eb
              .selectFrom("app.pilot_feedback as report")
              .innerJoin(
                "app.pilot_assignments as task",
                "task.id",
                "report.assignment_id",
              )
              .select(({ fn }) => fn.countAll<string>().as("n"))
              .whereRef("task.participant_id", "=", "participant.id")
              .where("task.campaign_id", "=", campaign?.id ?? null)
              .as("reports"),
          ])
          .where("participant.removed_at", "is", null)
          .orderBy("participant.pseudonym")
          .execute(),
      ]);

      return {
        campaign: campaign ? presentCampaign(campaign) : null,
        earlierCampaigns: earlier.map(presentCampaign),
        ...standings,
        defects,
        participants: participants.map((participant) => ({
          id: participant.id,
          pseudonym: participant.pseudonym,
          name: participant.real_name,
          openTasks: Number(participant.open_tasks ?? 0),
          reports: Number(participant.reports ?? 0),
        })),
      };
    }),
  present: ({ resource }) => loaded(resource.data),
});

/**
 * One test card (pilot-ui.md «Ett testkort»): its standing, every run of it
 * with the wording it was tried against, and its tasks with what the
 * participants reported.
 */
export const readPilotTest = defineQuery({
  name: "pilot.read_test",
  input: pilotTestRefSchema,
  policy: readPilotTestPolicy,
  load: ({ db, actor, input }) =>
    scoped(db, actor, asLead, async (): Promise<PilotTestDetail> => {
      const test = pilotCase(input.testId);
      const revision = pilotCaseRevision(test);
      const campaign = await loadCurrentCampaign(db);
      const defects = campaign ? await loadDefects(db, campaign.id) : [];
      const [{ tests }, runs, tasks, participants] = await Promise.all([
        loadStandings(db, campaign?.id ?? null, defects),
        db
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
          .leftJoin("app.pilot_defects as defect", "defect.id", "run.defect_id")
          .select([
            "run.id",
            "run.campaign_id",
            "run.recorded_at",
            "run.status",
            "run.revision",
            "wording.action",
            "wording.expected",
            "wording.prepare",
            "wording.steps",
            "wording.pass_when",
            "run.app_version",
            "run.environment",
            "run.device",
            "run.platform",
            "run.helped",
            "tester.pseudonym",
            "run.note",
            "defect.id as defect_id",
            "defect.number as defect_number",
            "defect.title as defect_title",
            "defect.severity as defect_severity",
            "defect.status as defect_status",
          ])
          .where("run.test_id", "=", test.id)
          .orderBy("run.recorded_at", "desc")
          .execute(),
        campaign
          ? db
              .selectFrom("app.pilot_assignments as task")
              .innerJoin(
                "app.pilot_participants as participant",
                "participant.id",
                "task.participant_id",
              )
              .select([
                "task.id",
                "task.participant_id",
                "participant.pseudonym",
                "task.goal",
                "task.assigned_at",
                "task.withdrawn_at",
              ])
              .where("task.campaign_id", "=", campaign.id)
              .where("task.test_id", "=", test.id)
              .orderBy("task.assigned_at", "desc")
              .execute()
          : [],
        db
          .selectFrom("app.pilot_participants")
          .select(["id", "pseudonym"])
          .where("removed_at", "is", null)
          .orderBy("pseudonym")
          .execute(),
      ]);
      const feedback = tasks.length
        ? await db
            .selectFrom("app.pilot_feedback")
            .select(["assignment_id", "outcome", "comment", "reported_at"])
            .where(
              "assignment_id",
              "in",
              tasks.map((task) => task.id),
            )
            .orderBy("reported_at", "desc")
            .execute()
        : [];

      return {
        test: tests.find((each) => each.id === test.id)!,
        wording: {
          action: test.action,
          expected: test.expected,
          prepare: [...test.prepare],
          steps: [...test.steps],
          passWhen: [...test.passWhen],
        },
        campaign: campaign ? presentCampaign(campaign) : null,
        runs: runs.map((run) => ({
          id: run.id,
          campaignId: run.campaign_id,
          recordedAt: run.recorded_at.toISOString(),
          status: run.status as PilotRunStatus,
          earlierWording:
            run.revision === revision
              ? null
              : {
                  action: run.action,
                  expected: run.expected,
                  prepare: run.prepare,
                  steps: run.steps,
                  passWhen: run.pass_when,
                },
          appVersion: run.app_version,
          environment: run.environment as PilotEnvironment | null,
          device: run.device as PilotDevice | null,
          platform: run.platform,
          helped: run.helped,
          tester: run.pseudonym,
          note: run.note,
          defect: run.defect_id
            ? {
                id: run.defect_id,
                number: run.defect_number!,
                title: run.defect_title!,
                severity: run.defect_severity as PilotSeverity,
                status: run.defect_status as PilotDefectStatus,
              }
            : null,
        })),
        assignments: tasks.map((task) => ({
          id: task.id,
          participantId: task.participant_id,
          pseudonym: task.pseudonym,
          goal: task.goal,
          assignedAt: task.assigned_at.toISOString(),
          withdrawnAt: task.withdrawn_at?.toISOString() ?? null,
          feedback: feedback
            .filter((report) => report.assignment_id === task.id)
            .map((report) => ({
              outcome: report.outcome as PilotOutcome,
              comment: report.comment,
              reportedAt: report.reported_at.toISOString(),
            })),
        })),
        participants,
        openDefects: defects
          .filter((defect) => unresolvedDefect(defect.status))
          .map(({ id, number, title, severity, status }) => ({
            id,
            number,
            title,
            severity,
            status,
          })),
      };
    }),
  present: ({ resource }) => loaded(resource.data),
});

/**
 * A participant's own open tasks in the open campaign, with their latest
 * report (pilot-ui.md «Mine pilotoppgaver»). Nothing about other
 * participants, the test ids or the lead's results.
 */
export const readPilotTasks = defineQuery({
  name: "pilot.read_tasks",
  input: z.strictObject({}),
  policy: readPilotTasksPolicy,
  load: ({ db, actor }) =>
    scoped(
      db,
      actor,
      (viewer) => viewer.participantId !== null,
      async (viewer): Promise<PilotTasks> => {
        const participantId = viewer.participantId!;
        const [participant, tasks] = await Promise.all([
          db
            .selectFrom("app.pilot_participants")
            .select("pseudonym")
            .where("id", "=", participantId)
            .executeTakeFirstOrThrow(),
          db
            .selectFrom("app.pilot_assignments as task")
            .innerJoin(
              "app.pilot_campaigns as campaign",
              "campaign.id",
              "task.campaign_id",
            )
            .select(["task.id", "task.goal", "task.assigned_at"])
            .where("task.participant_id", "=", participantId)
            .where("task.withdrawn_at", "is", null)
            .where("campaign.closed_at", "is", null)
            .orderBy("task.assigned_at")
            .execute(),
        ]);
        const reports = tasks.length
          ? await db
              .selectFrom("app.pilot_feedback")
              .select(["assignment_id", "outcome", "comment", "reported_at"])
              .where(
                "assignment_id",
                "in",
                tasks.map((task) => task.id),
              )
              .orderBy("reported_at", "desc")
              .execute()
          : [];

        return {
          pseudonym: participant.pseudonym,
          tasks: tasks.map((task) => {
            const latest = reports.find(
              (report) => report.assignment_id === task.id,
            );

            return {
              assignmentId: task.id,
              goal: task.goal,
              assignedAt: task.assigned_at.toISOString(),
              latest: latest
                ? {
                    outcome: latest.outcome as PilotOutcome,
                    comment: latest.comment,
                    reportedAt: latest.reported_at.toISOString(),
                  }
                : null,
            };
          }),
        };
      },
    ),
  present: ({ resource }) => loaded(resource.data),
});

import { randomUUID } from "node:crypto";
import type { PilotWorkspace } from "@lanbort/contracts";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor, UserActor } from "../actor";
import { deleteOwnAccount } from "../account/deletion";
import { executeQuery, type QueryDefinition } from "../commands/query";
import { isDomainError } from "../errors";
import {
  connectAdminTestDatabase,
  connectTestDatabase,
} from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { allOperations, attempt } from "../testing/operations";
import {
  addPilotParticipant,
  assignPilotTask,
  changePilotDefect,
  changePilotPhase,
  closePilotCampaign,
  recordPilotRun,
  removePilotParticipant,
  reportPilotDefect,
  reportPilotTask,
  requestPilotRetest,
  startPilotCampaign,
  withdrawPilotTask,
} from "./commands";
import { pilotCase, pilotCaseRevision } from "./catalogue";
import { exportPilot } from "./export";
import { purgePilotLinks } from "./maintenance";
import { nextPseudonym } from "./model";
import {
  readPilotRole,
  readPilotTasks,
  readPilotTest,
  readPilotWorkspace,
} from "./queries";

/**
 * The pilot journal (docs/implementation/pilot-ui.md): the lead's
 * campaign, runs, defects and tasks; the participants' own tasks; and what
 * nobody else can reach. The journal holds one open campaign at a time, so
 * this file is the only one that starts campaigns.
 */
const db = connectTestDatabase();
const admin = connectAdminTestDatabase();
afterAll(() => Promise.all([db.destroy(), admin.destroy()]));

const day = 24 * 60 * 60 * 1000;

// The current campaign is the latest started, so each run of this file
// starts its clock a day beyond the campaigns earlier runs left.
const { latest } = await admin
  .selectFrom("app.pilot_campaigns")
  .select(({ fn }) => fn.max("started_at").as("latest"))
  .executeTakeFirstOrThrow();
const kit = loanTestKit(db, {
  startInDays: latest
    ? Math.max(0, Math.ceil((new Date(latest).getTime() - Date.now()) / day)) +
      1
    : 0,
});
const { run, user } = kit;

const read = <I, R, C, O>(
  query: QueryDefinition<I, R, C, O>,
  actor: Actor,
  input: object = {},
) => executeQuery(kit.tick(), query, { actor, input });

/** The refusal's code, or what came back instead. */
const refusal = (promise: Promise<unknown>) =>
  promise.then(
    (value) => value,
    (error: unknown) => {
      if (!isDomainError(error)) throw error;
      return error.code;
    },
  );

const emailOf = async ({ userId }: UserActor) =>
  (
    await db
      .selectFrom("app.verified_contacts")
      .select("address")
      .where("user_id", "=", userId)
      .where("kind", "=", "email")
      .executeTakeFirstOrThrow()
  ).address;

/** A new account made a lead, as the database owner does it. */
async function lead() {
  const actor = await user();
  await sql`select app.grant_pilot_lead(${await emailOf(actor)}, 'Test')`.execute(
    admin,
  );
  return actor;
}

async function participant(by: UserActor) {
  const actor = await user();
  const added = await run(addPilotParticipant, by, {
    email: await emailOf(actor),
  });
  return { actor, ...added };
}

const runInput = (campaignId: string, testId: string, more: object = {}) => ({
  campaignId,
  testId,
  status: "passed",
  appVersion: "abc1234",
  environment: "production",
  device: "mobile",
  helped: false,
  testerId: null,
  ...more,
});

const testOf = (workspace: PilotWorkspace, testId: string) =>
  workspace.tests.find((test) => test.id === testId)!;

// Campaigns an earlier run of this file left open would stop it.
beforeAll(async () => {
  await admin
    .updateTable("app.pilot_campaigns")
    .set({
      closed_at: sql`greatest(now(), started_at)`,
      closed_by: sql`started_by`,
    })
    .where("closed_at", "is", null)
    .execute();
});

describe("the lead's campaign", () => {
  it("records runs, defects and retests without overwriting anything", async () => {
    const boss = await lead();
    const tester = await participant(boss);
    const { id: campaignId } = await run(startPilotCampaign, boss, {
      name: "Lukket pilot",
    });

    expect(
      await refusal(run(startPilotCampaign, boss, { name: "En til" })),
    ).toBe("conflict");

    const fresh = await read(readPilotWorkspace, boss);
    expect(fresh.campaign).toMatchObject({ id: campaignId, phase: 0 });
    expect(fresh.tests).toHaveLength(98);
    expect(fresh.progress.counts.not_started).toBe(98);
    expect(fresh.participants).toContainEqual(
      expect.objectContaining({
        id: tester.id,
        pseudonym: tester.pseudonym,
        name: "Test Testesen",
      }),
    );

    await run(
      recordPilotRun,
      boss,
      runInput(campaignId, "A01", { testerId: tester.id, helped: true }),
    );
    const failed = await run(
      recordPilotRun,
      boss,
      runInput(campaignId, "A02", {
        status: "failed",
        note: "Koden kom ikke fram",
        newDefect: { title: "Ingen kode på e-post", severity: "P1" },
      }),
    );
    expect(failed.defectId).toEqual(expect.any(String));
    await run(
      recordPilotRun,
      boss,
      runInput(campaignId, "A03", {
        status: "failed",
        note: "Samme feil",
        defectId: failed.defectId,
      }),
    );

    // A defect from nowhere, a test the catalogue lacks: nothing is found.
    expect(
      await refusal(
        run(
          recordPilotRun,
          boss,
          runInput(campaignId, "A04", {
            status: "failed",
            note: "x",
            defectId: randomUUID(),
          }),
        ),
      ),
    ).toBe("not_found");
    expect(
      await refusal(run(recordPilotRun, boss, runInput(campaignId, "Z99"))),
    ).toBe("invalid_input");
    expect(
      await refusal(run(recordPilotRun, boss, runInput(campaignId, "A99"))),
    ).toBe("not_found");

    let workspace = await read(readPilotWorkspace, boss);
    expect(testOf(workspace, "A01").status).toBe("passed");
    expect(testOf(workspace, "A02")).toMatchObject({
      status: "failed",
      openDefects: 1,
    });
    expect(workspace.defects).toEqual([
      expect.objectContaining({
        id: failed.defectId,
        number: 1,
        severity: "P1",
        status: "open",
        testIds: ["A02", "A03"],
      }),
    ]);
    expect(workspace.progress.gates[0]!).toMatchObject({
      blockingDefects: 1,
      open: false,
    });

    // A fix sends the tests back; the failure stays in their history.
    await run(changePilotDefect, boss, {
      defectId: failed.defectId,
      status: "fixed",
    });
    await run(requestPilotRetest, boss, {
      campaignId,
      appVersion: "def5678",
      testIds: ["A01", "A02"],
    });
    workspace = await read(readPilotWorkspace, boss);
    expect(testOf(workspace, "A02").status).toBe("retest");
    expect(workspace.progress.gates[0]!.blockingDefects).toBe(1);

    // Runs of earlier campaigns are in the history too, under their own.
    const runsOf = async (testId: string) =>
      (await read(readPilotTest, boss, { testId })).runs.filter(
        (each) => each.campaignId === campaignId,
      );
    const history = await runsOf("A02");
    expect(history.map((each) => each.status)).toEqual(["retest", "failed"]);
    expect(history[1]).toMatchObject({
      appVersion: "abc1234",
      note: "Koden kom ikke fram",
      defect: { number: 1, status: "fixed" },
    });
    expect(history[0]).toMatchObject({
      appVersion: "def5678",
      device: null,
    });
    expect((await runsOf("A01"))[1]).toMatchObject({
      tester: tester.pseudonym,
      helped: true,
    });

    // The card tells the tester everything, and a run keeps all of it.
    const a02 = pilotCase("A02");
    expect(
      (await read(readPilotTest, boss, { testId: "A02" })).wording,
    ).toEqual({
      action: a02.action,
      expected: a02.expected,
      prepare: a02.prepare,
      steps: a02.steps,
      passWhen: a02.passWhen,
    });
    expect(
      await db
        .selectFrom("app.pilot_case_revisions")
        .select(["prepare", "steps", "pass_when"])
        .where("test_id", "=", "A02")
        .where("revision", "=", pilotCaseRevision(a02))
        .executeTakeFirstOrThrow(),
    ).toEqual({
      prepare: a02.prepare,
      steps: a02.steps,
      pass_when: a02.passWhen,
    });

    await run(changePilotDefect, boss, {
      defectId: failed.defectId,
      status: "closed",
      severity: "P2",
    });
    await run(reportPilotDefect, boss, {
      campaignId,
      title: "Teksten er for liten",
      severity: "P3",
    });

    // A label or a direct API call cannot skip phases or bypass the gate.
    expect(
      await refusal(run(changePilotPhase, boss, { campaignId, phase: 2 })),
    ).toBe("invalid_input");
    expect(
      await refusal(run(changePilotPhase, boss, { campaignId, phase: 1 })),
    ).toBe("conflict");

    // All four phase-0 checks must have real recorded results.
    for (const testId of ["A02", "D10", "S02", "S09"]) {
      await run(recordPilotRun, boss, runInput(campaignId, testId));
    }
    await run(changePilotPhase, boss, { campaignId, phase: 1 });
    expect(
      await refusal(run(changePilotPhase, boss, { campaignId, phase: 0 })),
    ).toBe("invalid_input");
    expect(
      await refusal(run(changePilotPhase, boss, { campaignId, phase: 3 })),
    ).toBe("invalid_input");

    workspace = await read(readPilotWorkspace, boss);
    expect(workspace.campaign!.phase).toBe(1);
    expect(workspace.defects.map((defect) => defect.number)).toEqual([1, 2]);
    expect(workspace.progress.gates[0]!.blockingDefects).toBe(0);

    // The record of changes holds codes and ids, never the notes.
    const audit = await db
      .selectFrom("app.pilot_audit")
      .select(["action", "details"])
      .where("campaign_id", "=", campaignId)
      .orderBy("position")
      .execute();
    expect(audit.map((row) => row.action)).toEqual([
      "campaign_started",
      "run_recorded",
      "defect_reported",
      "run_recorded",
      "run_recorded",
      "defect_changed",
      "retest_requested",
      "defect_changed",
      "defect_reported",
      "run_recorded",
      "run_recorded",
      "run_recorded",
      "run_recorded",
      "phase_changed",
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/Koden|Samme feil|Ingen kode/);

    await run(closePilotCampaign, boss, { campaignId });
  });
});

describe("participants", () => {
  it("see their own tasks only, and report on them", async () => {
    const boss = await lead();
    const first = await participant(boss);
    const second = await participant(boss);
    const { id: campaignId } = await run(startPilotCampaign, boss, {
      name: "Oppgaver",
    });
    const mine = await run(assignPilotTask, boss, {
      campaignId,
      testId: "T01",
      participantId: first.id,
      goal: "Legg ut en ting du kan låne bort",
    });
    const theirs = await run(assignPilotTask, boss, {
      campaignId,
      testId: "T02",
      participantId: second.id,
      goal: "Finn en ting i et miljø",
    });

    expect(
      await refusal(
        run(assignPilotTask, boss, {
          campaignId,
          testId: "T01",
          participantId: first.id,
          goal: "Igjen",
        }),
      ),
    ).toBe("conflict");

    expect(await read(readPilotRole, first.actor)).toEqual({
      role: "participant",
    });
    const tasks = await read(readPilotTasks, first.actor);
    expect(tasks).toEqual({
      pseudonym: first.pseudonym,
      tasks: [
        {
          assignmentId: mine.id,
          goal: "Legg ut en ting du kan låne bort",
          assignedAt: expect.any(String),
          latest: null,
        },
      ],
    });
    // Nothing about the test, the lead's results or anyone else.
    expect(JSON.stringify(tasks)).not.toMatch(/T01|T02|Finn en ting/);

    await run(reportPilotTask, first.actor, {
      assignmentId: mine.id,
      outcome: "stuck",
      comment: "Fant ikke knappen",
    });
    await run(reportPilotTask, first.actor, {
      assignmentId: mine.id,
      outcome: "managed",
    });
    expect((await read(readPilotTasks, first.actor)).tasks[0]!.latest).toEqual(
      expect.objectContaining({ outcome: "managed", comment: null }),
    );

    // Another participant's task, the lead's views and the export are not
    // there for a participant.
    expect(
      await refusal(
        run(reportPilotTask, first.actor, {
          assignmentId: theirs.id,
          outcome: "managed",
        }),
      ),
    ).toBe("not_found");
    expect(await refusal(read(readPilotWorkspace, first.actor))).toBe(
      "not_found",
    );
    expect(
      await refusal(read(readPilotTest, first.actor, { testId: "T01" })),
    ).toBe("not_found");
    expect(
      await refusal(run(exportPilot, first.actor, { kind: "results" })),
    ).toBe("not_found");

    // The lead sees what was reported, by pseudonym.
    const card = await read(readPilotTest, boss, { testId: "T01" });
    expect(card.assignments).toEqual([
      expect.objectContaining({
        pseudonym: first.pseudonym,
        feedback: [
          expect.objectContaining({ outcome: "managed" }),
          expect.objectContaining({
            outcome: "stuck",
            comment: "Fant ikke knappen",
          }),
        ],
      }),
    ]);
    expect(
      (await read(readPilotWorkspace, boss)).participants.find(
        (each) => each.id === first.id,
      ),
    ).toMatchObject({ openTasks: 1, reports: 2 });

    // A withdrawn task takes no more reports and is gone from the list.
    await run(withdrawPilotTask, boss, { assignmentId: mine.id });
    expect(
      await refusal(
        run(reportPilotTask, first.actor, {
          assignmentId: mine.id,
          outcome: "managed",
        }),
      ),
    ).toBe("conflict");
    expect((await read(readPilotTasks, first.actor)).tasks).toEqual([]);

    // A removed participant is out of the pilot; what they did stays.
    await run(removePilotParticipant, boss, { participantId: second.id });
    expect(await refusal(read(readPilotTasks, second.actor))).toBe("not_found");
    expect(
      await refusal(
        run(reportPilotTask, second.actor, {
          assignmentId: theirs.id,
          outcome: "managed",
        }),
      ),
    ).toBe("not_found");
    expect(
      (await read(readPilotTest, boss, { testId: "T02" })).assignments[0],
    ).toMatchObject({
      pseudonym: second.pseudonym,
      withdrawnAt: expect.any(String),
    });

    await run(closePilotCampaign, boss, { campaignId });
  });

  it("is a role only an existing, active account gets, once at a time", async () => {
    const boss = await lead();
    const someone = await user();
    const email = await emailOf(someone);

    expect(
      await refusal(run(addPilotParticipant, boss, { email: `x${email}` })),
    ).toBe("not_found");
    await run(addPilotParticipant, boss, { email: email.toUpperCase() });
    expect(await refusal(run(addPilotParticipant, boss, { email }))).toBe(
      "conflict",
    );
  });
});

describe("a closed campaign", () => {
  it("is read-only, and its export carries pseudonyms only where it must", async () => {
    const boss = await lead();
    const tester = await participant(boss);
    const { id: campaignId } = await run(startPilotCampaign, boss, {
      name: "Eksport",
    });
    const task = await run(assignPilotTask, boss, {
      campaignId,
      testId: "L01",
      participantId: tester.id,
      goal: "Spør om å låne noe",
    });
    await run(reportPilotTask, tester.actor, {
      assignmentId: task.id,
      outcome: "needs_help",
      comment: "Hemmelig kommentar",
    });
    const { defectId } = await run(
      recordPilotRun,
      boss,
      runInput(campaignId, "L01", {
        status: "failed",
        testerId: tester.id,
        note: "Hemmelig notat",
        newDefect: { title: "Knappen mangler", severity: "P0" },
      }),
    );
    await run(closePilotCampaign, boss, { campaignId });

    for (const change of [
      () => run(recordPilotRun, boss, runInput(campaignId, "L02")),
      () => run(changePilotPhase, boss, { campaignId, phase: 2 }),
      () => run(closePilotCampaign, boss, { campaignId }),
      () => run(changePilotDefect, boss, { defectId, status: "closed" }),
      () => run(withdrawPilotTask, boss, { assignmentId: task.id }),
      () =>
        run(reportPilotTask, tester.actor, {
          assignmentId: task.id,
          outcome: "managed",
        }),
    ]) {
      expect(await refusal(change())).toBe("conflict");
    }

    const workspace = await read(readPilotWorkspace, boss);
    expect(workspace.campaign).toMatchObject({
      id: campaignId,
      closedAt: expect.any(String),
    });
    expect(testOf(workspace, "L01").status).toBe("failed");
    expect(await read(readPilotTasks, tester.actor)).toMatchObject({
      tasks: [],
    });

    const results = await run(exportPilot, boss, { kind: "results" });
    expect(results).toMatchObject({
      kind: "results",
      catalogueVersion: expect.any(String),
      runs: [
        expect.objectContaining({
          testId: "L01",
          tester: tester.pseudonym,
          note: "Hemmelig notat",
          defectNumber: 1,
        }),
      ],
      tasks: [
        expect.objectContaining({
          pseudonym: tester.pseudonym,
          feedback: [expect.objectContaining({ outcome: "needs_help" })],
        }),
      ],
    });
    expect(JSON.stringify(results)).not.toContain("Test Testesen");

    const summary = await run(exportPilot, boss, { kind: "summary" });
    expect(summary).toMatchObject({
      kind: "summary",
      progress: { total: 98 },
      feedback: expect.arrayContaining([{ outcome: "needs_help", count: 1 }]),
    });
    expect(JSON.stringify(summary)).not.toMatch(/P-\d|Hemmelig|Knappen/);
    expect(
      await db
        .selectFrom("app.pilot_audit")
        .select("action")
        .where("campaign_id", "=", campaignId)
        .where("action", "=", "exported")
        .execute(),
    ).toHaveLength(2);

    // A new campaign leaves this one to export by its id.
    const { id: next } = await run(startPilotCampaign, boss, {
      name: "Neste",
    });
    expect((await read(readPilotWorkspace, boss)).earlierCampaigns).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: campaignId })]),
    );
    expect(await run(exportPilot, boss, { kind: "results" })).toMatchObject({
      campaign: { id: next },
      runs: [],
    });
    expect(
      await run(exportPilot, boss, { kind: "results", campaignId }),
    ).toMatchObject({
      campaign: { id: campaignId },
      runs: [expect.objectContaining({ testId: "L01" })],
    });
    expect(
      await refusal(
        run(exportPilot, boss, { kind: "summary", campaignId: randomUUID() }),
      ),
    ).toBe("not_found");
    await run(closePilotCampaign, boss, { campaignId: next });
  });
});

describe("the lead role", () => {
  it("is granted by the database owner only, never by the app's server", async () => {
    const someone = await user();

    await expect(
      db
        .insertInto("app.pilot_leads")
        .values({ user_id: someone.userId, grant_reason: "Selvutnevnt" })
        .execute(),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      sql`select app.grant_pilot_lead(${await emailOf(someone)}, 'Selv')`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await refusal(read(readPilotRole, someone))).toBe("not_found");
  });

  it("ends when it is revoked, at once", async () => {
    const boss = await lead();
    expect(await read(readPilotRole, boss)).toEqual({ role: "lead" });

    await sql`select app.revoke_pilot_lead(${await emailOf(boss)})`.execute(
      admin,
    );
    expect(await refusal(read(readPilotWorkspace, boss))).toBe("not_found");
  });
});

describe("a deleted account", () => {
  it("leaves the pilot: its pseudonym stays, unlinked and without comments", async () => {
    const boss = await lead();
    const tester = await participant(boss);
    const { id: campaignId } = await run(startPilotCampaign, boss, {
      name: "Sletting",
    });
    const task = await run(assignPilotTask, boss, {
      campaignId,
      testId: "S01",
      participantId: tester.id,
      goal: "Slett kontoen din",
    });
    await run(reportPilotTask, tester.actor, {
      assignmentId: task.id,
      outcome: "managed",
      comment: "Gikk fint",
    });

    await run(deleteOwnAccount, tester.actor, {});

    expect(
      await db
        .selectFrom("app.pilot_participants")
        .select(["user_id", "removed_at"])
        .where("id", "=", tester.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ user_id: null, removed_at: expect.any(Date) });
    const card = await read(readPilotTest, boss, { testId: "S01" });
    expect(card.assignments[0]).toMatchObject({
      pseudonym: tester.pseudonym,
      withdrawnAt: expect.any(String),
      feedback: [{ outcome: "managed", comment: null }],
    });

    await run(deleteOwnAccount, boss, {});
    const revoked = await db
      .selectFrom("app.pilot_leads")
      .select(["granted_at", "revoked_at"])
      .where("user_id", "=", boss.userId)
      .executeTakeFirstOrThrow();
    expect(revoked.revoked_at).toEqual(expect.any(Date));
    expect(revoked.revoked_at!.getTime()).toBeGreaterThanOrEqual(
      revoked.granted_at.getTime(),
    );
    await admin
      .updateTable("app.pilot_campaigns")
      .set({
        closed_at: sql`greatest(now(), started_at)`,
        closed_by: sql`started_by`,
      })
      .where("id", "=", campaignId)
      .execute();
  });
});

/**
 * WP-70 for the pilot: every pilot operation, aimed at a world's campaign,
 * test, defect, participant and task, answers someone outside the pilot,
 * a former participant and a participant (for the lead's operations and
 * another participant's task) exactly as it does for ids that name nothing.
 */
describe("what the pilot shows anyone else", () => {
  interface Ids {
    campaignId: string;
    defectId: string;
    participantId: string;
    assignmentId: string;
    email: string;
  }

  const probes: Record<string, (ids: Ids) => object> = {
    "pilot.read_role": () => ({}),
    "pilot.read_workspace": () => ({}),
    "pilot.read_test": () => ({ testId: "M01" }),
    "pilot.read_tasks": () => ({}),
    "pilot.export": () => ({ kind: "results" }),
    "pilot.start_campaign": () => ({ name: "Kapret" }),
    "pilot.change_phase": ({ campaignId }) => ({ campaignId, phase: 3 }),
    "pilot.close_campaign": ({ campaignId }) => ({ campaignId }),
    "pilot.record_run": ({ campaignId }) => runInput(campaignId, "M01"),
    "pilot.request_retest": ({ campaignId }) => ({
      campaignId,
      appVersion: "abc1234",
      testIds: ["M01"],
    }),
    "pilot.report_defect": ({ campaignId }) => ({
      campaignId,
      title: "Falsk",
      severity: "P0",
    }),
    "pilot.change_defect": ({ defectId }) => ({ defectId, status: "closed" }),
    "pilot.add_participant": ({ email }) => ({ email }),
    "pilot.remove_participant": ({ participantId }) => ({ participantId }),
    "pilot.assign_task": ({ campaignId, participantId }) => ({
      campaignId,
      testId: "M02",
      participantId,
      goal: "Kapret",
    }),
    "pilot.withdraw_task": ({ assignmentId }) => ({ assignmentId }),
    "pilot.report_task": ({ assignmentId }) => ({
      assignmentId,
      outcome: "managed",
    }),
  };

  const operations = allOperations.filter(({ name }) =>
    name.startsWith("pilot."),
  );

  it("has a probe for every pilot operation", () => {
    expect(operations.map(({ name }) => name).sort()).toEqual(
      Object.keys(probes).sort(),
    );
  });

  /** The operations whose answers to `actor` differ from those for nothing. */
  async function reachable(actor: UserActor, ids: Ids, only: string[]) {
    const random: Ids = {
      campaignId: randomUUID(),
      defectId: randomUUID(),
      participantId: randomUUID(),
      assignmentId: randomUUID(),
      email: `${randomUUID()}@example.test`,
    };
    const differences: string[] = [];

    for (const operation of operations.filter(({ name }) =>
      only.includes(name),
    )) {
      const real = await attempt(
        kit.tick(),
        operation,
        actor,
        probes[operation.name]!(ids),
      );
      const none = await attempt(
        kit.tick(),
        operation,
        actor,
        probes[operation.name]!(random),
      );

      for (const outcome of [real, none]) {
        expect(outcome, operation.name).not.toMatchObject({
          refused: "invalid_input",
        });
      }

      if (JSON.stringify(real) !== JSON.stringify(none)) {
        differences.push(operation.name);
      }
    }

    return differences;
  }

  it("answers as if nothing in it existed", async () => {
    const boss = await lead();
    const tester = await participant(boss);
    const other = await participant(boss);
    const former = await participant(boss);
    const outsider = await user();
    const { id: campaignId } = await run(startPilotCampaign, boss, {
      name: "Sveip",
    });
    const { defectId } = await run(
      recordPilotRun,
      boss,
      runInput(campaignId, "M01", {
        status: "failed",
        note: "Feil",
        newDefect: { title: "Feil", severity: "P2" },
      }),
    );
    const theirs = await run(assignPilotTask, boss, {
      campaignId,
      testId: "M01",
      participantId: other.id,
      goal: "Bli med i et miljø",
    });
    await run(assignPilotTask, boss, {
      campaignId,
      testId: "M02",
      participantId: former.id,
      goal: "Forlat et miljø",
    });
    await run(removePilotParticipant, boss, { participantId: former.id });
    const ids: Ids = {
      campaignId,
      defectId: defectId!,
      participantId: other.id,
      assignmentId: theirs.id,
      email: await emailOf(await user()),
    };
    const before = await read(readPilotWorkspace, boss);
    const all = Object.keys(probes);
    const ownPart = ["pilot.read_role", "pilot.read_tasks"];

    expect(await reachable(outsider, ids, all)).toEqual([]);
    expect(await reachable(former.actor, ids, all)).toEqual([]);
    expect(
      await reachable(
        tester.actor,
        ids,
        all.filter((name) => !ownPart.includes(name)),
      ),
    ).toEqual([]);

    // Nothing anyone tried changed the journal.
    expect(await read(readPilotWorkspace, boss)).toEqual(before);
    await run(closePilotCampaign, boss, { campaignId });
  });
});

describe("what the pilot journal keeps (retention.md)", () => {
  it("strips comments and unlinks pseudonyms once their time is up", async () => {
    const boss = await lead();
    const tester = await participant(boss);
    const { id: campaignId } = await run(startPilotCampaign, boss, {
      name: "Oppbevaring",
    });
    const task = await run(assignPilotTask, boss, {
      campaignId,
      testId: "R01",
      participantId: tester.id,
      goal: "Skriv en anmeldelse",
    });
    await run(reportPilotTask, tester.actor, {
      assignmentId: task.id,
      outcome: "stuck",
      comment: "Vanskelig",
    });
    await run(closePilotCampaign, boss, { campaignId });

    const comment = () =>
      db
        .selectFrom("app.pilot_feedback")
        .select("comment")
        .where("assignment_id", "=", task.id)
        .executeTakeFirstOrThrow();
    const link = () =>
      db
        .selectFrom("app.pilot_participants")
        .select("user_id")
        .where("id", "=", tester.id)
        .executeTakeFirstOrThrow();

    await purgePilotLinks(db, kit.now(), 90 * day);
    expect(await comment()).toEqual({ comment: "Vanskelig" });
    expect(await link()).toEqual({ user_id: tester.actor.userId });

    // Ninety days after every campaign closed, the pilot is over.
    await purgePilotLinks(
      db,
      new Date(kit.now().getTime() + 91 * day),
      90 * day,
    );
    expect(await comment()).toEqual({ comment: null });
    expect(await link()).toEqual({ user_id: null });
    expect(await refusal(read(readPilotTasks, tester.actor))).toBe("not_found");
  });

  it("keeps a participant who joined after the last campaign until their own time is up", async () => {
    const boss = await lead();
    const { id: campaignId } = await run(startPilotCampaign, boss, {
      name: "Før de kom",
    });
    await run(closePilotCampaign, boss, { campaignId });
    const later = await user();
    const { id } = await admin
      .insertInto("app.pilot_participants")
      .values({
        user_id: later.userId,
        pseudonym: nextPseudonym(
          (
            await admin
              .selectFrom("app.pilot_participants")
              .select("pseudonym")
              .execute()
          ).map((row) => row.pseudonym),
        ),
        added_at: new Date(kit.now().getTime() + 60 * day),
        added_by: boss.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const link = () =>
      db
        .selectFrom("app.pilot_participants")
        .select("user_id")
        .where("id", "=", id)
        .executeTakeFirstOrThrow();

    await purgePilotLinks(
      db,
      new Date(kit.now().getTime() + 91 * day),
      90 * day,
    );
    expect(await link()).toEqual({ user_id: later.userId });

    await purgePilotLinks(
      db,
      new Date(kit.now().getTime() + 151 * day),
      90 * day,
    );
    expect(await link()).toEqual({ user_id: null });
  });
});

import {
  pilotAssignmentInputSchema,
  pilotAssignmentRefSchema,
  pilotCampaignInputSchema,
  pilotCampaignRefSchema,
  pilotConfirmationInputSchema,
  pilotConfirmationRefSchema,
  pilotDefectChangeSchema,
  pilotDefectInputSchema,
  pilotIdOutputSchema,
  pilotParticipantInputSchema,
  pilotParticipantOutputSchema,
  pilotParticipantRefSchema,
  pilotPhaseChangeSchema,
  pilotReadinessCheckSchema,
  pilotRequirementsOf,
  pilotRetestInputSchema,
  pilotRetestOutputSchema,
  pilotRunInputSchema,
  pilotRunOutputSchema,
  pilotTaskReportSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Transaction } from "kysely";
import type { Actor } from "../actor";
import { rateLimits } from "../abuse/rate-limits";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import { pilotCase } from "./catalogue";
import { loadCampaignReadiness } from "./readiness";
import { nextPseudonym } from "./model";
import {
  addPilotParticipantPolicy,
  assignPilotTaskPolicy,
  changePilotDefectPolicy,
  changePilotPhasePolicy,
  checkPilotReadinessPolicy,
  closePilotCampaignPolicy,
  confirmPilotRequirementPolicy,
  recordPilotRunPolicy,
  removePilotParticipantPolicy,
  reportPilotDefectPolicy,
  reportPilotTaskPolicy,
  requestPilotRetestPolicy,
  startPilotCampaignPolicy,
  withdrawPilotConfirmationPolicy,
  withdrawPilotTaskPolicy,
} from "./policies";
import { keepRevision, loadPilotViewer, recordPilotAudit } from "./store";

type Tx = Transaction<Database>;

/** Who acted, as the journal's rows name them. */
const userOf = (actor: Actor) => {
  if (actor.kind !== "user") {
    throw new Error("Only signed-in users act in the pilot journal");
  }

  return actor.userId;
};

const scope = async (tx: Tx, actor: Actor) => ({
  resource: { viewer: await loadPilotViewer(tx, actor) },
  context: undefined,
});

/**
 * The campaign a change is made in, locked: `share` for what is added to
 * it, `update` for what changes the campaign itself, so a close waits for
 * changes under way. Null for an id that names none; the policy decides
 * before anything says whether it is open.
 */
async function campaignScope(
  tx: Tx,
  actor: Actor,
  campaignId: string,
  lock: "share" | "update",
) {
  const query = tx
    .selectFrom("app.pilot_campaigns")
    .select(["id", "closed_at"])
    .where("id", "=", campaignId);
  const campaign = await (
    lock === "update" ? query.forUpdate() : query.forShare()
  ).executeTakeFirst();

  return campaign
    ? {
        resource: { viewer: await loadPilotViewer(tx, actor), campaign },
        context: undefined,
      }
    : null;
}

/** A closed campaign is read-only (pilot-ui.md «Livssyklus»). */
function requireOpen(campaign: { closed_at: Date | null }) {
  if (campaign.closed_at) {
    throw new DomainError("conflict", "The campaign is closed");
  }
}

/** Numbers are handed out one at a time per campaign (F-1, F-2, …). */
async function newDefect(
  tx: Tx,
  actor: Actor,
  campaignId: string,
  defect: {
    title: string;
    severity: string;
    description?: string | undefined;
    link?: string | undefined;
  },
  now: Date,
) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`pilot_defects:${campaignId}`}, 0))`.execute(
    tx,
  );
  const { highest } = await tx
    .selectFrom("app.pilot_defects")
    .select(({ fn }) => fn.max("number").as("highest"))
    .where("campaign_id", "=", campaignId)
    .executeTakeFirstOrThrow();
  const created = await tx
    .insertInto("app.pilot_defects")
    .values({
      campaign_id: campaignId,
      number: (highest ?? 0) + 1,
      title: defect.title,
      description: defect.description ?? null,
      link: defect.link ?? null,
      severity: defect.severity,
      created_at: now,
      created_by: userOf(actor),
      updated_at: now,
    })
    .returning(["id", "number"])
    .executeTakeFirstOrThrow();

  await recordPilotAudit(tx, actor, "defect_reported", now, {
    campaignId,
    subjectId: created.id,
    details: { number: created.number, severity: defect.severity },
  });

  return created.id;
}

/** An active participant's id, or `not_found`. */
async function activeParticipant(db: Kysely<Database>, participantId: string) {
  const participant = await db
    .selectFrom("app.pilot_participants")
    .select("id")
    .where("id", "=", participantId)
    .where("removed_at", "is", null)
    .executeTakeFirst();

  if (!participant) {
    throw new DomainError("not_found", "No such participant");
  }

  return participant.id;
}

/** A unique index said the row is there already. */
function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export const startPilotCampaign = defineCommand({
  name: "pilot.start_campaign",
  input: pilotCampaignInputSchema,
  output: pilotIdOutputSchema,
  policy: startPilotCampaignPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor }) => scope(tx, actor),
  execute: async ({ tx, actor, input, now }) => {
    try {
      const campaign = await tx
        .insertInto("app.pilot_campaigns")
        .values({
          name: input.name,
          started_at: now,
          started_by: userOf(actor),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await recordPilotAudit(tx, actor, "campaign_started", now, {
        campaignId: campaign.id,
      });

      return { id: campaign.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError("conflict", "A campaign is already open");
      }

      throw error;
    }
  },
});

export const changePilotPhase = defineCommand({
  name: "pilot.change_phase",
  input: pilotPhaseChangeSchema,
  output: pilotIdOutputSchema,
  policy: changePilotPhasePolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "update"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    const { phase: from } = await tx
      .selectFrom("app.pilot_campaigns")
      .select("phase")
      .where("id", "=", input.campaignId)
      .executeTakeFirstOrThrow();

    if (input.phase !== from + 1) {
      throw new DomainError(
        "invalid_input",
        "A pilot campaign can only continue to its next phase",
      );
    }

    // Its tests and defects, and every requirement of its checklist, hold
    // now: automatic checks within the hour, manual ones confirmed.
    const { progress, readiness } = await loadCampaignReadiness(
      tx,
      input.campaignId,
      now,
    );
    const checklist = readiness.find((each) => each.phase === from);

    if (!progress.gates[from]?.open || (checklist && !checklist.ready)) {
      throw new DomainError(
        "conflict",
        "The current phase is not ready to finish",
      );
    }

    await tx
      .updateTable("app.pilot_campaigns")
      .set({ phase: input.phase })
      .where("id", "=", input.campaignId)
      .execute();
    await recordPilotAudit(tx, actor, "phase_changed", now, {
      campaignId: input.campaignId,
      details: { from, to: input.phase },
    });

    return { id: input.campaignId };
  },
});

/** The campaign's phase, which only its checklist is open for. */
async function phaseOf(tx: Tx, campaignId: string) {
  const { phase } = await tx
    .selectFrom("app.pilot_campaigns")
    .select("phase")
    .where("id", "=", campaignId)
    .executeTakeFirstOrThrow();

  return phase;
}

/** A requirement of the campaign's current phase, checked as `check`. */
function requirementOf(phase: number, requirementId: string, check: string) {
  const requirement = pilotRequirementsOf(phase).find(
    (each) => each.id === requirementId,
  );

  if (!requirement) {
    throw new DomainError(
      "conflict",
      "The requirement is not on the current phase's checklist",
    );
  }

  if (requirement.check !== check) {
    throw new DomainError("invalid_input", `Not a ${check} requirement`, [
      "requirementId",
    ]);
  }

  return requirement;
}

/**
 * Records what the server's automatic checks found for the current phase's
 * checklist (pilot-ui.md «Gjennomføring per fase»). Only the server runs
 * the checks and fills in `results` (`/api/pilot/campaigns/{id}/readiness`);
 * every automatic requirement of the phase must be in them. Running them
 * again adds another record, so retrying is harmless.
 */
export const checkPilotReadiness = defineCommand({
  name: "pilot.check_readiness",
  input: pilotReadinessCheckSchema,
  output: pilotIdOutputSchema,
  policy: checkPilotReadinessPolicy,
  idempotency: "none",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "share"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    const phase = await phaseOf(tx, input.campaignId);
    const automatic = pilotRequirementsOf(phase).filter(
      (requirement) => requirement.check === "automatic",
    );
    const ids = input.results.map((each) => each.requirementId);

    if (automatic.length === 0) {
      throw new DomainError("conflict", "The phase has nothing to check");
    }

    if (
      new Set(ids).size !== ids.length ||
      automatic.some((requirement) => !ids.includes(requirement.id))
    ) {
      throw new DomainError(
        "invalid_input",
        "Every automatic requirement of the phase is checked, once",
        ["results"],
      );
    }

    const results = input.results.filter((each) =>
      automatic.some((requirement) => requirement.id === each.requirementId),
    );

    await tx
      .insertInto("app.pilot_readiness_checks")
      .values(
        results.map((each) => ({
          campaign_id: input.campaignId,
          requirement_id: each.requirementId,
          status: each.status,
          summary: each.summary,
          details: each.details,
          links: JSON.stringify(each.links),
          recorded_at: now,
          recorded_by: userOf(actor),
        })),
      )
      .execute();
    await recordPilotAudit(tx, actor, "readiness_checked", now, {
      campaignId: input.campaignId,
      details: {
        phase,
        ...Object.fromEntries(
          (["passed", "failed", "unchecked"] as const).map((status) => [
            status,
            results
              .filter((each) => each.status === status)
              .map((each) => each.requirementId),
          ]),
        ),
      },
    });

    return { id: input.campaignId };
  },
});

/**
 * The lead confirms a requirement of the current phase that only a person
 * can check, saying how it was checked; who and when are the server's.
 */
export const confirmPilotRequirement = defineCommand({
  name: "pilot.confirm_requirement",
  input: pilotConfirmationInputSchema,
  output: pilotIdOutputSchema,
  policy: confirmPilotRequirementPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "update"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    requirementOf(
      await phaseOf(tx, input.campaignId),
      input.requirementId,
      "manual",
    );
    const confirmation = await tx
      .insertInto("app.pilot_readiness_confirmations")
      .values({
        campaign_id: input.campaignId,
        requirement_id: input.requirementId,
        confirmed: true,
        note: input.note,
        recorded_at: now,
        recorded_by: userOf(actor),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await recordPilotAudit(tx, actor, "requirement_confirmed", now, {
      campaignId: input.campaignId,
      subjectId: confirmation.id,
      details: { requirementId: input.requirementId },
    });

    return { id: confirmation.id };
  },
});

/** Takes back the lead's confirmation, such as one made by mistake. */
export const withdrawPilotConfirmation = defineCommand({
  name: "pilot.withdraw_confirmation",
  input: pilotConfirmationRefSchema,
  output: pilotIdOutputSchema,
  policy: withdrawPilotConfirmationPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "update"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    requirementOf(
      await phaseOf(tx, input.campaignId),
      input.requirementId,
      "manual",
    );
    const latest = await tx
      .selectFrom("app.pilot_readiness_confirmations")
      .select("confirmed")
      .where("campaign_id", "=", input.campaignId)
      .where("requirement_id", "=", input.requirementId)
      .orderBy("recorded_at", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!latest?.confirmed) {
      throw new DomainError("conflict", "The requirement is not confirmed");
    }

    const withdrawal = await tx
      .insertInto("app.pilot_readiness_confirmations")
      .values({
        campaign_id: input.campaignId,
        requirement_id: input.requirementId,
        confirmed: false,
        recorded_at: now,
        recorded_by: userOf(actor),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await recordPilotAudit(tx, actor, "confirmation_withdrawn", now, {
      campaignId: input.campaignId,
      subjectId: withdrawal.id,
      details: { requirementId: input.requirementId },
    });

    return { id: withdrawal.id };
  },
});

export const closePilotCampaign = defineCommand({
  name: "pilot.close_campaign",
  input: pilotCampaignRefSchema,
  output: pilotIdOutputSchema,
  policy: closePilotCampaignPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "update"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    await tx
      .updateTable("app.pilot_campaigns")
      .set({ closed_at: now, closed_by: userOf(actor) })
      .where("id", "=", input.campaignId)
      .execute();
    await recordPilotAudit(tx, actor, "campaign_closed", now, {
      campaignId: input.campaignId,
    });

    return { id: input.campaignId };
  },
});

/**
 * One test run (pilot-ui.md «Ett testkort»): a new row every time, so an
 * earlier result is never overwritten. A failure is tied to a defect, a new
 * one or one already reported in the campaign.
 */
export const recordPilotRun = defineCommand({
  name: "pilot.record_run",
  input: pilotRunInputSchema,
  output: pilotRunOutputSchema,
  policy: recordPilotRunPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "share"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    const test = pilotCase(input.testId);
    const revision = await keepRevision(tx, test, now);
    const testerId = input.testerId
      ? await activeParticipant(tx, input.testerId)
      : null;
    let defectId: string | null = null;

    if (input.defectId) {
      const defect = await tx
        .selectFrom("app.pilot_defects")
        .select("id")
        .where("id", "=", input.defectId)
        .where("campaign_id", "=", input.campaignId)
        .executeTakeFirst();

      if (!defect) {
        throw new DomainError("not_found", "No such defect in the campaign");
      }

      defectId = defect.id;
    } else if (input.newDefect) {
      defectId = await newDefect(
        tx,
        actor,
        input.campaignId,
        input.newDefect,
        now,
      );
    }

    const run = await tx
      .insertInto("app.pilot_runs")
      .values({
        campaign_id: input.campaignId,
        test_id: test.id,
        revision,
        status: input.status,
        recorded_at: now,
        recorded_by: userOf(actor),
        tester_id: testerId,
        app_version: input.appVersion,
        environment: input.environment,
        device: input.device,
        platform: input.platform ?? null,
        helped: input.helped,
        note: input.note ?? null,
        defect_id: defectId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await recordPilotAudit(tx, actor, "run_recorded", now, {
      campaignId: input.campaignId,
      subjectId: run.id,
      details: { testId: test.id, status: input.status },
    });

    return { id: run.id, defectId };
  },
});

/**
 * «Må testes igjen» for one or more tests, such as after a fix: a new run
 * for each, so what was found before stays.
 */
export const requestPilotRetest = defineCommand({
  name: "pilot.request_retest",
  input: pilotRetestInputSchema,
  output: pilotRetestOutputSchema,
  policy: requestPilotRetestPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "share"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    const tests = input.testIds.map(pilotCase);
    const runIds: string[] = [];

    for (const test of tests) {
      const run = await tx
        .insertInto("app.pilot_runs")
        .values({
          campaign_id: input.campaignId,
          test_id: test.id,
          revision: await keepRevision(tx, test, now),
          status: "retest",
          recorded_at: now,
          recorded_by: userOf(actor),
          app_version: input.appVersion,
          note: input.note ?? null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      runIds.push(run.id);
    }

    await recordPilotAudit(tx, actor, "retest_requested", now, {
      campaignId: input.campaignId,
      details: { testIds: tests.map((test) => test.id) },
    });

    return { runIds };
  },
});

/** A defect found outside a run, such as in a conversation. */
export const reportPilotDefect = defineCommand({
  name: "pilot.report_defect",
  input: pilotDefectInputSchema,
  output: pilotIdOutputSchema,
  policy: reportPilotDefectPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "share"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    const { campaignId, ...defect } = input;

    return { id: await newDefect(tx, actor, campaignId, defect, now) };
  },
});

/** Prioritizing and following up a defect: its severity and status. */
export const changePilotDefect = defineCommand({
  name: "pilot.change_defect",
  input: pilotDefectChangeSchema,
  output: pilotIdOutputSchema,
  policy: changePilotDefectPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: async ({ tx, actor, input }) => {
    const defect = await tx
      .selectFrom("app.pilot_defects as defect")
      .innerJoin(
        "app.pilot_campaigns as campaign",
        "campaign.id",
        "defect.campaign_id",
      )
      .select([
        "defect.id",
        "defect.campaign_id",
        "defect.severity",
        "defect.status",
        "campaign.closed_at",
      ])
      .where("defect.id", "=", input.defectId)
      .forUpdate()
      .executeTakeFirst();

    return defect
      ? {
          resource: { viewer: await loadPilotViewer(tx, actor), defect },
          context: undefined,
        }
      : null;
  },
  execute: async ({ tx, actor, input, resource: { defect }, now }) => {
    requireOpen(defect);
    const severity = input.severity ?? defect.severity;
    const status = input.status ?? defect.status;

    if (severity === defect.severity && status === defect.status) {
      return { id: defect.id };
    }

    await tx
      .updateTable("app.pilot_defects")
      .set({ severity, status, updated_at: now })
      .where("id", "=", defect.id)
      .execute();
    await recordPilotAudit(tx, actor, "defect_changed", now, {
      campaignId: defect.campaign_id,
      subjectId: defect.id,
      details: {
        severityFrom: defect.severity,
        severity,
        statusFrom: defect.status,
        status,
      },
    });

    return { id: defect.id };
  },
});

/**
 * Takes an existing account into the pilot as the next pseudonym, found by
 * its whole verified e-mail address, never by a name (as OD-0055).
 */
export const addPilotParticipant = defineCommand({
  name: "pilot.add_participant",
  input: pilotParticipantInputSchema,
  output: pilotParticipantOutputSchema,
  policy: addPilotParticipantPolicy,
  idempotency: "required",
  rateLimit: rateLimits.lookups,
  load: ({ tx, actor }) => scope(tx, actor),
  execute: async ({ tx, actor, input, now }) => {
    const account = await tx
      .selectFrom("app.verified_contacts as contact")
      .innerJoin("app.users as user", "user.id", "contact.user_id")
      .select("user.id")
      .where("contact.kind", "=", "email")
      .where("contact.address", "=", input.email)
      .where("user.status", "=", "active")
      .executeTakeFirst();

    if (!account) {
      throw new DomainError("not_found", "No active account has the address");
    }

    await sql`select pg_advisory_xact_lock(hashtextextended('pilot_participants', 0))`.execute(
      tx,
    );
    const already = await tx
      .selectFrom("app.pilot_participants")
      .select(["id", "pseudonym"])
      .where("user_id", "=", account.id)
      .where("removed_at", "is", null)
      .executeTakeFirst();

    if (already) {
      throw new DomainError("conflict", "The account already takes part");
    }

    const taken = await tx
      .selectFrom("app.pilot_participants")
      .select("pseudonym")
      .execute();
    const participant = await tx
      .insertInto("app.pilot_participants")
      .values({
        user_id: account.id,
        pseudonym: nextPseudonym(taken.map((row) => row.pseudonym)),
        added_at: now,
        added_by: userOf(actor),
      })
      .returning(["id", "pseudonym"])
      .executeTakeFirstOrThrow();

    await recordPilotAudit(tx, actor, "participant_added", now, {
      subjectId: participant.id,
      details: { pseudonym: participant.pseudonym },
    });

    return participant;
  },
});

/**
 * Ends someone's part in the pilot: their open tasks are withdrawn, and
 * what they reported stays under their pseudonym.
 */
export async function endPilotParticipation(
  tx: Kysely<Database>,
  participantId: string,
  by: string | null,
  now: Date,
) {
  await tx
    .updateTable("app.pilot_assignments")
    .set({ withdrawn_at: now, withdrawn_by: by })
    .where("participant_id", "=", participantId)
    .where("withdrawn_at", "is", null)
    .where(({ eb, fn }) =>
      eb(fn("app.pilot_campaign_open", ["campaign_id"]), "=", true),
    )
    .execute();
  await tx
    .updateTable("app.pilot_participants")
    .set({ removed_at: now, removed_by: by })
    .where("id", "=", participantId)
    .where("removed_at", "is", null)
    .execute();
}

export const removePilotParticipant = defineCommand({
  name: "pilot.remove_participant",
  input: pilotParticipantRefSchema,
  output: pilotIdOutputSchema,
  policy: removePilotParticipantPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: async ({ tx, actor, input }) => {
    const participant = await tx
      .selectFrom("app.pilot_participants")
      .select("id")
      .where("id", "=", input.participantId)
      .where("removed_at", "is", null)
      .forUpdate()
      .executeTakeFirst();

    return participant ? scope(tx, actor) : null;
  },
  execute: async ({ tx, actor, input, now }) => {
    await endPilotParticipation(tx, input.participantId, userOf(actor), now);
    await recordPilotAudit(tx, actor, "participant_removed", now, {
      subjectId: input.participantId,
    });

    return { id: input.participantId };
  },
});

/** A task for a participant: a short goal for one test, nothing more. */
export const assignPilotTask = defineCommand({
  name: "pilot.assign_task",
  input: pilotAssignmentInputSchema,
  output: pilotIdOutputSchema,
  policy: assignPilotTaskPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: ({ tx, actor, input }) =>
    campaignScope(tx, actor, input.campaignId, "share"),
  execute: async ({ tx, actor, input, resource, now }) => {
    requireOpen(resource.campaign);
    const test = pilotCase(input.testId);
    const participantId = await activeParticipant(tx, input.participantId);

    try {
      const task = await tx
        .insertInto("app.pilot_assignments")
        .values({
          campaign_id: input.campaignId,
          test_id: test.id,
          participant_id: participantId,
          goal: input.goal,
          assigned_at: now,
          assigned_by: userOf(actor),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await recordPilotAudit(tx, actor, "task_assigned", now, {
        campaignId: input.campaignId,
        subjectId: task.id,
        details: { testId: test.id },
      });

      return { id: task.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError("conflict", "The participant has the task");
      }

      throw error;
    }
  },
});

/** The task with its campaign, locked, or null for an id that names none. */
async function loadTask(tx: Tx, assignmentId: string) {
  return tx
    .selectFrom("app.pilot_assignments as task")
    .innerJoin(
      "app.pilot_campaigns as campaign",
      "campaign.id",
      "task.campaign_id",
    )
    .select([
      "task.id",
      "task.campaign_id",
      "task.participant_id",
      "task.withdrawn_at",
      "campaign.closed_at",
    ])
    .where("task.id", "=", assignmentId)
    .forUpdate("task")
    .forShare("campaign")
    .executeTakeFirst();
}

export const withdrawPilotTask = defineCommand({
  name: "pilot.withdraw_task",
  input: pilotAssignmentRefSchema,
  output: pilotIdOutputSchema,
  policy: withdrawPilotTaskPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: async ({ tx, actor, input }) => {
    const task = await loadTask(tx, input.assignmentId);

    return task
      ? {
          resource: { viewer: await loadPilotViewer(tx, actor), task },
          context: undefined,
        }
      : null;
  },
  execute: async ({ tx, actor, resource: { task }, now }) => {
    requireOpen(task);

    if (task.withdrawn_at) {
      throw new DomainError("conflict", "The task is already withdrawn");
    }

    await tx
      .updateTable("app.pilot_assignments")
      .set({ withdrawn_at: now, withdrawn_by: userOf(actor) })
      .where("id", "=", task.id)
      .execute();
    await recordPilotAudit(tx, actor, "task_withdrawn", now, {
      campaignId: task.campaign_id,
      subjectId: task.id,
    });

    return { id: task.id };
  },
});

/**
 * A participant's own report on their task (pilot-ui.md «Mine
 * pilotoppgaver»): self-reported, never the official result, and a new
 * report each time.
 */
export const reportPilotTask = defineCommand({
  name: "pilot.report_task",
  input: pilotTaskReportSchema,
  output: pilotIdOutputSchema,
  policy: reportPilotTaskPolicy,
  idempotency: "required",
  rateLimit: rateLimits.pilot,
  load: async ({ tx, actor, input }) => {
    const task = await loadTask(tx, input.assignmentId);

    return task
      ? {
          resource: {
            viewer: await loadPilotViewer(tx, actor),
            participantId: task.participant_id,
            task,
          },
          context: undefined,
        }
      : null;
  },
  execute: async ({ tx, input, resource: { task }, now }) => {
    if (task.withdrawn_at || task.closed_at) {
      throw new DomainError("conflict", "The task is no longer open");
    }

    // The report is its own record. It is not in `pilot_audit`, which
    // would tie it to the account past the pseudonym's link.
    return tx
      .insertInto("app.pilot_feedback")
      .values({
        assignment_id: task.id,
        outcome: input.outcome,
        comment: input.comment ?? null,
        reported_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
  },
});

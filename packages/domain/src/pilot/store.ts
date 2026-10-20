import type { PilotCampaign, PilotCase } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { Actor } from "../actor";
import { DomainError } from "../errors";
import { pilotCaseRevision } from "./catalogue";
import type { PilotViewer } from "./policies";

type Db = Kysely<Database>;

/**
 * The signed-in user's place in the pilot, or none for anyone else. Read
 * from the journal on every request, so a role that ended stops at once.
 */
export async function loadPilotViewer(
  db: Db,
  actor: Actor,
): Promise<PilotViewer> {
  if (actor.kind !== "user") {
    return { leadId: null, participantId: null };
  }

  const [lead, participant] = await Promise.all([
    db
      .selectFrom("app.pilot_leads")
      .select("id")
      .where("user_id", "=", actor.userId)
      .where("revoked_at", "is", null)
      .executeTakeFirst(),
    db
      .selectFrom("app.pilot_participants")
      .select("id")
      .where("user_id", "=", actor.userId)
      .where("removed_at", "is", null)
      .executeTakeFirst(),
  ]);

  return {
    leadId: lead?.id ?? null,
    participantId: participant?.id ?? null,
  };
}

const campaignColumns = [
  "id",
  "name",
  "phase",
  "started_at",
  "closed_at",
] as const;

type CampaignRow = {
  id: string;
  name: string;
  phase: number;
  started_at: Date;
  closed_at: Date | null;
};

export const presentCampaign = (row: CampaignRow): PilotCampaign => ({
  id: row.id,
  name: row.name,
  phase: row.phase,
  startedAt: row.started_at.toISOString(),
  closedAt: row.closed_at?.toISOString() ?? null,
});

/** Every campaign, the current one first: open, or else the latest. */
export function loadCampaigns(db: Db) {
  return db
    .selectFrom("app.pilot_campaigns")
    .select(campaignColumns)
    .orderBy(({ eb }) => eb("closed_at", "is", null), "desc")
    .orderBy("started_at", "desc");
}

/** The open campaign, or else the latest closed one, or none yet. */
export function loadCurrentCampaign(db: Db) {
  return loadCampaigns(db).limit(1).executeTakeFirst();
}

/** The campaign `campaignId` names, or `not_found`; else the current one. */
export async function loadChosenCampaign(db: Db, campaignId?: string) {
  if (campaignId === undefined) return loadCurrentCampaign(db);

  const row = await loadCampaigns(db)
    .where("id", "=", campaignId)
    .executeTakeFirst();

  if (!row) throw new DomainError("not_found", "No such campaign");

  return row;
}

/** The test's current wording as a stored revision, kept the first time. */
export async function keepRevision(
  db: Db,
  test: PilotCase,
  now: Date,
): Promise<string> {
  const revision = pilotCaseRevision(test);

  await db
    .insertInto("app.pilot_case_revisions")
    .values({
      test_id: test.id,
      revision,
      priority: test.priority,
      action: test.action,
      expected: test.expected,
      prepare: [...test.prepare],
      steps: [...test.steps],
      pass_when: [...test.passWhen],
      first_used_at: now,
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  return revision;
}

/** Codes and ids only: never names, addresses or free text. */
export type PilotAuditDetails = Readonly<
  Record<string, string | number | boolean | null | readonly string[]>
>;

/** Records who changed what in the journal (pilot-ui.md «Revisjon»). */
export async function recordPilotAudit(
  db: Db,
  actor: Actor,
  action: string,
  at: Date,
  about: {
    campaignId?: string | null;
    subjectId?: string | null;
    details?: PilotAuditDetails;
  } = {},
): Promise<void> {
  await db
    .insertInto("app.pilot_audit")
    .values({
      at,
      actor_user_id: actor.kind === "user" ? actor.userId : null,
      actor_process: actor.kind === "system" ? actor.process : null,
      action,
      campaign_id: about.campaignId ?? null,
      subject_id: about.subjectId ?? null,
      details: JSON.stringify(about.details ?? {}),
    })
    .execute();
}

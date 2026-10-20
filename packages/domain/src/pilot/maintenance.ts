import type { Database } from "@lanbort/database";
import { type Kysely, type SelectQueryBuilder, sql } from "kysely";
import type { AccountDeletionStep } from "../account/deletion";
import { endPilotParticipation } from "./commands";

type Db = Kysely<Database>;

/** Strips the comments of the reports on the tasks `tasks` selects. */
async function stripComments(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks: SelectQueryBuilder<Database, any, { id: string }>,
): Promise<number> {
  const result = await db
    .updateTable("app.pilot_feedback")
    .set({ comment: null })
    .where("comment", "is not", null)
    .where("assignment_id", "in", tasks)
    .executeTakeFirst();

  return Number(result.numUpdatedRows);
}

/**
 * A deleted account leaves the pilot (PS-ADM-006): a lead role ends, a
 * participant's open tasks are withdrawn, their comments go and the
 * pseudonym is no longer linked to the account. What they did stays under
 * the pseudonym.
 */
export const pilotAccountDeletionStep: AccountDeletionStep = {
  name: "pilot",
  async run(db, userId, now) {
    await db
      .updateTable("app.pilot_leads")
      .set({ revoked_at: now })
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .execute();

    const participants = await db
      .selectFrom("app.pilot_participants")
      .select("id")
      .where("user_id", "=", userId)
      .execute();

    if (participants.length === 0) return;

    const ids = participants.map((participant) => participant.id);

    for (const id of ids) {
      await endPilotParticipation(db, id, null, now);
    }

    await stripComments(
      db,
      db
        .selectFrom("app.pilot_assignments")
        .select("id")
        .where("participant_id", "in", ids),
    );
    await db
      .updateTable("app.pilot_participants")
      .set({ user_id: null })
      .where("id", "in", ids)
      .execute();
  },
};

/**
 * What the pilot journal no longer keeps (docs/implementation/retention.md):
 * `afterMs` after its campaign closed, the comments participants wrote; and
 * once no campaign is open and the last closed that long ago, or a
 * participant left that long ago, the link from pseudonym to account. The
 * results stay under pseudonyms.
 */
export async function purgePilotLinks(db: Db, now: Date, afterMs: number) {
  const cutoff = new Date(now.getTime() - afterMs);
  const comments = await stripComments(
    db,
    db
      .selectFrom("app.pilot_assignments as task")
      .innerJoin(
        "app.pilot_campaigns as campaign",
        "campaign.id",
        "task.campaign_id",
      )
      .select("task.id")
      .where("campaign.closed_at", "<", cutoff),
  );
  const campaigns = await db
    .selectFrom("app.pilot_campaigns")
    .select(({ fn }) => [
      fn.countAll<string>().as("all"),
      fn.count<string>("closed_at").as("closed"),
      fn.max("closed_at").as("last_closed"),
    ])
    .executeTakeFirstOrThrow();
  const pilotOver =
    Number(campaigns.all) > 0 &&
    campaigns.all === campaigns.closed &&
    campaigns.last_closed !== null &&
    new Date(campaigns.last_closed) < cutoff;

  const unlinked = await db
    .updateTable("app.pilot_participants")
    .set({ removed_at: sql`coalesce(removed_at, ${now})`, user_id: null })
    .where("user_id", "is not", null)
    .where((eb) => (pilotOver ? eb.lit(true) : eb("removed_at", "<", cutoff)))
    .executeTakeFirst();

  return { links: Number(unlinked.numUpdatedRows), comments };
}

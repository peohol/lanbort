import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { daysAfter } from "../environment/model";

/**
 * No voting period is decided for hidden → closed (OD-0012), so no command
 * starts that vote yet. Tests of the vote, and of what follows from it,
 * start one directly with this test deadline.
 */
export const testVoteDays = 7;

export async function startTestVote(
  db: Kysely<Database>,
  vote: { environmentId: string; proposedByUserId: string; at: Date },
): Promise<string> {
  const { id } = await db
    .insertInto("app.environment_type_proposals")
    .values({
      environment_id: vote.environmentId,
      from_type: "hidden",
      to_type: "closed",
      proposed_by_user_id: vote.proposedByUserId,
      proposed_at: vote.at,
      deadline: daysAfter(vote.at, testVoteDays),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return id;
}

import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { daysAfter } from "../environment/model";

/**
 * No voting period is decided for hidden → closed (OD-0012), so no command
 * starts that vote yet. Tests of the vote, and of what follows from it,
 * start one directly with this test deadline.
 *
 * Tests in other areas use it to adopt a weaker type within minutes:
 * concluding is one job for every environment, so moving the clock days
 * ahead to conclude would also conclude other tests' proposals early.
 */
export const testVoteDays = 7;

export async function startTestVote(
  db: Kysely<Database>,
  vote: {
    environmentId: string;
    proposedByUserId: string;
    at: Date;
    /** Hidden → closed unless given. */
    change?: { from: "closed"; to: "open" };
    /** The deadline; `testVoteDays` after `at` unless given. */
    deadline?: Date;
  },
): Promise<string> {
  const { id } = await db
    .insertInto("app.environment_type_proposals")
    .values({
      environment_id: vote.environmentId,
      from_type: vote.change?.from ?? "hidden",
      to_type: vote.change?.to ?? "closed",
      proposed_by_user_id: vote.proposedByUserId,
      proposed_at: vote.at,
      deadline: vote.deadline ?? daysAfter(vote.at, testVoteDays),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return id;
}

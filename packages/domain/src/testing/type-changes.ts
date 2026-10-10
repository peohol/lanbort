import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { afterEach, beforeEach } from "vitest";
import { daysAfter } from "../environment/model";
import { typeChangeDays } from "../environment/privacy";

/**
 * Starts a proposal directly, without a command. Tests in other areas use it
 * to adopt a weaker type within minutes: concluding is one job for every
 * environment, so moving the clock days ahead to conclude would also
 * conclude other tests' proposals early.
 */
export const testVoteDays = typeChangeDays.vote;

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

/** Generous: a waiting test sits behind at most a few other files' tests. */
const typeChangeLockTimeout = 120_000;
const typeChangeLock = sql`hashtextextended('test:type_changes', 0)`;

/**
 * Runs each test in the current scope alone among the tests that use it.
 * Concluding is one job for every environment, so a test file that moves its
 * own clock days ahead and runs it decides other files' open proposals
 * mid-vote. Every test that leaves a proposal open or runs the job holds
 * this lock, a session lock on a connection of its own, from start to end.
 */
export function serializeTypeChanges(db: Kysely<Database>) {
  let release: (() => void) | undefined;
  let held: Promise<void> | undefined;

  beforeEach(async () => {
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    held = db.connection().execute(async (connection) => {
      await sql`select pg_advisory_lock(${typeChangeLock})`.execute(connection);
      acquired();
      try {
        await released;
      } finally {
        await sql`select pg_advisory_unlock(${typeChangeLock})`.execute(
          connection,
        );
      }
    });
    await Promise.race([locked, held]);
  }, typeChangeLockTimeout);

  afterEach(async () => {
    release?.();
    await held;
    release = undefined;
    held = undefined;
  });
}

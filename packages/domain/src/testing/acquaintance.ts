import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";

/**
 * Makes `a` and `b` friends unless they already have a relation, so either
 * may invite the other to an environment: an administrator invites only
 * someone they may see in Lånbort (PS-ENV-018). A fixture written directly,
 * so it neither notifies anyone nor counts against a rate limit.
 */
export async function acquaint(
  db: Kysely<Database>,
  a: { userId: string },
  b: { userId: string },
  at = new Date(),
): Promise<void> {
  await sql`
    insert into app.friendships (requester_id, addressee_id, status, requested_at, accepted_at)
    select ${a.userId}, ${b.userId}, 'active', ${at}, ${at}
    where not exists (
      select 1 from app.friendships
      where status <> 'ended'
        and user_low_id = least(${a.userId}::uuid, ${b.userId}::uuid)
        and user_high_id = greatest(${a.userId}::uuid, ${b.userId}::uuid)
    )
  `.execute(db);
}

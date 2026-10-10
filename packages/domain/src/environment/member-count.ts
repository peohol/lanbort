import type { ApproximateMembers } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";

/** PS-ENV-016: below this many, only that there are fewer is shown. */
export const fewMembers = 10;

/** PS-ENV-016: larger counts are rounded to the nearest multiple of this. */
export const memberCountRounding = 10;

/**
 * PS-ENV-016: what someone outside an environment may know of how many
 * active members it has. Never the exact number, so one person joining or
 * leaving rarely changes what is shown.
 */
export function approximateMembers(count: number): ApproximateMembers {
  return count < fewMembers
    ? { kind: "fewer_than", count: fewMembers }
    : {
        kind: "about",
        count: Math.round(count / memberCountRounding) * memberCountRounding,
      };
}

/**
 * PS-ENV-016: about how many active members each environment has, by
 * environment. Counts members who are active now (a passed transition
 * deadline makes a member passive, PS-ENV-006) and whose account is active,
 * like the member list. Only the rounded count leaves this function.
 */
export async function loadApproximateMembers(
  db: Kysely<Database>,
  environmentIds: readonly string[],
  now: Date,
): Promise<ReadonlyMap<string, ApproximateMembers>> {
  if (environmentIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom("app.environment_memberships as membership")
    .select(({ fn }) => [
      "membership.environment_id",
      fn.countAll<string>().as("count"),
    ])
    .where("membership.environment_id", "in", environmentIds)
    .where("membership.state", "=", "active")
    .where((eb) =>
      eb.or([
        eb("membership.transition_deadline", "is", null),
        eb("membership.transition_deadline", ">", now),
      ]),
    )
    .where(({ fn }) =>
      fn<boolean>("app.account_accepts_new_activity", ["membership.user_id"]),
    )
    .groupBy("membership.environment_id")
    .execute();
  const counts = new Map(
    rows.map((row) => [row.environment_id, Number(row.count)]),
  );

  return new Map(
    environmentIds.map((id) => [id, approximateMembers(counts.get(id) ?? 0)]),
  );
}

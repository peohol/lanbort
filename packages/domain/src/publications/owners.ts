import type { Database } from "@lanbort/database";
import type { ShownOwner } from "@lanbort/contracts";
import type { Kysely } from "kysely";
import { realNames } from "../account/store";
import { personPageIds, profileIdIn } from "../people/queries";

/** An object as it is found in one environment. */
export interface FoundThrough {
  readonly objectId: string;
  readonly environmentId: string;
}

/**
 * PS-ENV-015: the owners a member is shown of objects found through
 * environments, by object. Only co-owners who are themselves active members
 * of an environment the object is found through are named there, never one
 * outside it (PS-OBJ-006), and only while their account is active, like the
 * member list. Passive members are not active, and an owner and a viewer who
 * have blocked each other never meet here, since the object is not found
 * then (`findableBy`). The viewer is not named among the owners
 * (`ownedByYou` says it). Read in the same snapshot as what was found.
 */
export async function environmentOwners(
  db: Kysely<Database>,
  viewerId: string,
  found: readonly FoundThrough[],
  now: Date,
): Promise<ReadonlyMap<string, readonly ShownOwner[]>> {
  if (found.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom("app.object_owners as owner")
    .innerJoin(
      "app.environment_memberships as membership",
      "membership.user_id",
      "owner.user_id",
    )
    .select(["owner.object_id", "owner.user_id"])
    .distinct()
    .where((eb) =>
      eb.or(
        found.map(({ objectId, environmentId }) =>
          eb.and([
            eb("owner.object_id", "=", objectId),
            eb("membership.environment_id", "=", environmentId),
          ]),
        ),
      ),
    )
    .where("owner.user_id", "!=", viewerId)
    .where("membership.state", "=", "active")
    .where((eb) =>
      eb.or([
        eb("membership.transition_deadline", "is", null),
        eb("membership.transition_deadline", ">", now),
      ]),
    )
    .where(({ fn }) =>
      fn<boolean>("app.account_accepts_new_activity", ["owner.user_id"]),
    )
    .execute();

  const userIds = rows.map((row) => row.user_id);
  const names = await realNames(db, userIds);
  const pages = await personPageIds(db, viewerId, userIds, now);
  const named = rows.flatMap((row) => {
    const realName = names.get(row.user_id);
    return realName === undefined ? [] : [{ ...row, realName }];
  });
  const owners = new Map<string, ShownOwner[]>();

  // By name, and the same order every time for people with the same name.
  named.sort(
    (a, b) =>
      a.realName.localeCompare(b.realName, "nb") ||
      a.user_id.localeCompare(b.user_id),
  );

  for (const row of named) {
    owners.set(row.object_id, [
      ...(owners.get(row.object_id) ?? []),
      { realName: row.realName, profileId: profileIdIn(pages, row.user_id) },
    ]);
  }

  return owners;
}

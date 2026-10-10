import type { Database } from "@lanbort/database";
import type { ShownOwner } from "@lanbort/contracts";
import { type Kysely, sql } from "kysely";
import { realNames } from "../account/store";
import { linkIn, personLinks } from "../people/queries";

/** An object as it is found in one environment. */
export interface FoundThrough {
  readonly objectId: string;
  readonly environmentId: string;
}

/** What the owners are wanted for: objects as they were found. */
export interface FoundObjects {
  /** Found through environments (PS-ENV-015). */
  readonly environments?: readonly FoundThrough[];
  /** Found through friends (PS-OBJ-022), by object. */
  readonly friends?: readonly string[];
}

type OwnerRow = { readonly object_id: string; readonly user_id: string };

/**
 * The owners a viewer is shown of objects as they found them, by object.
 * Through an environment (PS-ENV-015), only co-owners who are themselves
 * active members of it, never one outside it (PS-OBJ-006). Through friends
 * (PS-OBJ-022), only owners the viewer is a friend of now, so an ended
 * friendship or a block (which ends it) hides the name at once. Either way
 * only while the owner's account is active, like the member list, and an
 * owner and a viewer who have blocked each other never meet here, since the
 * object is not found then (`findableBy`). The viewer is not named among
 * the owners (`ownedByYou` says it). Read in the same snapshot as what was
 * found.
 */
export async function shownOwners(
  db: Kysely<Database>,
  viewerId: string,
  { environments = [], friends = [] }: FoundObjects,
  now: Date,
): Promise<ReadonlyMap<string, readonly ShownOwner[]>> {
  const rows = [
    ...(await environmentOwnerRows(db, viewerId, environments, now)),
    ...(await friendOwnerRows(db, viewerId, friends)),
  ];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const names = await realNames(db, userIds);
  const links = await personLinks(db, viewerId, userIds, now);
  const named = [
    ...new Map(
      rows.map((row) => [`${row.object_id} ${row.user_id}`, row]),
    ).values(),
  ].flatMap((row) => {
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
      { realName: row.realName, ...linkIn(links, row.user_id) },
    ]);
  }

  return owners;
}

/** PS-ENV-015: owners who are active members where the object is found. */
async function environmentOwnerRows(
  db: Kysely<Database>,
  viewerId: string,
  found: readonly FoundThrough[],
  now: Date,
): Promise<OwnerRow[]> {
  if (found.length === 0) {
    return [];
  }

  return db
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
}

/**
 * PS-OBJ-022: the owners the viewer is a friend of, as
 * `app.has_friend_among_owners` decides who finds the object.
 */
async function friendOwnerRows(
  db: Kysely<Database>,
  viewerId: string,
  objectIds: readonly string[],
): Promise<OwnerRow[]> {
  if (objectIds.length === 0) {
    return [];
  }

  return db
    .selectFrom("app.object_owners as owner")
    .select(["owner.object_id", "owner.user_id"])
    .where("owner.object_id", "in", objectIds)
    .where("owner.user_id", "!=", viewerId)
    .where(
      sql<boolean>`app.users_are_friends(owner.user_id, ${viewerId}::uuid)`,
    )
    .where(({ fn }) =>
      fn<boolean>("app.account_accepts_new_activity", ["owner.user_id"]),
    )
    .execute();
}

import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { AccountStatus } from "../actor";

type Db = Kysely<Database>;

/**
 * Lock order: account rows come before objects, environments and requests.
 * A lifecycle change locks its account for update first and then reaches
 * the rest; everything that starts something new for an account locks the
 * accounts it builds on for share first, so a change of state either comes
 * before it (and it sees the new state) or waits for it to commit.
 */

/** The accounts' states, without locking. Unknown ids are left out. */
export async function accountStatuses(
  db: Db,
  userIds: readonly string[],
  options: { lock?: boolean } = {},
): Promise<Map<string, AccountStatus>> {
  const ids = [...new Set(userIds)].sort();

  if (ids.length === 0) {
    return new Map();
  }

  let query = db
    .selectFrom("app.users")
    .select(["id", "status"])
    .where("id", "in", ids)
    .orderBy("id");

  if (options.lock) {
    query = query.forShare();
  }

  const rows = await query.execute();

  return new Map(rows.map((row) => [row.id, row.status as AccountStatus]));
}

/**
 * Locks the accounts for share, in id order so concurrent callers cannot
 * deadlock, and returns their states. They cannot change state before the
 * caller commits.
 */
export function lockAccounts(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, AccountStatus>> {
  return accountStatuses(db, userIds, { lock: true });
}

/**
 * Of the accounts, those that are deleted. Shared history they took part in
 * stays, but is shown without who they were (PS-ADM-006).
 */
export async function deletedAccounts(
  db: Db,
  userIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const statuses = await accountStatuses(db, userIds);

  return new Set(
    [...statuses]
      .filter(([, status]) => status === "deleted")
      .map(([id]) => id),
  );
}

/**
 * The real names of the accounts that still have a profile. A deleted
 * account has none (PS-ADM-006), so it is left out and shown as a former
 * user (UX-PRIV-010). Whether the caller may see a name is the query's
 * decision, not this one's.
 */
export async function realNames(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom("app.profiles")
    .select(["user_id", "real_name"])
    .where("user_id", "in", [...new Set(userIds)])
    .execute();

  return new Map(rows.map((row) => [row.user_id, row.real_name]));
}

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

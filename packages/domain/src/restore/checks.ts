import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";

type Db = Kysely<Database>;

export interface RestoreCheckResult {
  readonly name: string;
  readonly passed: boolean;
  /** How many rows break it, by where they are. Counts only, never content. */
  readonly findings: Readonly<Record<string, number>>;
}

/**
 * Something that must hold before a restored database is opened
 * (docs/architecture/09 «Restore»). What the database refuses by itself
 * (a block next to an open friendship, a publication without an owner with
 * access) needs no check here.
 */
export interface RestoreCheck {
  readonly name: string;
  run(db: Db): Promise<Record<string, number>>;
}

/**
 * Where a deleted account must have nothing left (PS-ADM-006): the deletion
 * steps' tables, each with the condition a remaining row would meet.
 */
const deletedAccountRemnants = [
  ["profiles", sql`app.profiles where user_id = account.id`],
  ["verified_contacts", sql`app.verified_contacts where user_id = account.id`],
  ["notifications", sql`app.notifications where recipient_id = account.id`],
  [
    "notification_preferences",
    sql`app.notification_preferences where user_id = account.id`,
  ],
  [
    "object_subscriptions",
    sql`app.object_subscriptions where user_id = account.id`,
  ],
  ["object_owners", sql`app.object_owners where user_id = account.id`],
  [
    "memberships",
    sql`app.environment_memberships where user_id = account.id and state <> 'ended'`,
  ],
  [
    "friendships",
    sql`app.friendships where (requester_id = account.id or addressee_id = account.id) and status <> 'ended'`,
  ],
  ["chat_account_keys", sql`app.chat_account_keys where user_id = account.id`],
  ["chat_devices", sql`app.chat_devices where user_id = account.id`],
  [
    "platform_roles",
    sql`app.platform_role_grants where user_id = account.id and revoked_at is null`,
  ],
] as const;

/** PS-ADM-006, PS-NFR-014: no deleted account came back with its data. */
const deletedAccountsStayDeleted: RestoreCheck = {
  name: "deleted_accounts_stay_deleted",
  run: async (db) => {
    const findings: Record<string, number> = {};

    for (const [table, rows] of deletedAccountRemnants) {
      const { rows: counted } = await sql<{ count: string }>`
        select count(*) as count
          from app.users account
         where account.status = 'deleted'
           and exists (select 1 from ${rows})
      `.execute(db);
      findings[table] = Number(counted[0]?.count ?? 0);
    }

    return findings;
  },
};

/**
 * ADR-0005: the derived index matches the authoritative tables. Rebuilding
 * it changes nothing once it does.
 */
const searchIndexMatchesSources: RestoreCheck = {
  name: "search_index_matches_sources",
  run: async (db) => {
    const { rows } = await sql<{ changed: number }>`
      select app.reconcile_search_index() as changed
    `.execute(db);

    return { search_index_rows_rebuilt: rows[0]?.changed ?? 0 };
  },
};

export const restoreChecks: readonly RestoreCheck[] = [
  deletedAccountsStayDeleted,
  searchIndexMatchesSources,
];

/** Runs every check; each passes when it finds nothing. */
export async function runRestoreChecks(
  db: Db,
  checks: readonly RestoreCheck[] = restoreChecks,
): Promise<RestoreCheckResult[]> {
  const results: RestoreCheckResult[] = [];

  for (const check of checks) {
    const findings = await check.run(db);
    results.push({
      name: check.name,
      passed: Object.values(findings).every((count) => count === 0),
      findings,
    });
  }

  return results;
}

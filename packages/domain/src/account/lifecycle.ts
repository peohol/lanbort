import {
  accountInterventionSchema,
  type AccountLifecycleResult,
  accountLifecycleResultSchema,
  type AccountStatusReason,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { z } from "zod";
import type { AccountStatus, Actor } from "../actor";
import type { Policy } from "../authorization/policy";
import { defineCommand } from "../commands/command";
import { releaseEnvironmentRoles } from "../environment/continuity-commands";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { stopReservedLoansOf } from "../loans/account-lifecycle";
import {
  accountClosureStarted,
  accountDeactivated,
  accountDeleted,
  accountMadeDormant,
  accountReactivated,
  accountSuspended,
} from "./events";
import { takesNewActivity, transitionAllowed } from "./model";
import {
  type AccountResource,
  deactivateAccountPolicy,
  makeAccountDormantPolicy,
  reactivateAccountPolicy,
  reinstateAccountPolicy,
  startAccountClosurePolicy,
  suspendAccountPolicy,
} from "./policies";

type Db = Kysely<Database>;

/**
 * The account, locked for its change of state (account rows come first,
 * `account/store.ts`). Not for share: a lifecycle change waits for whatever
 * builds on the account's current state, and the other way round.
 */
export async function loadAccountForChange(
  db: Db,
  userId: string,
): Promise<{ resource: AccountResource; context: undefined } | null> {
  const row = await db
    .selectFrom("app.users")
    .select(["id", "status"])
    .where("id", "=", userId)
    .forNoKeyUpdate()
    .executeTakeFirst();

  return row
    ? {
        resource: { userId: row.id, status: row.status as AccountStatus },
        context: undefined,
      }
    : null;
}

/** The signed-in user's own account, locked for its change of state. */
export async function loadOwnAccountForChange({
  tx,
  actor,
}: {
  tx: Db;
  actor: Actor;
}) {
  return actor.kind === "user" ? loadAccountForChange(tx, actor.userId) : null;
}

const lifecycleEvents = {
  active: accountReactivated,
  dormant: accountMadeDormant,
  deactivated: accountDeactivated,
  suspended: accountSuspended,
  closing: accountClosureStarted,
  deleted: accountDeleted,
} as const;

export interface AccountStatusChange {
  readonly account: AccountResource;
  readonly to: Exclude<AccountStatus, "pending_registration">;
  readonly reason: AccountStatusReason;
  /** Who changes it: the user, a steward or a process. */
  readonly actor: Actor;
  /** A platform intervention's basis (PS-ADM-014); nothing else has one. */
  readonly basis?: string;
}

/**
 * PS-ADM-001, PS-ADM-014: records the change with its reason and actor
 * (and a steward's basis, which stays on the record only), then moves the
 * locked account. Leaving the active state stops new activity:
 * - the database ends what was waiting for the account to start something
 *   (its requests, requests nobody can lend any more, lender transfers to
 *   it);
 * - its environment roles are released into the continuity model
 *   (PS-ENV-014), so nobody waits for it there;
 * - a suspension also stops its reserved loans before handover
 *   (PS-ADM-003).
 * Loans already under way keep their course with minimum access.
 */
export async function changeAccountStatus(
  db: Db,
  change: AccountStatusChange,
  events: EventRecorder,
  now: Date,
): Promise<AccountLifecycleResult> {
  const { account, to, reason, actor } = change;

  if (!transitionAllowed({ from: account.status, to, reason })) {
    throw new DomainError(
      "conflict",
      `An account ${account.status} cannot become ${to}`,
    );
  }

  await db
    .insertInto("app.account_status_changes")
    .values({
      user_id: account.userId,
      from_status: account.status,
      to_status: to,
      reason,
      changed_at: now,
      changed_by_user_id: actor.kind === "user" ? actor.userId : null,
      changed_by_process: actor.kind === "system" ? actor.process : null,
      basis: change.basis ?? null,
    })
    .execute();

  await db
    .updateTable("app.users")
    .set({
      status: to,
      status_reason: to === "active" ? null : reason,
      status_changed_at: now,
    })
    .where("id", "=", account.userId)
    .execute();

  events.record(lifecycleEvents[to], {
    resourceId: account.userId,
    payload: { from: account.status },
  });

  if (!takesNewActivity(to)) {
    await releaseEnvironmentRoles(db, account.userId, now, events);
  }

  if (to === "suspended") {
    await stopReservedLoansOf(db, account.userId, now, events);
  }

  return { userId: account.userId, status: to };
}

/** The user's own change of state, retry-safe. */
function ownChange(
  name: string,
  policy: Policy<AccountResource, void>,
  to: AccountStatusChange["to"],
) {
  return defineCommand({
    name,
    input: z.strictObject({}),
    output: accountLifecycleResultSchema,
    policy,
    idempotency: "required",
    load: loadOwnAccountForChange,
    execute: ({ tx, actor, resource, events, now }) =>
      changeAccountStatus(
        tx,
        { account: resource, to, reason: "user_request", actor },
        events,
        now,
      ),
  });
}

/**
 * PS-ADM-002: the user stops new activity. Existing loans and the winding
 * down of ownership go on with minimum access; the account can be taken
 * into use again.
 */
export const deactivateAccount = ownChange(
  "account.deactivate",
  deactivateAccountPolicy,
  "deactivated",
);

/**
 * A deactivated or dormant account becomes active again. What ended when it
 * stopped stays ended: requests, roles and transfers are not restored.
 */
export const reactivateAccount = ownChange(
  "account.reactivate",
  reactivateAccountPolicy,
  "active",
);

/**
 * Long inactivity puts an active account to rest. Only the inactivity
 * process may; when and after which notice is not decided yet, so nothing
 * schedules it (docs/product-spec/07, pilot rule).
 */
export const makeAccountDormant = defineCommand({
  name: "account.make_dormant",
  input: z.strictObject({ userId: z.uuid() }),
  output: accountLifecycleResultSchema,
  policy: makeAccountDormantPolicy,
  idempotency: "none",
  load: ({ tx, input }) => loadAccountForChange(tx, input.userId),
  execute: ({ tx, actor, resource, events, now }) =>
    changeAccountStatus(
      tx,
      { account: resource, to: "dormant", reason: "inactivity", actor },
      events,
      now,
    ),
});

/** A platform steward's intervention, with its basis (PS-ADM-014). */
function intervention(
  name: string,
  policy: Policy<AccountResource, void>,
  to: AccountStatusChange["to"],
) {
  return defineCommand({
    name,
    input: accountInterventionSchema,
    output: accountLifecycleResultSchema,
    policy,
    idempotency: "required",
    load: ({ tx, input }) => loadAccountForChange(tx, input.userId),
    execute: ({ tx, actor, input, resource, events, now }) =>
      changeAccountStatus(
        tx,
        {
          account: resource,
          to,
          reason: "platform",
          actor,
          basis: input.basis,
        },
        events,
        now,
      ),
  });
}

/** PS-ADM-003: stops the account's new physical courses. */
export const suspendAccount = intervention(
  "account.suspend",
  suspendAccountPolicy,
  "suspended",
);

/** Ends a suspension, or a closure that was not completed. */
export const reinstateAccount = intervention(
  "account.reinstate",
  reinstateAccountPolicy,
  "active",
);

/**
 * Starts a controlled closure: new activity stops, and the bindings are
 * finished by the ordinary rules before the closure can be completed.
 */
export const startAccountClosure = intervention(
  "account.start_closure",
  startAccountClosurePolicy,
  "closing",
);

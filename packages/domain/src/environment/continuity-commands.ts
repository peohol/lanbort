import type { EnvironmentRole } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql, type Transaction } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import {
  administrators,
  type ChangedBy,
  closeVacancy,
  findContinuity,
  grantRole,
  lapseInvitationsOf,
  revokeRoles,
  type RoleRevokeReason,
  settleWindDown,
  startWindDown,
  vacateOwnership,
  withdrawClaims,
} from "./continuity-store";
import {
  environmentIdInput,
  loadLockedAccess,
  userIdOf,
} from "./environment-commands";
import {
  environmentOwnershipClaimed,
  environmentWindDownCancelled,
} from "./events";
import { chooseNewOwner, isClaimOpen, isWindDownCancellable } from "./model";
import {
  cancelWindDownPolicy,
  claimOwnershipPolicy,
  continuityProcess,
  releaseDepartedUserPolicy,
  settleContinuityPolicy,
  startWindDownPolicy,
  withdrawOwnershipClaimPolicy,
} from "./policies";

/**
 * Continuity (WP-22, PS-ENV-012–014): ownerless periods, winding down, and
 * what happens when an administrator's account goes away. Like the role
 * commands, everything here holds the environment row's lock.
 */
type Tx = Transaction<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

const environmentOnly = z.strictObject(environmentIdInput);

/**
 * PS-ENV-013: an administrator registers interest in the vacant ownership.
 * Registering early gives no advantage; tenure decides at the deadline.
 */
export const claimOwnership = defineCommand({
  name: "environment.claim_ownership",
  input: environmentOnly,
  output: z.strictObject({ claimDeadline: z.iso.datetime() }),
  policy: claimOwnershipPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, resource, events, now }) => {
    const environmentId = resource.environment.id;
    const userId = userIdOf(actor);
    const { vacancy } = await findContinuity(tx, environmentId);

    if (!vacancy || !isClaimOpen(vacancy, now)) {
      conflict("There is no ownership to claim");
    }

    const claimed = await tx
      .insertInto("app.environment_ownership_claims")
      .values({ vacancy_id: vacancy.id, user_id: userId, claimed_at: now })
      .onConflict((onConflict) =>
        onConflict
          .columns(["vacancy_id", "user_id"])
          .where("withdrawn_at", "is", null)
          .doNothing(),
      )
      .returning("id")
      .executeTakeFirst();

    if (claimed) {
      events.record(environmentOwnershipClaimed, {
        resourceId: environmentId,
        payload: { userId },
      });
    }

    return { claimDeadline: vacancy.claimDeadline.toISOString() };
  },
});

export const withdrawOwnershipClaim = defineCommand({
  name: "environment.withdraw_ownership_claim",
  input: environmentOnly,
  output: z.strictObject({ withdrawn: z.literal(true) }),
  policy: withdrawOwnershipClaimPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, resource, events, now }) => {
    if (
      !(await withdrawClaims(
        tx,
        resource.environment.id,
        userIdOf(actor),
        now,
        events,
      ))
    ) {
      conflict("No ownership claim to withdraw");
    }

    return { withdrawn: true as const };
  },
});

/**
 * PS-ENV-012: the owner winds the environment down. From now on it takes no
 * new members and starts nothing new; existing loans and history continue.
 * The owner may cancel within 7 days, so nothing is ended before then.
 */
export const startEnvironmentWindDown = defineCommand({
  name: "environment.start_wind_down",
  input: environmentOnly,
  output: z.strictObject({ finalAt: z.iso.datetime() }),
  policy: startWindDownPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, resource, events, now }) => {
    const environmentId = resource.environment.id;

    if (resource.environment.state !== "active") {
      conflict("The environment is already winding down");
    }

    await startWindDown(
      tx,
      environmentId,
      "voluntary",
      userIdOf(actor),
      now,
      events,
    );
    const { windDown } = await findContinuity(tx, environmentId);

    return { finalAt: (windDown?.finalAt ?? now).toISOString() };
  },
});

/** Within the cancellation period the owner may continue the environment. */
export const cancelEnvironmentWindDown = defineCommand({
  name: "environment.cancel_wind_down",
  input: environmentOnly,
  output: z.strictObject({ state: z.literal("active") }),
  policy: cancelWindDownPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, resource, events, now }) => {
    const environmentId = resource.environment.id;
    const { windDown } = await findContinuity(tx, environmentId);

    if (!windDown || !isWindDownCancellable(windDown, now)) {
      conflict("The winding down can no longer be cancelled");
    }

    await tx
      .updateTable("app.environment_wind_downs")
      .set({
        settled_at: now,
        outcome: "cancelled",
        settled_by_user_id: userIdOf(actor),
      })
      .where("id", "=", windDown.id)
      .execute();
    await tx
      .updateTable("app.environments")
      .set({ state: "active", updated_at: now })
      .where("id", "=", environmentId)
      .execute();
    events.record(environmentWindDownCancelled, {
      resourceId: environmentId,
      payload: {},
    });

    return { state: "active" as const };
  },
});

/**
 * Locks the environment if no one else holds it. A scheduled run skips busy
 * environments; the next run picks them up.
 */
export async function tryLockEnvironment(tx: Tx, environmentId: string) {
  return tx
    .selectFrom("app.environments")
    .select(["id", "state"])
    .where("id", "=", environmentId)
    .forUpdate()
    .skipLocked()
    .executeTakeFirst();
}

/**
 * PS-ENV-013 at the deadline: of the administrators who registered interest
 * and can still act, the one with the longest continuous tenure becomes
 * owner. If there is none, the environment winds down.
 */
async function resolveVacancy(
  tx: Tx,
  environmentId: string,
  vacancyId: string,
  now: Date,
  events: EventRecorder,
): Promise<"claimed" | "wound_down"> {
  const claims = await tx
    .selectFrom("app.environment_ownership_claims")
    .select("user_id")
    .where("vacancy_id", "=", vacancyId)
    .where("withdrawn_at", "is", null)
    .execute();
  const claimants = new Set(claims.map((claim) => claim.user_id));
  const winner = chooseNewOwner(
    (await administrators(tx, environmentId, now)).filter(
      (administrator) =>
        administrator.canAct && claimants.has(administrator.userId),
    ),
  );

  await closeVacancy(
    tx,
    environmentId,
    vacancyId,
    winner?.userId ?? null,
    now,
    events,
  );

  if (!winner) {
    await startWindDown(tx, environmentId, "ownerless", null, now, events);
    return "wound_down";
  }

  await grantRole(
    tx,
    environmentId,
    winner.userId,
    "owner",
    { process: continuityProcess },
    now,
    events,
  );

  return "claimed";
}

/** How many vacancies and wind-downs one run handles at most. */
const continuityBatchSize = 100;

/**
 * The scheduled continuity job: resolves ownership vacancies whose deadline
 * has passed and settles wind-downs that have become final. Safe to run
 * repeatedly and concurrently: environments another run or a command holds
 * are skipped, and everything is re-checked under the lock.
 */
export const settleContinuity = defineCommand({
  name: "environment.settle_continuity",
  input: z.strictObject({}),
  output: z.strictObject({
    ownersChosen: z.int().nonnegative(),
    woundDown: z.int().nonnegative(),
    finalized: z.int().nonnegative(),
  }),
  policy: settleContinuityPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, events, now }) => {
    const result = { ownersChosen: 0, woundDown: 0, finalized: 0 };
    const dueVacancies = await tx
      .selectFrom("app.environment_ownership_vacancies")
      .select("environment_id")
      .where("closed_at", "is", null)
      .where("claim_deadline", "<=", now)
      .orderBy("claim_deadline")
      .limit(continuityBatchSize)
      .execute();

    for (const { environment_id: environmentId } of dueVacancies) {
      if (!(await tryLockEnvironment(tx, environmentId))) continue;

      const { vacancy } = await findContinuity(tx, environmentId);
      if (!vacancy || isClaimOpen(vacancy, now)) continue;

      const outcome = await resolveVacancy(
        tx,
        environmentId,
        vacancy.id,
        now,
        events,
      );
      result[outcome === "claimed" ? "ownersChosen" : "woundDown"] += 1;
    }

    const dueWindDowns = await tx
      .selectFrom("app.environment_wind_downs")
      .select("environment_id")
      .where("settled_at", "is", null)
      .where("final_at", "<=", now)
      .orderBy("final_at")
      .limit(continuityBatchSize)
      .execute();

    for (const { environment_id: environmentId } of dueWindDowns) {
      if (!(await tryLockEnvironment(tx, environmentId))) continue;

      const { windDown } = await findContinuity(tx, environmentId);
      if (!windDown || windDown.settled || windDown.finalAt > now) continue;

      await settleWindDown(tx, environmentId, windDown.id, now, events);
      result.finalized += 1;
    }

    return result;
  },
});

/**
 * Ends every role a user holds in one locked environment, and what depended
 * on it, when the user is gone from it without handing over (PS-ENV-013).
 * Where the user was owner, the continuity model starts: a claim period for
 * the remaining administrators, or winding down if there are none. Where the
 * user was the last administrator of an ownerless environment, nobody can
 * take over any more and it winds down at once. Nobody else gains authority,
 * and nothing escalates to platform stewards (PS-ENV-014). Returns the roles
 * that ended.
 */
export async function releaseRolesIn(
  tx: Kysely<Database>,
  environment: { id: string; state: string },
  userId: string,
  reason: RoleRevokeReason,
  by: ChangedBy,
  now: Date,
  events: EventRecorder,
): Promise<EnvironmentRole[]> {
  const ended = await revokeRoles(
    tx,
    environment.id,
    userId,
    ["owner", "administrator"],
    reason,
    by,
    now,
    events,
  );
  await lapseInvitationsOf(tx, environment.id, userId, now, events);
  await withdrawClaims(tx, environment.id, userId, now, events);

  if (ended.includes("owner")) {
    await vacateOwnership(tx, environment, userId, now, events);
    return ended;
  }

  const { vacancy } = await findContinuity(tx, environment.id);
  if (vacancy && (await administrators(tx, environment.id, now)).length === 0) {
    await closeVacancy(tx, environment.id, vacancy.id, null, now, events);
    await startWindDown(tx, environment.id, "ownerless", null, now, events);
  }

  return ended;
}

/**
 * Ends every environment role of a user whose account has gone away, for
 * account lifecycle to call inside its own transaction (`releaseRolesIn`).
 *
 * Environments are locked in id order, so concurrent calls cannot deadlock.
 */
export async function releaseEnvironmentRoles(
  tx: Kysely<Database>,
  userId: string,
  now: Date,
  events: EventRecorder,
): Promise<number> {
  const { rows } = await sql<{ environment_id: string }>`
    select environment_id from app.environment_role_grants
      where user_id = ${userId} and revoked_at is null
    union
    select environment_id from app.environment_role_invitations
      where (user_id = ${userId} or (invited_by_user_id = ${userId} and role = 'owner'))
        and closed_at is null
    union
    select vacancy.environment_id from app.environment_ownership_claims claim
      join app.environment_ownership_vacancies vacancy on vacancy.id = claim.vacancy_id
      where claim.user_id = ${userId} and claim.withdrawn_at is null
        and vacancy.closed_at is null
    order by environment_id
  `.execute(tx);

  for (const { environment_id: environmentId } of rows) {
    const environment = await tx
      .selectFrom("app.environments")
      .select(["id", "state"])
      .where("id", "=", environmentId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    await releaseRolesIn(
      tx,
      environment,
      userId,
      "account_departed",
      { process: continuityProcess },
      now,
      events,
    );
  }

  return rows.length;
}

/**
 * The boundary account lifecycle (PS-ADM-001–006) uses when an account is
 * deactivated or closed before its environment roles were handed over.
 * Repeating it for the same user changes nothing.
 */
export const releaseDepartedUser = defineCommand({
  name: "environment.release_departed_user",
  input: z.strictObject({ userId: z.uuid() }),
  output: z.strictObject({ environments: z.int().nonnegative() }),
  policy: releaseDepartedUserPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, input, events, now }) => ({
    environments: await releaseEnvironmentRoles(tx, input.userId, now, events),
  }),
});

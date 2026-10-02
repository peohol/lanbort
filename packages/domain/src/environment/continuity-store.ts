import type { EnvironmentRole, WindDownReason } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { z } from "zod";
import type { EventRecorder } from "../events/recorder";
import {
  environmentOwnershipClaimWithdrawn,
  environmentOwnershipVacancyClosed,
  environmentOwnershipVacated,
  environmentRoleGranted,
  environmentRoleInvitationClosed,
  environmentRoleRevoked,
  environmentWindDownFinalized,
  environmentWindDownStarted,
  membershipEnded,
  membershipReviewClosed,
  type roleInvitationOutcomeSchema,
  type roleRevokeReasonSchema,
} from "./events";
import {
  type ContinuityRecord,
  daysAfter,
  type OwnershipCandidate,
  ownershipClaimDays,
  windDownCancellationDays,
} from "./model";
import { endEnvironmentPublications } from "../publications/store";

/**
 * Database access for roles and continuity (WP-22). Callers hold the lock on
 * the environment row, which serializes every role and continuity change of
 * one environment; the database checks the resulting invariants at commit.
 */
type Db = Kysely<Database>;

/** Who made a change: a user, or a named process acting on a consequence. */
export type ChangedBy = { userId: string } | { process: string };

export type RoleRevokeReason = z.infer<typeof roleRevokeReasonSchema>;
type RoleInvitationOutcome = z.infer<typeof roleInvitationOutcomeSchema>;

const byColumns = (prefix: "granted" | "revoked", by: ChangedBy) =>
  "userId" in by
    ? { [`${prefix}_by_user_id`]: by.userId }
    : { [`${prefix}_by_process`]: by.process };

export async function findContinuity(
  db: Db,
  environmentId: string,
): Promise<ContinuityRecord> {
  const vacancy = await db
    .selectFrom("app.environment_ownership_vacancies")
    .select(["id", "claim_deadline"])
    .where("environment_id", "=", environmentId)
    .where("closed_at", "is", null)
    .executeTakeFirst();
  const windDown = await db
    .selectFrom("app.environment_wind_downs")
    .select(["id", "reason", "final_at", "settled_at"])
    .where("environment_id", "=", environmentId)
    .where((eb) =>
      eb.or([eb("outcome", "is", null), eb("outcome", "<>", "cancelled")]),
    )
    .executeTakeFirst();

  return {
    vacancy: vacancy
      ? { id: vacancy.id, claimDeadline: vacancy.claim_deadline }
      : null,
    windDown: windDown
      ? {
          id: windDown.id,
          reason: windDown.reason as WindDownReason,
          finalAt: windDown.final_at,
          settled: windDown.settled_at !== null,
        }
      : null,
  };
}

export async function grantRole(
  db: Db,
  environmentId: string,
  userId: string,
  role: EnvironmentRole,
  by: ChangedBy,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  await db
    .insertInto("app.environment_role_grants")
    .values({
      environment_id: environmentId,
      user_id: userId,
      role,
      granted_at: now,
      ...byColumns("granted", by),
    })
    .execute();
  events.record(environmentRoleGranted, {
    resourceId: environmentId,
    payload: { userId, role },
  });
}

/** Ends the user's active grants of the given roles; returns those ended. */
export async function revokeRoles(
  db: Db,
  environmentId: string,
  userId: string,
  roles: readonly EnvironmentRole[],
  reason: RoleRevokeReason,
  by: ChangedBy,
  now: Date,
  events: EventRecorder,
): Promise<EnvironmentRole[]> {
  if (roles.length === 0) {
    return [];
  }

  const revoked = await db
    .updateTable("app.environment_role_grants")
    .set({
      revoked_at: now,
      revoke_reason: reason,
      ...byColumns("revoked", by),
    })
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", userId)
    .where("role", "in", [...roles])
    .where("revoked_at", "is", null)
    .returning("role")
    .execute();

  // Owner first, so the event order reads as a handover.
  const ended = revoked
    .map((row) => row.role as EnvironmentRole)
    .sort((a, b) => (a === b ? 0 : a === "owner" ? -1 : 1));

  for (const role of ended) {
    events.record(environmentRoleRevoked, {
      resourceId: environmentId,
      payload: { userId, role, reason },
    });
  }

  return ended;
}

export interface RoleInvitationRecord {
  readonly id: string;
  readonly environmentId: string;
  readonly userId: string;
  readonly role: EnvironmentRole;
  readonly invitedByUserId: string;
  readonly createdAt: Date;
}

const invitationColumns = [
  "id",
  "environment_id",
  "user_id",
  "role",
  "invited_by_user_id",
  "created_at",
] as const;

function toInvitation(row: {
  id: string;
  environment_id: string;
  user_id: string;
  role: string;
  invited_by_user_id: string;
  created_at: Date;
}): RoleInvitationRecord {
  return {
    id: row.id,
    environmentId: row.environment_id,
    userId: row.user_id,
    role: row.role as EnvironmentRole,
    invitedByUserId: row.invited_by_user_id,
    createdAt: row.created_at,
  };
}

/** A pending role invitation of the environment, locked for a decision. */
export async function findPendingRoleInvitation(
  db: Db,
  environmentId: string,
  invitationId: string,
): Promise<RoleInvitationRecord | null> {
  const row = await db
    .selectFrom("app.environment_role_invitations")
    .select(invitationColumns)
    .where("id", "=", invitationId)
    .where("environment_id", "=", environmentId)
    .where("closed_at", "is", null)
    .forUpdate()
    .executeTakeFirst();

  return row ? toInvitation(row) : null;
}

/** Pending role invitations of the environment matching every filter. */
export async function pendingRoleInvitations(
  db: Db,
  environmentId: string,
  filter: {
    userId?: string;
    role?: EnvironmentRole;
    invitedByUserId?: string;
  } = {},
): Promise<RoleInvitationRecord[]> {
  let query = db
    .selectFrom("app.environment_role_invitations")
    .select(invitationColumns)
    .where("environment_id", "=", environmentId)
    .where("closed_at", "is", null);

  if (filter.userId) query = query.where("user_id", "=", filter.userId);
  if (filter.role) query = query.where("role", "=", filter.role);
  if (filter.invitedByUserId) {
    query = query.where("invited_by_user_id", "=", filter.invitedByUserId);
  }

  return (await query.orderBy("created_at").execute()).map(toInvitation);
}

/**
 * Closes pending invitations. `closedBy` is the deciding user; a lapse has
 * none, because it is the consequence of another change.
 */
export async function closeRoleInvitations(
  db: Db,
  invitations: readonly RoleInvitationRecord[],
  outcome: RoleInvitationOutcome,
  closedBy: string | null,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  if (invitations.length === 0) {
    return;
  }

  await db
    .updateTable("app.environment_role_invitations")
    .set({ closed_at: now, outcome, closed_by_user_id: closedBy })
    .where(
      "id",
      "in",
      invitations.map((invitation) => invitation.id),
    )
    .where("closed_at", "is", null)
    .execute();

  for (const invitation of invitations) {
    events.record(environmentRoleInvitationClosed, {
      resourceId: invitation.environmentId,
      payload: {
        invitationId: invitation.id,
        userId: invitation.userId,
        role: invitation.role,
        outcome,
      },
    });
  }
}

/**
 * Invitations that only make sense while the user stays as they are: those
 * to the user, and the ownership handover the user offered as owner.
 */
export async function lapseInvitationsOf(
  db: Db,
  environmentId: string,
  userId: string,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const toUser = await pendingRoleInvitations(db, environmentId, { userId });
  const handover = await pendingRoleInvitations(db, environmentId, {
    role: "owner",
    invitedByUserId: userId,
  });

  await closeRoleInvitations(
    db,
    [...toUser, ...handover],
    "lapsed",
    null,
    now,
    events,
  );
}

/** Withdraws the user's claim to a vacant ownership, if any. */
export async function withdrawClaims(
  db: Db,
  environmentId: string,
  userId: string,
  now: Date,
  events: EventRecorder,
): Promise<boolean> {
  const { vacancy } = await findContinuity(db, environmentId);

  if (!vacancy) {
    return false;
  }

  const withdrawn = await db
    .updateTable("app.environment_ownership_claims")
    .set({ withdrawn_at: now })
    .where("vacancy_id", "=", vacancy.id)
    .where("user_id", "=", userId)
    .where("withdrawn_at", "is", null)
    .returning("id")
    .executeTakeFirst();

  if (withdrawn) {
    events.record(environmentOwnershipClaimWithdrawn, {
      resourceId: environmentId,
      payload: { userId },
    });
  }

  return withdrawn !== undefined;
}

export interface AdministratorRecord extends OwnershipCandidate {
  readonly isOwner: boolean;
  /** Holds an effectively active membership, so can act (PS-ENV-014). */
  readonly canAct: boolean;
}

/** Current administrators, longest continuous tenure first. */
export async function administrators(
  db: Db,
  environmentId: string,
  now: Date,
): Promise<AdministratorRecord[]> {
  const rows = await db
    .selectFrom("app.environment_role_grants as grant")
    .leftJoin("app.environment_role_grants as owner", (join) =>
      join
        .onRef("owner.environment_id", "=", "grant.environment_id")
        .onRef("owner.user_id", "=", "grant.user_id")
        .on("owner.role", "=", "owner")
        .on("owner.revoked_at", "is", null),
    )
    .leftJoin("app.environment_memberships as membership", (join) =>
      join
        .onRef("membership.environment_id", "=", "grant.environment_id")
        .onRef("membership.user_id", "=", "grant.user_id")
        .on("membership.state", "=", "active")
        .on((eb) =>
          eb.or([
            eb("membership.transition_deadline", "is", null),
            eb("membership.transition_deadline", ">", now),
          ]),
        ),
    )
    .select([
      "grant.id",
      "grant.user_id",
      "grant.granted_at",
      "owner.id as owner_grant_id",
      "membership.id as membership_id",
    ])
    .where("grant.environment_id", "=", environmentId)
    .where("grant.role", "=", "administrator")
    .where("grant.revoked_at", "is", null)
    .orderBy("grant.granted_at")
    .orderBy("grant.id")
    .execute();

  return rows.map((row) => ({
    userId: row.user_id,
    grantId: row.id,
    administratorSince: row.granted_at,
    isOwner: row.owner_grant_id !== null,
    canAct: row.membership_id !== null,
  }));
}

/**
 * The owner is gone without handing over (PS-ENV-013). With administrators
 * left, they get the claim period; without any, nobody can take over and the
 * environment winds down at once. A winding-down environment just continues
 * winding down: it needs no new owner to finish.
 */
export async function vacateOwnership(
  db: Db,
  environment: { id: string; state: string },
  formerOwnerUserId: string,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  if (environment.state !== "active") {
    return;
  }

  if ((await administrators(db, environment.id, now)).length === 0) {
    await startWindDown(db, environment.id, "ownerless", null, now, events);
    return;
  }

  const claimDeadline = daysAfter(now, ownershipClaimDays);

  await db
    .insertInto("app.environment_ownership_vacancies")
    .values({
      environment_id: environment.id,
      former_owner_user_id: formerOwnerUserId,
      opened_at: now,
      claim_deadline: claimDeadline,
    })
    .execute();
  events.record(environmentOwnershipVacated, {
    resourceId: environment.id,
    payload: { formerOwnerUserId, claimDeadline: claimDeadline.toISOString() },
  });
}

export async function closeVacancy(
  db: Db,
  environmentId: string,
  vacancyId: string,
  newOwnerUserId: string | null,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const outcome = newOwnerUserId ? "claimed" : "wound_down";

  await db
    .updateTable("app.environment_ownership_vacancies")
    .set({
      closed_at: now,
      outcome,
      new_owner_user_id: newOwnerUserId,
    })
    .where("id", "=", vacancyId)
    .execute();
  events.record(environmentOwnershipVacancyClosed, {
    resourceId: environmentId,
    payload: { outcome, newOwnerUserId },
  });
}

/**
 * PS-ENV-012: the environment stops taking anything new. A voluntary winding
 * down can be cancelled until `finalAt`; an ownerless one has nobody who
 * could, so it is final and settled at once.
 */
export async function startWindDown(
  db: Db,
  environmentId: string,
  reason: WindDownReason,
  startedByUserId: string | null,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const finalAt =
    reason === "voluntary" ? daysAfter(now, windDownCancellationDays) : now;

  const { id } = await db
    .insertInto("app.environment_wind_downs")
    .values({
      environment_id: environmentId,
      reason,
      started_at: now,
      started_by_user_id: startedByUserId,
      final_at: finalAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .updateTable("app.environments")
    .set({ state: "winding_down", updated_at: now })
    .where("id", "=", environmentId)
    .execute();
  events.record(environmentWindDownStarted, {
    resourceId: environmentId,
    payload: { reason, finalAt: finalAt.toISOString() },
  });

  if (reason === "ownerless") {
    await settleWindDown(db, environmentId, id, now, events);
  }
}

/**
 * Once winding down is final, membership processes that waited for it end
 * neutrally (vision: «avsluttes kontrollert etter sin art»): applications and
 * invitations end, passive members' reactivation requests close, and pending
 * and active publications end (WP-25). Members, roles, history and the
 * objects themselves stay.
 */
export async function settleWindDown(
  db: Db,
  environmentId: string,
  windDownId: string,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const ended = await db
    .updateTable("app.environment_memberships")
    .set({
      state: "ended",
      end_reason: "environment_wound_down",
      ended_at: now,
      review_stage: null,
      updated_at: now,
    })
    .where("environment_id", "=", environmentId)
    .where("state", "=", "pending")
    .returning(["id", "user_id"])
    .execute();
  const reviewsClosed = await db
    .updateTable("app.environment_memberships")
    .set({ review_stage: null, updated_at: now })
    .where("environment_id", "=", environmentId)
    .where("state", "=", "passive")
    .where("review_stage", "is not", null)
    .returning(["id", "user_id"])
    .execute();

  await endEnvironmentPublications(db, environmentId, now, events);
  await db
    .updateTable("app.environment_wind_downs")
    .set({ settled_at: now, outcome: "finalized" })
    .where("id", "=", windDownId)
    .execute();

  for (const row of ended) {
    events.record(membershipEnded, {
      resourceId: row.id,
      payload: {
        environmentId,
        userId: row.user_id,
        reason: "environment_wound_down",
      },
    });
  }
  for (const row of reviewsClosed) {
    events.record(membershipReviewClosed, {
      resourceId: row.id,
      payload: {
        environmentId,
        userId: row.user_id,
        reason: "environment_wound_down",
      },
    });
  }
  events.record(environmentWindDownFinalized, {
    resourceId: environmentId,
    payload: {},
  });
}

import type {
  EnvironmentRole,
  EnvironmentState,
  EnvironmentType,
  MembershipOrigin,
  MembershipPassiveReason,
  MembershipReviewStage,
  MembershipState,
  RequirementKind,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { Actor } from "../actor";
import type { EventRecorder } from "../events/recorder";
import { membershipPassivated } from "./events";
import {
  effectiveState,
  type EnvironmentAccess,
  type EnvironmentRecord,
  type GivenAnswer,
  isTransitionExpired,
  type MembershipRecord,
  type RequirementRecord,
} from "./model";
import {
  type HistoryPosition,
  toOptionalPosition,
  toPosition,
} from "./privacy";

/**
 * Database access for the environment core. Commands pass their transaction
 * and lock what they change; queries pass the pool.
 */
type Db = Kysely<Database>;

const environmentColumns = [
  "id",
  "type",
  "state",
  "name",
  "description",
  "audience",
  "object_focus",
  "location",
  "version",
  "requirements_revision",
  "requires_object_approval",
] as const;

export async function findEnvironment(
  db: Db,
  environmentId: string,
  options: { lock?: boolean } = {},
): Promise<EnvironmentRecord | null> {
  let query = db
    .selectFrom("app.environments")
    .select(environmentColumns)
    .where("id", "=", environmentId);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row
    ? {
        id: row.id,
        type: row.type as EnvironmentType,
        state: row.state as EnvironmentState,
        name: row.name,
        description: row.description,
        audience: row.audience,
        objectFocus: row.object_focus,
        location: row.location,
        version: row.version,
        requirementsRevision: row.requirements_revision,
        requiresObjectApproval: row.requires_object_approval,
      }
    : null;
}

const membershipColumns = [
  "id",
  "environment_id",
  "user_id",
  "state",
  "origin",
  "review_stage",
  "activated_position",
  "activation_revision",
  "transition_deadline",
  "passive_reason",
  "passive_position",
] as const;

function toMembership(row: {
  id: string;
  environment_id: string;
  user_id: string;
  state: string;
  origin: string;
  review_stage: string | null;
  activated_position: string | null;
  activation_revision: number | null;
  transition_deadline: Date | null;
  passive_reason: string | null;
  passive_position: string | null;
}): MembershipRecord {
  return {
    id: row.id,
    environmentId: row.environment_id,
    userId: row.user_id,
    state: row.state as MembershipState,
    origin: row.origin as MembershipOrigin,
    reviewStage: row.review_stage as MembershipReviewStage | null,
    activatedPosition: toOptionalPosition(row.activated_position),
    activationRevision: row.activation_revision,
    transitionDeadline: row.transition_deadline,
    passiveReason: row.passive_reason as MembershipPassiveReason | null,
    passivePosition: toOptionalPosition(row.passive_position),
  };
}

/** The user's current (not ended) membership in the environment. */
export async function findCurrentMembership(
  db: Db,
  environmentId: string,
  userId: string,
  options: { lock?: boolean } = {},
): Promise<MembershipRecord | null> {
  let query = db
    .selectFrom("app.environment_memberships")
    .select(membershipColumns)
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", userId)
    .where("state", "<>", "ended");

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row ? toMembership(row) : null;
}

/** A membership of the environment by id, locked for a decision. */
export async function findMembership(
  db: Db,
  environmentId: string,
  membershipId: string,
): Promise<MembershipRecord | null> {
  const row = await db
    .selectFrom("app.environment_memberships")
    .select(membershipColumns)
    .where("id", "=", membershipId)
    .where("environment_id", "=", environmentId)
    .forUpdate()
    .executeTakeFirst();

  return row ? toMembership(row) : null;
}

/** Locks the environment's memberships in the given state. */
export async function lockMemberships(
  db: Db,
  environmentId: string,
  state: Exclude<MembershipState, "ended">,
): Promise<MembershipRecord[]> {
  const rows = await db
    .selectFrom("app.environment_memberships")
    .select(membershipColumns)
    .where("environment_id", "=", environmentId)
    .where("state", "=", state)
    .orderBy("id")
    .forUpdate()
    .execute();

  return rows.map(toMembership);
}

/** Current memberships of an environment, optionally only some states. */
export async function listCurrentMemberships(
  db: Db,
  environmentId: string,
  states: readonly Exclude<MembershipState, "ended">[] = [
    "pending",
    "active",
    "passive",
  ],
): Promise<(MembershipRecord & { realName: string | null })[]> {
  const rows = await db
    .selectFrom("app.environment_memberships as membership")
    .leftJoin(
      "app.profiles as profile",
      "profile.user_id",
      "membership.user_id",
    )
    .select(membershipColumns.map((column) => `membership.${column}` as const))
    .select("profile.real_name")
    .where("membership.environment_id", "=", environmentId)
    .where("membership.state", "in", [...states])
    .orderBy("membership.created_at")
    .orderBy("membership.id")
    .execute();

  return rows.map((row) => ({ ...toMembership(row), realName: row.real_name }));
}

export async function findActiveRoles(
  db: Db,
  environmentId: string,
  userId: string,
): Promise<EnvironmentRole[]> {
  const rows = await db
    .selectFrom("app.environment_role_grants")
    .select("role")
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .orderBy("role", "desc")
    .execute();

  return rows.map((row) => row.role as EnvironmentRole);
}

export async function isRestricted(
  db: Db,
  environmentId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("app.environment_access_restrictions")
    .select("id")
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", userId)
    .where("lifted_at", "is", null)
    .executeTakeFirst();

  return row !== undefined;
}

export async function currentRequirements(
  db: Db,
  environmentId: string,
): Promise<RequirementRecord[]> {
  const rows = await db
    .selectFrom("app.environment_requirements")
    .select(["id", "kind", "text", "introduced_in_revision"])
    .where("environment_id", "=", environmentId)
    .where("retired_in_revision", "is", null)
    .orderBy("position")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as RequirementKind,
    text: row.text,
    introducedInRevision: row.introduced_in_revision,
  }));
}

/** Answers per membership, for the given memberships. */
export async function answersOf(
  db: Db,
  membershipIds: readonly string[],
): Promise<Map<string, GivenAnswer[]>> {
  const answers = new Map<string, GivenAnswer[]>(
    membershipIds.map((id) => [id, []]),
  );

  if (membershipIds.length === 0) {
    return answers;
  }

  const rows = await db
    .selectFrom("app.environment_membership_answers")
    .select(["membership_id", "requirement_id", "answer"])
    .where("membership_id", "in", [...membershipIds])
    .execute();

  for (const row of rows) {
    answers.get(row.membership_id)?.push({
      requirementId: row.requirement_id,
      answer: row.answer,
    });
  }

  return answers;
}

/** Stores the answers of a membership, replacing earlier ones. */
export async function saveAnswers(
  db: Db,
  membership: Pick<MembershipRecord, "id" | "environmentId">,
  answers: readonly GivenAnswer[],
  now: Date,
): Promise<void> {
  if (answers.length === 0) {
    return;
  }

  await db
    .insertInto("app.environment_membership_answers")
    .values(
      answers.map((answer) => ({
        membership_id: membership.id,
        environment_id: membership.environmentId,
        requirement_id: answer.requirementId,
        answer: answer.answer,
        given_at: now,
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(["membership_id", "requirement_id"]).doUpdateSet({
        answer: (eb) => eb.ref("excluded.answer"),
        given_at: (eb) => eb.ref("excluded.given_at"),
      }),
    )
    .execute();
}

/**
 * The environment and the caller's relation to it. With `lock`, the
 * environment row and the caller's membership are locked for the command, so
 * membership changes in one environment are serialized.
 */
export async function loadEnvironmentAccess(
  db: Db,
  environmentId: string,
  actor: Actor,
  now: Date,
  options: { lock?: boolean } = {},
): Promise<EnvironmentAccess | null> {
  const environment = await findEnvironment(db, environmentId, options);

  if (!environment) {
    return null;
  }

  if (actor.kind !== "user") {
    return {
      environment,
      ownMembership: null,
      viewer: { membership: null, roles: [], restricted: false },
    };
  }

  // Sequential: a command's transaction has a single connection.
  const membership = await findCurrentMembership(
    db,
    environmentId,
    actor.userId,
    options,
  );
  const roles = await findActiveRoles(db, environmentId, actor.userId);
  const restricted = await isRestricted(db, environmentId, actor.userId);

  return {
    environment,
    ownMembership: membership,
    viewer: {
      membership: membership
        ? {
            id: membership.id,
            state: effectiveState(membership, now) as Exclude<
              MembershipState,
              "ended"
            >,
          }
        : null,
      roles,
      restricted,
    },
  };
}

/**
 * Records a passivation that is already due (PS-ENV-006), so a command never
 * acts on an active state that has in fact expired.
 */
export async function settleMembership(
  db: Db,
  membership: MembershipRecord,
  now: Date,
  events: EventRecorder,
): Promise<MembershipRecord> {
  if (!isTransitionExpired(membership, now)) {
    return membership;
  }

  const positions = await passivate(db, [membership], now, events);

  return {
    ...membership,
    state: "passive",
    transitionDeadline: null,
    passiveReason: "requirements_not_met",
    passivePosition: positions.get(membership.id) ?? null,
  };
}

/**
 * Makes active members passive: they keep their membership and the history
 * they need, but take part in nothing new (PS-ENV-004).
 */
export async function passivate(
  db: Db,
  memberships: readonly MembershipRecord[],
  now: Date,
  events: EventRecorder,
  reason: MembershipPassiveReason = "requirements_not_met",
): Promise<Map<string, HistoryPosition>> {
  if (memberships.length === 0) {
    return new Map();
  }

  const rows = await db
    .updateTable("app.environment_memberships")
    .set({
      state: "passive",
      transition_deadline: null,
      passive_reason: reason,
      passive_since: now,
      updated_at: now,
    })
    .where(
      "id",
      "in",
      memberships.map((membership) => membership.id),
    )
    .returning(["id", "passive_position"])
    .execute();

  for (const membership of memberships) {
    events.record(membershipPassivated, {
      resourceId: membership.id,
      payload: {
        environmentId: membership.environmentId,
        userId: membership.userId,
        reason,
      },
    });
  }

  // The database gives each passive period its position (PS-ENV-009).
  return new Map(
    rows.flatMap((row) =>
      row.passive_position === null
        ? []
        : [[row.id, toPosition(row.passive_position)] as const],
    ),
  );
}

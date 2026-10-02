import type {
  Environment,
  EnvironmentMemberships,
  EnvironmentRole,
  EnvironmentSummary,
  EnvironmentType,
  MembershipState,
  OwnMembership,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineQuery } from "../commands/query";
import {
  effectiveState,
  type GivenAnswer,
  type MembershipRecord,
  type OwnEnvironmentRow,
  type RequirementRecord,
  unmetRequirements,
} from "./model";
import {
  listMembershipsPolicy,
  listOwnEnvironmentsPolicy,
  readEnvironmentPolicy,
} from "./policies";
import {
  answersOf,
  currentRequirements,
  listCurrentMemberships,
  loadEnvironmentAccess,
} from "./store";

const environmentInput = z.strictObject({ environmentId: z.uuid() });

/** A membership as its member or an administrator sees it. */
function presentMembership(
  membership: MembershipRecord,
  requirements: readonly RequirementRecord[],
  answers: readonly GivenAnswer[],
  now: Date,
): OwnMembership {
  const state = effectiveState(membership, now);

  return {
    id: membership.id,
    state,
    origin: membership.origin,
    reviewStage: membership.reviewStage,
    passiveReason:
      state === "passive"
        ? (membership.passiveReason ?? "requirements_not_met")
        : null,
    transitionDeadline:
      state === "active"
        ? (membership.transitionDeadline?.toISOString() ?? null)
        : null,
    unmetRequirementIds: unmetRequirements(
      { ...membership, state },
      requirements,
      new Set(answers.map((answer) => answer.requirementId)),
    ).map((requirement) => requirement.id),
    answers: answers.map((answer) => ({ ...answer })),
  };
}

/**
 * One environment, as far as the caller may see it (PS-ENV-001): the public
 * details and requirements of an open or closed environment, never its
 * members or administrators; a hidden one only for its own members and
 * invited users. The caller's own membership and answers are included.
 */
export const getEnvironment = defineQuery({
  name: "environment.read",
  input: environmentInput,
  policy: readEnvironmentPolicy,
  load: async ({ db, actor, input, now }) => {
    const access = await loadEnvironmentAccess(
      db,
      input.environmentId,
      actor,
      now,
    );

    if (!access) {
      return null;
    }

    const own = access.ownMembership;

    return {
      resource: {
        ...access,
        requirements: await currentRequirements(db, input.environmentId),
        answers: own ? ((await answersOf(db, [own.id])).get(own.id) ?? []) : [],
      },
      context: undefined,
    };
  },
  present: ({ resource, now }): Environment => {
    const { environment, ownMembership, viewer } = resource;

    return {
      id: environment.id,
      type: environment.type,
      state: environment.state,
      name: environment.name,
      description: environment.description,
      audience: environment.audience,
      objectFocus: environment.objectFocus,
      location: environment.location,
      version: environment.version,
      requirementsRevision: environment.requirementsRevision,
      requirements: resource.requirements.map(({ id, kind, text }) => ({
        id,
        kind,
        text,
      })),
      membership: ownMembership
        ? presentMembership(
            ownMembership,
            resource.requirements,
            resource.answers,
            now,
          )
        : null,
      roles: [...viewer.roles],
    };
  },
});

/** The caller's own current memberships, including pending invitations. */
export const listOwnEnvironments = defineQuery({
  name: "environment.list_own",
  input: z.strictObject({}),
  policy: listOwnEnvironmentsPolicy,
  load: async ({ db, actor }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const rows = await db
      .selectFrom("app.environment_memberships as membership")
      .innerJoin(
        "app.environments as environment",
        "environment.id",
        "membership.environment_id",
      )
      .select([
        "environment.id",
        "environment.type",
        "environment.name",
        "membership.state",
        "membership.transition_deadline as transitionDeadline",
      ])
      .where("membership.user_id", "=", actor.userId)
      .where("membership.state", "<>", "ended")
      .orderBy("environment.name")
      .orderBy("environment.id")
      .execute();
    const grants = await db
      .selectFrom("app.environment_role_grants")
      .select(["environment_id", "role"])
      .where("user_id", "=", actor.userId)
      .where("revoked_at", "is", null)
      .orderBy("role", "desc")
      .execute();

    return {
      resource: rows.map((row): OwnEnvironmentRow => ({
        ...row,
        type: row.type as EnvironmentType,
        state: row.state as MembershipState,
        roles: grants
          .filter((grant) => grant.environment_id === row.id)
          .map((grant) => grant.role as EnvironmentRole),
      })),
      context: undefined,
    };
  },
  present: ({ resource, now }): EnvironmentSummary[] =>
    resource.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      membershipState: effectiveState(row, now),
      roles: [...row.roles],
    })),
});

/**
 * What administrators need to handle memberships: every current membership
 * with the member's name and the answers given to the membership process
 * (UX-PRIV-009: shown as membership information, not as profile data), and
 * who is barred from new attempts.
 */
export const listMemberships = defineQuery({
  name: "environment_membership.list",
  input: environmentInput,
  policy: listMembershipsPolicy,
  load: async ({ db, actor, input, now }) => {
    const access = await loadEnvironmentAccess(
      db,
      input.environmentId,
      actor,
      now,
    );

    if (!access) {
      return null;
    }

    const memberships = await listCurrentMemberships(db, input.environmentId);
    const restrictions = await db
      .selectFrom("app.environment_access_restrictions")
      .select("user_id")
      .where("environment_id", "=", input.environmentId)
      .where("lifted_at", "is", null)
      .orderBy("imposed_at")
      .execute();

    return {
      resource: {
        ...access,
        memberships,
        requirements: await currentRequirements(db, input.environmentId),
        answers: await answersOf(
          db,
          memberships.map((membership) => membership.id),
        ),
        restrictedUserIds: restrictions.map((row) => row.user_id),
      },
      context: undefined,
    };
  },
  present: ({ resource, now }): EnvironmentMemberships => ({
    memberships: resource.memberships.map((membership) => ({
      ...presentMembership(
        membership,
        resource.requirements,
        resource.answers.get(membership.id) ?? [],
        now,
      ),
      userId: membership.userId,
      realName: membership.realName,
    })),
    restrictedUserIds: resource.restrictedUserIds,
  }),
});

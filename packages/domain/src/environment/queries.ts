import type {
  Environment,
  EnvironmentContinuity,
  EnvironmentMembers,
  EnvironmentMemberships,
  EnvironmentRoles,
  EnvironmentRole,
  EnvironmentSummary,
  EnvironmentType,
  MembershipState,
  OwnMembership,
  TypeChangeProposal,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineQuery } from "../commands/query";
import {
  type AdministratorRecord,
  administrators,
  findContinuity,
  pendingRoleInvitations,
} from "./continuity-store";
import {
  activeFrom,
  type ContinuityRecord,
  effectiveState,
  isWindDownCancellable,
  type GivenAnswer,
  type MembershipRecord,
  type OwnEnvironmentRow,
  type RequirementRecord,
  unmetRequirements,
} from "./model";
import {
  type HistoryPosition,
  mayExposeHistory,
  type TypePeriod,
  widenedAfterPassivation,
} from "./privacy";
import {
  listMembersPolicy,
  listMembershipsPolicy,
  listRolesPolicy,
  listOwnEnvironmentsPolicy,
  readEnvironmentPolicy,
} from "./policies";
import {
  answersOf,
  currentRequirements,
  listCurrentMemberships,
  loadEnvironmentAccess,
} from "./store";
import {
  currentResponses,
  findOpenProposal,
  typePeriods,
} from "./type-change-store";
import { rateLimits } from "../abuse/rate-limits";
import { inSnapshot } from "../objects/state";
import { personPageIds, profileIdIn } from "../people/queries";

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
 * PS-ENV-012–014 as the caller's membership needs it: whether processes that
 * need an administrator can be handled now, and any ownership vacancy or
 * winding down in progress.
 */
function presentContinuity(
  continuity: ContinuityRecord,
  admins: readonly AdministratorRecord[],
  claimedByYou: boolean,
  now: Date,
): EnvironmentContinuity {
  const { vacancy, windDown } = continuity;

  return {
    administrationAvailable: admins.some((admin) => admin.canAct),
    ownershipVacancy: vacancy
      ? { claimDeadline: vacancy.claimDeadline.toISOString(), claimedByYou }
      : null,
    windDown: windDown
      ? {
          reason: windDown.reason,
          finalAt: windDown.finalAt.toISOString(),
          cancellable: isWindDownCancellable(windDown, now),
        }
      : null,
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
  rateLimit: rateLimits.lookups,
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
    const userId = actor.kind === "user" ? actor.userId : null;
    // Continuity is only for the environment's own members and invitees.
    const continuity =
      own && userId
        ? {
            record: await findContinuity(db, input.environmentId),
            admins: await administrators(db, input.environmentId, now),
            claimed: await hasOpenClaim(db, input.environmentId, userId),
            invitations: await pendingRoleInvitations(db, input.environmentId, {
              userId,
            }),
          }
        : null;

    return {
      resource: {
        ...access,
        requirements: await currentRequirements(db, input.environmentId),
        answers: own ? ((await answersOf(db, [own.id])).get(own.id) ?? []) : [],
        continuity,
        typeChange:
          own && access.viewer.membership?.state !== "pending"
            ? await ownTypeChange(db, input.environmentId, own.id)
            : null,
      },
      context: undefined,
    };
  },
  present: ({ resource, now }): Environment => {
    const { environment, ownMembership, viewer, continuity, typeChange } =
      resource;

    return {
      id: environment.id,
      type: environment.type,
      state: environment.state,
      name: environment.name,
      description: environment.description,
      audience: environment.audience,
      objectFocus: environment.objectFocus,
      location: environment.location,
      area: environment.area,
      version: environment.version,
      requirementsRevision: environment.requirementsRevision,
      requiresObjectApproval: environment.requiresObjectApproval,
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
      continuity: continuity
        ? presentContinuity(
            continuity.record,
            continuity.admins,
            continuity.claimed,
            now,
          )
        : null,
      roleInvitations: (continuity?.invitations ?? []).map(({ id, role }) => ({
        id,
        role,
      })),
      typeChange,
    };
  },
});

/**
 * A proposed weaker type, for a member (PS-ENV-008): what is proposed, by
 * when, and the member's own answer. Nobody else's answers, and no tally.
 */
async function ownTypeChange(
  db: Parameters<typeof findOpenProposal>[0],
  environmentId: string,
  membershipId: string,
): Promise<TypeChangeProposal | null> {
  const proposal = await findOpenProposal(db, environmentId);

  if (!proposal) {
    return null;
  }

  return {
    id: proposal.id,
    toType: proposal.toType,
    process: proposal.process,
    deadline: proposal.deadline.toISOString(),
    yourResponse:
      (await currentResponses(db, proposal.id)).get(membershipId) ?? null,
  };
}

/**
 * PS-ENV-009 for membership lists: a member who did not take part in a
 * weaker type is passive and keeps the stricter context. Their membership,
 * and what they gave to it, is only shown to members who were active before
 * the type became weaker; later members do not learn of it, whatever their
 * role. Members who are active have accepted the type that applies now.
 */
function historicallyVisible(
  periods: readonly TypePeriod[],
  viewerActiveFrom: HistoryPosition | null,
) {
  return (membership: MembershipRecord) =>
    membership.state !== "passive" ||
    membership.passivePosition === null ||
    mayExposeHistory(
      widenedAfterPassivation(periods, membership.passivePosition),
      viewerActiveFrom,
    );
}

async function hasOpenClaim(
  db: Parameters<typeof findContinuity>[0],
  environmentId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("app.environment_ownership_claims as claim")
    .innerJoin(
      "app.environment_ownership_vacancies as vacancy",
      "vacancy.id",
      "claim.vacancy_id",
    )
    .select("claim.id")
    .where("vacancy.environment_id", "=", environmentId)
    .where("vacancy.closed_at", "is", null)
    .where("claim.user_id", "=", userId)
    .where("claim.withdrawn_at", "is", null)
    .executeTakeFirst();

  return row !== undefined;
}

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

    const visible = historicallyVisible(
      await typePeriods(db, input.environmentId),
      activeFrom(access.ownMembership),
    );
    const memberships = (
      await listCurrentMemberships(db, input.environmentId)
    ).filter(visible);
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

/**
 * Of the given users, those an ordinary member may not be shown: an account
 * that is not active, or a block either way with the viewer (PS-USR-006,
 * UX-PRIV-007). Neither side learns which.
 */
async function hiddenFromViewer(
  db: Parameters<typeof findContinuity>[0],
  viewerId: string,
  userIds: readonly string[],
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }

  const inactive = await db
    .selectFrom("app.users")
    .select("id")
    .where("id", "in", [...userIds])
    .where("status", "<>", "active")
    .execute();
  const blocks = await db
    .selectFrom("app.user_blocks")
    .select(["blocker_id", "blocked_id"])
    .where("lifted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("blocker_id", "=", viewerId),
          eb("blocked_id", "in", [...userIds]),
        ]),
        eb.and([
          eb("blocked_id", "=", viewerId),
          eb("blocker_id", "in", [...userIds]),
        ]),
      ]),
    )
    .execute();

  return new Set([
    ...inactive.map((row) => row.id),
    ...blocks.map((row) =>
      row.blocker_id === viewerId ? row.blocked_id : row.blocker_id,
    ),
  ]);
}

/** In alphabetical order, names that are gone last. */
const byName = <T extends { realName: string | null }>(people: readonly T[]) =>
  [...people].sort(
    (a, b) =>
      Number(a.realName === null) - Number(b.realName === null) ||
      (a.realName ?? "").localeCompare(b.realName ?? "", "nb"),
  );

/**
 * The other active members, as an active member sees them (vision 03): name
 * and role, so members can find each other's pages and become friends. With
 * the same historical visibility as the administrators' list (PS-ENV-009),
 * and nothing given to the membership process (UX-PRIV-009). Passive
 * members, accounts that are not active and anyone the viewer has blocked
 * or is blocked by are left out.
 */
export const listEnvironmentMembers = defineQuery({
  name: "environment_member.list",
  input: environmentInput,
  policy: listMembersPolicy,
  rateLimit: rateLimits.lookups,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const access = await loadEnvironmentAccess(
        tx,
        input.environmentId,
        actor,
        now,
      );

      if (!access) {
        return null;
      }

      const viewerId = actor.kind === "user" ? actor.userId : null;
      const visible = historicallyVisible(
        await typePeriods(tx, input.environmentId),
        activeFrom(access.ownMembership),
      );
      const candidates = (
        await listCurrentMemberships(tx, input.environmentId, ["active"])
      ).filter(
        (membership) =>
          membership.userId !== viewerId &&
          effectiveState(membership, now) === "active" &&
          visible(membership),
      );
      const hidden = viewerId
        ? await hiddenFromViewer(
            tx,
            viewerId,
            candidates.map((membership) => membership.userId),
          )
        : new Set<string>();
      const members = candidates.filter(
        (membership) => !hidden.has(membership.userId),
      );
      const grants = await tx
        .selectFrom("app.environment_role_grants")
        .select(["user_id", "role"])
        .where("environment_id", "=", input.environmentId)
        .where("revoked_at", "is", null)
        .orderBy("role", "desc")
        .execute();
      const pages = viewerId
        ? await personPageIds(
            tx,
            viewerId,
            members.map((membership) => membership.userId),
            now,
          )
        : new Set<string>();

      return {
        resource: { ...access, members, grants, pages },
        context: undefined,
      };
    }),
  present: ({ resource }): EnvironmentMembers => ({
    members: byName(resource.members).map((membership) => ({
      userId: membership.userId,
      realName: membership.realName,
      profileId: profileIdIn(resource.pages, membership.userId),
      roles: resource.grants
        .filter((grant) => grant.user_id === membership.userId)
        .map((grant) => grant.role as EnvironmentRole),
    })),
  }),
});

/**
 * What administrators need to manage roles (PS-ENV-003): who holds which
 * role and since when they have administered without interruption, which
 * decides a vacant ownership (PS-ENV-013), and pending role invitations.
 */
export const listRoles = defineQuery({
  name: "environment.list_roles",
  input: environmentInput,
  policy: listRolesPolicy,
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

    const visible = historicallyVisible(
      await typePeriods(db, input.environmentId),
      activeFrom(access.ownMembership),
    );
    const hidden = new Set(
      (await listCurrentMemberships(db, input.environmentId, ["passive"]))
        .filter((membership) => !visible(membership))
        .map((membership) => membership.userId),
    );
    const admins = (await administrators(db, input.environmentId, now)).filter(
      (admin) => !hidden.has(admin.userId),
    );
    // A role invitation names its invitee just as much as a role does.
    const invitations = (
      await pendingRoleInvitations(db, input.environmentId)
    ).filter((invitation) => !hidden.has(invitation.userId));
    const userIds = [
      ...new Set([
        ...admins.map((admin) => admin.userId),
        ...invitations.map((invitation) => invitation.userId),
      ]),
    ];
    const names = new Map(
      userIds.length === 0
        ? []
        : (
            await db
              .selectFrom("app.profiles")
              .select(["user_id", "real_name"])
              .where("user_id", "in", userIds)
              .execute()
          ).map((row) => [row.user_id, row.real_name]),
    );
    return {
      resource: { ...access, admins, invitations, names },
      context: undefined,
    };
  },
  present: ({ resource }): EnvironmentRoles => ({
    holders: resource.admins.map((admin) => ({
      userId: admin.userId,
      realName: resource.names.get(admin.userId) ?? null,
      roles: admin.isOwner ? ["owner", "administrator"] : ["administrator"],
      administratorSince: admin.administratorSince.toISOString(),
    })),
    invitations: resource.invitations.map((invitation) => ({
      id: invitation.id,
      userId: invitation.userId,
      realName: resource.names.get(invitation.userId) ?? null,
      role: invitation.role,
      invitedByUserId: invitation.invitedByUserId,
      createdAt: invitation.createdAt.toISOString(),
    })),
  }),
});

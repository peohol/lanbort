import {
  createEnvironmentSchema,
  updateEnvironmentDetailsSchema,
  updateRequirementsSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import { z } from "zod";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import {
  environmentCreated,
  environmentDetailsUpdated,
  environmentRequirementsChanged,
  environmentRestrictionLifted,
  environmentRoleGranted,
  membershipActivated,
  membershipTransitionCompleted,
  membershipTransitionStarted,
} from "./events";
import {
  isTransitionExpired,
  type MembershipRecord,
  planRequirementChange,
  type RequirementRecord,
  transitionDeadlineFrom,
  unmetRequirements,
} from "./model";
import {
  createEnvironmentPolicy,
  liftRestrictionPolicy,
  updateEnvironmentDetailsPolicy,
  updateRequirementsPolicy,
} from "./policies";
import {
  answersOf,
  currentRequirements,
  loadEnvironmentAccess,
  lockMemberships,
  passivate,
} from "./store";

/** The environment a command acts on, taken from the URL. */
export const environmentIdInput = { environmentId: z.uuid() };

const environmentOutput = z.strictObject({ environmentId: z.uuid() });

/** Loads the environment and the caller's relation to it, locked. */
export const loadLockedAccess = <I extends { environmentId: string }>({
  tx,
  actor,
  input,
  now,
}: {
  tx: Transaction<Database>;
  actor: Actor;
  input: I;
  now: Date;
}) =>
  loadEnvironmentAccess(tx, input.environmentId, actor, now, {
    lock: true,
  }).then((access) =>
    access ? { resource: access, context: undefined } : null,
  );

function userIdOf(actor: Actor): string {
  if (actor.kind !== "user") {
    throw new Error("Only users act on environments");
  }

  return actor.userId;
}

function details(input: {
  name: string;
  description?: string | null | undefined;
  audience?: string | null | undefined;
  objectFocus?: string | null | undefined;
  location?: string | null | undefined;
}) {
  return {
    name: input.name,
    description: input.description ?? null,
    audience: input.audience ?? null,
    object_focus: input.objectFocus ?? null,
    location: input.location ?? null,
  };
}

/**
 * PS-ENV-001–003: any registered user can create an environment and becomes
 * its owner and administrator, and its first active member.
 */
export const createEnvironment = defineCommand({
  name: "environment.create",
  input: createEnvironmentSchema,
  output: environmentOutput,
  policy: createEnvironmentPolicy,
  idempotency: "required",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, actor, input, events, now }) => {
    const userId = userIdOf(actor);
    const requirements = input.requirements ?? [];
    const revision = requirements.length > 0 ? 1 : 0;

    const { id } = await tx
      .insertInto("app.environments")
      .values({
        type: input.type,
        ...details(input),
        requirements_revision: revision,
        created_by_user_id: userId,
        created_at: now,
        updated_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    if (requirements.length > 0) {
      await tx
        .insertInto("app.environment_requirements")
        .values(
          requirements.map((requirement, position) => ({
            environment_id: id,
            kind: requirement.kind,
            text: requirement.text,
            position,
            introduced_in_revision: revision,
          })),
        )
        .execute();
    }

    // The founder wrote the requirements and is active from the start.
    const membership = await tx
      .insertInto("app.environment_memberships")
      .values({
        environment_id: id,
        user_id: userId,
        state: "active",
        origin: "founder",
        activated_at: now,
        activation_revision: revision,
        created_at: now,
        updated_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await tx
      .insertInto("app.environment_role_grants")
      .values(
        (["owner", "administrator"] as const).map((role) => ({
          environment_id: id,
          user_id: userId,
          role,
          granted_at: now,
          granted_by_user_id: userId,
        })),
      )
      .execute();

    events.record(environmentCreated, {
      resourceId: id,
      payload: { type: input.type },
    });
    for (const role of ["owner", "administrator"] as const) {
      events.record(environmentRoleGranted, {
        resourceId: id,
        payload: { userId, role },
      });
    }
    events.record(membershipActivated, {
      resourceId: membership.id,
      payload: { environmentId: id, userId, via: "founder" },
    });

    return { environmentId: id };
  },
});

/** Name, description and other details, based on the version the client saw. */
export const updateEnvironmentDetails = defineCommand({
  name: "environment.update_details",
  input: z.strictObject({
    ...updateEnvironmentDetailsSchema.shape,
    ...environmentIdInput,
  }),
  output: z.strictObject({ version: z.int().positive() }),
  policy: updateEnvironmentDetailsPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, input, resource, events, now }) => {
    if (resource.environment.version !== input.expectedVersion) {
      throw new DomainError("conflict", "The environment has changed");
    }

    const version = resource.environment.version + 1;

    await tx
      .updateTable("app.environments")
      .set({ ...details(input), version, updated_at: now })
      .where("id", "=", resource.environment.id)
      .execute();

    events.record(environmentDetailsUpdated, {
      resourceId: resource.environment.id,
      payload: { version },
    });

    return { version };
  },
});

/**
 * PS-ENV-005–006. Changes take effect for new memberships at once, because
 * activation always checks the current requirements. Active members who must
 * act on a new requirement get a transition period; removing a requirement
 * needs nothing from anyone. A changed text is a new requirement, so every
 * member explicitly sees and meets the wording that applies to them.
 */
export const updateRequirements = defineCommand({
  name: "environment.update_requirements",
  input: z.strictObject({
    ...updateRequirementsSchema.shape,
    ...environmentIdInput,
  }),
  output: z.strictObject({ revision: z.int().nonnegative() }),
  policy: updateRequirementsPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, input, resource, events, now }) => {
    const environment = resource.environment;

    if (environment.requirementsRevision !== input.expectedRevision) {
      throw new DomainError("conflict", "The requirements have changed");
    }

    const current = await currentRequirements(tx, environment.id);
    const plan = planRequirementChange(current, input.requirements);

    if (!plan.changed) {
      return { revision: environment.requirementsRevision };
    }

    const revision = environment.requirementsRevision + 1;

    if (plan.retiredIds.length > 0) {
      await tx
        .updateTable("app.environment_requirements")
        .set({ retired_in_revision: revision })
        .where("id", "in", [...plan.retiredIds])
        .execute();
    }

    for (const { id, position } of plan.kept) {
      await tx
        .updateTable("app.environment_requirements")
        .set({ position })
        .where("id", "=", id)
        .where("position", "<>", position)
        .execute();
    }

    if (plan.added.length > 0) {
      await tx
        .insertInto("app.environment_requirements")
        .values(
          plan.added.map((requirement) => ({
            environment_id: environment.id,
            ...requirement,
            introduced_in_revision: revision,
          })),
        )
        .execute();
    }

    await tx
      .updateTable("app.environments")
      .set({ requirements_revision: revision, updated_at: now })
      .where("id", "=", environment.id)
      .execute();

    events.record(environmentRequirementsChanged, {
      resourceId: environment.id,
      payload: {
        revision,
        added: plan.added.length,
        retired: plan.retiredIds.length,
      },
    });

    await updateTransitions(
      tx,
      environment.id,
      await currentRequirements(tx, environment.id),
      revision,
      now,
      events,
    );

    return { revision };
  },
});

/**
 * Starts, extends or completes the transition period of every active member
 * after a change of requirements (PS-ENV-006). A member who already missed a
 * deadline becomes passive first; a new requirement always gets a full period.
 */
async function updateTransitions(
  tx: Transaction<Database>,
  environmentId: string,
  requirements: readonly RequirementRecord[],
  revision: number,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const active = await lockMemberships(tx, environmentId, "active");
  const expired = active.filter((membership) =>
    isTransitionExpired(membership, now),
  );
  await passivate(tx, expired, now, events);

  const remaining = active.filter(
    (membership) => !expired.includes(membership),
  );
  const answers = await answersOf(
    tx,
    remaining.map((membership) => membership.id),
  );
  const newDeadline = transitionDeadlineFrom(now);

  for (const membership of remaining) {
    const answered = new Set(
      (answers.get(membership.id) ?? []).map((answer) => answer.requirementId),
    );
    const unmet = unmetRequirements(membership, requirements, answered);
    const deadline = nextDeadline(membership, unmet, revision, newDeadline);

    if (deadline?.getTime() === membership.transitionDeadline?.getTime()) {
      continue;
    }

    await tx
      .updateTable("app.environment_memberships")
      .set({ transition_deadline: deadline, updated_at: now })
      .where("id", "=", membership.id)
      .execute();

    const payload = {
      environmentId,
      userId: membership.userId,
    };

    if (deadline) {
      events.record(membershipTransitionStarted, {
        resourceId: membership.id,
        payload: { ...payload, deadline: deadline.toISOString() },
      });
    } else {
      events.record(membershipTransitionCompleted, {
        resourceId: membership.id,
        payload,
      });
    }
  }
}

function nextDeadline(
  membership: MembershipRecord,
  unmet: readonly RequirementRecord[],
  revision: number,
  newDeadline: Date,
): Date | null {
  if (unmet.length === 0) {
    return null;
  }

  const hasNewRequirement = unmet.some(
    (requirement) => requirement.introducedInRevision === revision,
  );

  if (!hasNewRequirement) {
    return membership.transitionDeadline;
  }

  return membership.transitionDeadline &&
    membership.transitionDeadline > newDeadline
    ? membership.transitionDeadline
    : newDeadline;
}

/** Lets a barred user make membership attempts again. */
export const liftRestriction = defineCommand({
  name: "environment.lift_restriction",
  input: z.strictObject({ ...environmentIdInput, userId: z.uuid() }),
  output: z.strictObject({ lifted: z.literal(true) }),
  policy: liftRestrictionPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const lifted = await tx
      .updateTable("app.environment_access_restrictions")
      .set({ lifted_at: now, lifted_by_user_id: userIdOf(actor) })
      .where("environment_id", "=", resource.environment.id)
      .where("user_id", "=", input.userId)
      .where("lifted_at", "is", null)
      .returning("id")
      .executeTakeFirst();

    if (!lifted) {
      throw new DomainError("not_found", "No active restriction");
    }

    events.record(environmentRestrictionLifted, {
      resourceId: resource.environment.id,
      payload: { userId: input.userId },
    });

    return { lifted: true as const };
  },
});

export { userIdOf };

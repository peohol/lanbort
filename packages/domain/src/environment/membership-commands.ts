import {
  inviteMemberSchema,
  membershipDecisionSchema,
  membershipStateSchema,
  requirementAnswersSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import { z } from "zod";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { lockPair, socialRelationBetween } from "../social/pair";
import { lapseInvitationsOf } from "./continuity-store";
import {
  environmentIdInput,
  loadLockedAccess,
  userIdOf,
} from "./environment-commands";
import {
  environmentRestrictionImposed,
  membershipActivated,
  membershipAnswersSubmitted,
  membershipEnded,
  membershipInformationRequested,
  membershipInvited,
  membershipRejected,
  membershipReviewRequested,
  membershipTransitionCompleted,
} from "./events";
import {
  acceptsNewActivity,
  type EnvironmentRecord,
  type MembershipRecord,
  unmetRequirements,
  validateAnswers,
} from "./model";
import {
  acceptInvitationPolicy,
  approveMembershipPolicy,
  expireTransitionsPolicy,
  inviteMemberPolicy,
  joinEnvironmentPolicy,
  leaveEnvironmentPolicy,
  rejectMembershipPolicy,
  requestInformationPolicy,
  submitAnswersPolicy,
  withdrawInvitationPolicy,
} from "./policies";
import {
  answersOf,
  currentRequirements,
  findMembership,
  passivate,
  saveAnswers,
  settleMembership,
} from "./store";

const membershipOutput = z.strictObject({
  membershipId: z.uuid(),
  state: membershipStateSchema,
});

const answersInput = z.strictObject({
  ...requirementAnswersSchema.shape,
  ...environmentIdInput,
});

type Tx = Transaction<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

/**
 * PS-ENV-012: a winding-down environment takes no new members or
 * activations. Pending processes wait until it is final or cancelled.
 */
function assertAcceptsMembers(environment: EnvironmentRecord): void {
  if (!acceptsNewActivity(environment)) {
    conflict("The environment does not take new members");
  }
}

/** The caller's own membership, with any due passivation recorded. */
async function ownMembership(
  tx: Tx,
  membership: MembershipRecord | null,
  now: Date,
  events: EventRecorder,
): Promise<MembershipRecord> {
  if (!membership) {
    // The policy only lets callers with a membership through.
    throw new DomainError("not_found", "No membership");
  }

  return settleMembership(tx, membership, now, events);
}

/** Answers that cover exactly the environment's current requirements. */
async function checkedAnswers(
  tx: Tx,
  environment: EnvironmentRecord,
  answers: z.infer<typeof answersInput>["answers"],
) {
  return validateAnswers(
    await currentRequirements(tx, environment.id),
    answers,
  );
}

/**
 * Activation under the requirements that apply now (PS-ENV-005): the
 * membership records the revision it met.
 */
async function activate(
  tx: Tx,
  membership: MembershipRecord,
  environment: EnvironmentRecord,
  now: Date,
): Promise<void> {
  await tx
    .updateTable("app.environment_memberships")
    .set({
      state: "active",
      review_stage: null,
      activated_at: now,
      activation_revision: environment.requirementsRevision,
      passive_reason: null,
      passive_since: null,
      updated_at: now,
    })
    .where("id", "=", membership.id)
    .execute();
}

function eventPayload(membership: MembershipRecord) {
  return {
    environmentId: membership.environmentId,
    userId: membership.userId,
  };
}

/** A passive member who has asked to become active again. */
const isReactivationRequest = (membership: MembershipRecord) =>
  membership.state === "passive" && membership.reviewStage !== null;

/** An application awaiting the administrators' review. */
const isOpenApplication = (membership: MembershipRecord) =>
  membership.state === "pending" &&
  membership.origin === "application" &&
  membership.reviewStage !== "confirmation_required";

/** An application the applicant must confirm after closed → open. */
const awaitsConfirmation = (membership: MembershipRecord) =>
  membership.state === "pending" &&
  membership.reviewStage === "confirmation_required";

/** A member who did not accept a weaker type (PS-ENV-008). */
const declinedType = (membership: MembershipRecord) =>
  membership.state === "passive" &&
  membership.passiveReason === "type_change_not_accepted";

/**
 * Joining (PS-ENV-001): an open environment activates at once when the
 * current requirements are met; a closed one records an application for an
 * administrator. A hidden environment cannot be joined this way, and to
 * outsiders it does not exist. A passive member uses the same step to become
 * active again through the process that applies now: directly in an open
 * environment, after an administrator's approval otherwise. A member made
 * passive by a weaker type, and an applicant asked to confirm after
 * closed → open, join directly (PS-ENV-008).
 */
export const joinEnvironment = defineCommand({
  name: "environment_membership.join",
  input: answersInput,
  output: membershipOutput,
  policy: joinEnvironmentPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const environment = resource.environment;
    assertAcceptsMembers(environment);
    const existing = resource.ownMembership
      ? await settleMembership(tx, resource.ownMembership, now, events)
      : null;
    const answers = await checkedAnswers(tx, environment, input.answers);
    const isOpen = environment.type === "open";

    if (!existing) {
      if (environment.type === "hidden") {
        // Unreachable: the policy hides the environment from non-members.
        throw new DomainError("not_found", "Hidden environment");
      }

      const membership = await tx
        .insertInto("app.environment_memberships")
        .values({
          environment_id: environment.id,
          user_id: userIdOf(actor),
          ...(isOpen
            ? {
                state: "active",
                origin: "self_service",
                activated_at: now,
                activation_revision: environment.requirementsRevision,
              }
            : {
                state: "pending",
                origin: "application",
                review_stage: "submitted",
              }),
          created_at: now,
          updated_at: now,
        })
        .returning(["id", "environment_id", "user_id"])
        .executeTakeFirstOrThrow();
      const payload = {
        environmentId: membership.environment_id,
        userId: membership.user_id,
      };

      await saveAnswers(
        tx,
        { id: membership.id, environmentId: environment.id },
        answers,
        now,
      );

      if (isOpen) {
        events.record(membershipActivated, {
          resourceId: membership.id,
          payload: { ...payload, via: "self_service" },
        });
      } else {
        events.record(membershipReviewRequested, {
          resourceId: membership.id,
          payload: { ...payload, reactivation: false },
        });
      }

      return {
        membershipId: membership.id,
        state: isOpen ? "active" : "pending",
      };
    }

    const confirming = awaitsConfirmation(existing) && isOpen;

    if (
      !confirming &&
      (existing.state !== "passive" || existing.reviewStage !== null)
    ) {
      conflict("Already a member or awaiting a decision");
    }

    await saveAnswers(tx, existing, answers, now);

    // Joining is the member's explicit acceptance of the type that applies
    // now: an applicant confirming after closed → open, or a member who
    // earlier did not accept a weaker type (PS-ENV-008). Neither needs a new
    // review; the requirements that apply now are met with the answers.
    if (isOpen || confirming || declinedType(existing)) {
      await activate(tx, existing, environment, now);
      events.record(membershipActivated, {
        resourceId: existing.id,
        payload: {
          ...eventPayload(existing),
          via: confirming ? "self_service" : "reactivation",
        },
      });

      return { membershipId: existing.id, state: "active" as const };
    }

    await tx
      .updateTable("app.environment_memberships")
      .set({ review_stage: "submitted", updated_at: now })
      .where("id", "=", existing.id)
      .execute();
    events.record(membershipReviewRequested, {
      resourceId: existing.id,
      payload: { ...eventPayload(existing), reactivation: true },
    });

    return { membershipId: existing.id, state: "passive" as const };
  },
});

/**
 * New or updated answers to the current requirements: completing an
 * application after a request for information or changed requirements, or
 * meeting new requirements within the transition period (PS-ENV-006).
 */
export const submitAnswers = defineCommand({
  name: "environment_membership.submit_answers",
  input: answersInput,
  output: membershipOutput,
  policy: submitAnswersPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, input, resource, events, now }) => {
    const membership = await ownMembership(
      tx,
      resource.ownMembership,
      now,
      events,
    );
    const inReview =
      isOpenApplication(membership) || isReactivationRequest(membership);

    if (!inReview && membership.state !== "active") {
      conflict("Nothing to answer for this membership");
    }

    const answers = await checkedAnswers(
      tx,
      resource.environment,
      input.answers,
    );
    await saveAnswers(tx, membership, answers, now);

    if (inReview || membership.transitionDeadline !== null) {
      await tx
        .updateTable("app.environment_memberships")
        .set(
          inReview
            ? { review_stage: "submitted", updated_at: now }
            : { transition_deadline: null, updated_at: now },
        )
        .where("id", "=", membership.id)
        .execute();
    }

    events.record(
      inReview || membership.transitionDeadline === null
        ? membershipAnswersSubmitted
        : membershipTransitionCompleted,
      { resourceId: membership.id, payload: eventPayload(membership) },
    );

    return { membershipId: membership.id, state: membership.state };
  },
});

/**
 * An administrator's invitation is the approval (closed and hidden
 * environments); the invited user still sees and meets the requirements that
 * apply when accepting.
 */
export const acceptInvitation = defineCommand({
  name: "environment_membership.accept_invitation",
  input: answersInput,
  output: membershipOutput,
  policy: acceptInvitationPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, input, resource, events, now }) => {
    const membership = await ownMembership(
      tx,
      resource.ownMembership,
      now,
      events,
    );

    if (membership.state !== "pending" || membership.origin !== "invitation") {
      conflict("No pending invitation");
    }

    assertAcceptsMembers(resource.environment);
    const answers = await checkedAnswers(
      tx,
      resource.environment,
      input.answers,
    );
    await saveAnswers(tx, membership, answers, now);
    await activate(tx, membership, resource.environment, now);

    events.record(membershipActivated, {
      resourceId: membership.id,
      payload: { ...eventPayload(membership), via: "invitation" },
    });

    return { membershipId: membership.id, state: "active" as const };
  },
});

/**
 * Leaving, withdrawing an application or declining an invitation. An
 * administrator resigns first, and the owner hands over ownership or winds
 * the environment down (PS-ENV-003), so nobody leaves it without continuity.
 */
export const leaveEnvironment = defineCommand({
  name: "environment_membership.leave",
  input: z.strictObject(environmentIdInput),
  output: membershipOutput,
  policy: leaveEnvironmentPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, resource, events, now }) => {
    const membership = await ownMembership(
      tx,
      resource.ownMembership,
      now,
      events,
    );

    if (resource.viewer.roles.length > 0) {
      conflict("Hand over the environment role before leaving");
    }

    const reason =
      membership.state !== "pending"
        ? ("left" as const)
        : membership.origin === "invitation"
          ? ("invitation_declined" as const)
          : ("application_withdrawn" as const);

    await end(tx, membership, reason, now);
    events.record(membershipEnded, {
      resourceId: membership.id,
      payload: { ...eventPayload(membership), reason },
    });
    // A role invitation was for this membership; it does not wait for a
    // later one.
    await lapseInvitationsOf(
      tx,
      membership.environmentId,
      membership.userId,
      now,
      events,
    );

    return { membershipId: membership.id, state: "ended" as const };
  },
});

async function end(
  tx: Tx,
  membership: MembershipRecord,
  reason:
    | "left"
    | "application_withdrawn"
    | "application_rejected"
    | "invitation_declined"
    | "invitation_withdrawn",
  now: Date,
): Promise<void> {
  await tx
    .updateTable("app.environment_memberships")
    .set({
      state: "ended",
      end_reason: reason,
      ended_at: now,
      review_stage: null,
      transition_deadline: null,
      updated_at: now,
    })
    .where("id", "=", membership.id)
    .execute();
}

/**
 * PS-ENV-010: an account-bound invitation to an existing, registered user.
 * It belongs to the environment, not to the administrator who sent it.
 * Open environments need none: anyone may join.
 */
export const inviteMember = defineCommand({
  name: "environment_membership.invite",
  input: z.strictObject({ ...inviteMemberSchema.shape, ...environmentIdInput }),
  output: membershipOutput,
  policy: inviteMemberPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const environment = resource.environment;
    assertAcceptsMembers(environment);

    if (environment.type === "open") {
      conflict("Open environments take members without invitation");
    }

    const invitee = await tx
      .selectFrom("app.users as user")
      .leftJoin("app.environment_memberships as membership", (join) =>
        join
          .onRef("membership.user_id", "=", "user.id")
          .on("membership.environment_id", "=", environment.id)
          .on("membership.state", "<>", "ended"),
      )
      .leftJoin("app.environment_access_restrictions as restriction", (join) =>
        join
          .onRef("restriction.user_id", "=", "user.id")
          .on("restriction.environment_id", "=", environment.id)
          .on("restriction.lifted_at", "is", null),
      )
      .select([
        "user.status",
        "membership.id as membership_id",
        "restriction.id as restriction_id",
      ])
      .where("user.id", "=", input.userId)
      .executeTakeFirst();

    // Only registered accounts can be invited; anything else looks the same.
    if (!invitee || invitee.status !== "active") {
      throw new DomainError("not_found", "No such account");
    }

    if (invitee.membership_id !== null) {
      conflict("Already a member or invited");
    }

    if (invitee.restriction_id !== null) {
      conflict("The user is barred; lift the restriction first");
    }

    // An invitation is new contact between the two (PS-USR-006): a block in
    // either direction stops it, and looks like an account that does not
    // exist so it never reveals who blocked whom. The pair lock orders it
    // against a block being placed at the same time.
    const inviter = userIdOf(actor);
    await lockPair(tx, inviter, input.userId);
    if (
      (await socialRelationBetween(tx, inviter, input.userId)).blockedEitherWay
    ) {
      throw new DomainError("not_found", "No such account");
    }

    const membership = await tx
      .insertInto("app.environment_memberships")
      .values({
        environment_id: environment.id,
        user_id: input.userId,
        state: "pending",
        origin: "invitation",
        invited_by_user_id: inviter,
        created_at: now,
        updated_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    events.record(membershipInvited, {
      resourceId: membership.id,
      payload: { environmentId: environment.id, userId: input.userId },
    });

    return { membershipId: membership.id, state: "pending" as const };
  },
});

const decisionInput = z.strictObject({
  ...environmentIdInput,
  membershipId: z.uuid(),
});

/** The environment, the administrator, and the membership decided on. */
async function loadDecision<
  I extends { environmentId: string; membershipId: string },
>(args: { tx: Tx; actor: Actor; input: I; now: Date }) {
  const loaded = await loadLockedAccess(args);

  if (!loaded) {
    return null;
  }

  const target = await findMembership(
    args.tx,
    args.input.environmentId,
    args.input.membershipId,
  );

  return target && target.state !== "ended"
    ? {
        resource: { ...loaded.resource, target },
        context: undefined,
      }
    : null;
}

/**
 * Approving an application or a passive member's reactivation. Only possible
 * when the requirements that apply now are met (PS-ENV-005).
 */
export const approveMembership = defineCommand({
  name: "environment_membership.approve",
  input: decisionInput,
  output: membershipOutput,
  policy: approveMembershipPolicy,
  idempotency: "required",
  load: loadDecision,
  execute: async ({ tx, resource, events, now }) => {
    const environment = resource.environment;
    const membership = await settleMembership(tx, resource.target, now, events);
    const reactivation = isReactivationRequest(membership);

    if (!reactivation && !isOpenApplication(membership)) {
      conflict("Nothing to approve");
    }

    assertAcceptsMembers(environment);
    const answered = new Set(
      ((await answersOf(tx, [membership.id])).get(membership.id) ?? []).map(
        (answer) => answer.requirementId,
      ),
    );
    const requirements = await currentRequirements(tx, environment.id);

    if (unmetRequirements(membership, requirements, answered).length > 0) {
      conflict("The applicant has not met the current requirements");
    }

    await activate(tx, membership, environment, now);
    events.record(membershipActivated, {
      resourceId: membership.id,
      payload: {
        ...eventPayload(membership),
        via: reactivation ? "reactivation" : "approval",
      },
    });

    return { membershipId: membership.id, state: "active" as const };
  },
});

/**
 * Rejecting an application ends it; rejecting a reactivation leaves the
 * member passive. Either can also bar new attempts (PS-ENV-004).
 */
export const rejectMembership = defineCommand({
  name: "environment_membership.reject",
  input: z.strictObject({
    ...decisionInput.shape,
    ...membershipDecisionSchema.shape,
  }),
  output: membershipOutput,
  policy: rejectMembershipPolicy,
  idempotency: "required",
  load: loadDecision,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const membership = await settleMembership(tx, resource.target, now, events);
    const reactivation = isReactivationRequest(membership);
    const restricted = input.restrict === true;

    if (!reactivation && !isOpenApplication(membership)) {
      conflict("Nothing to reject");
    }

    if (reactivation) {
      await tx
        .updateTable("app.environment_memberships")
        .set({ review_stage: null, updated_at: now })
        .where("id", "=", membership.id)
        .execute();
    } else {
      await end(tx, membership, "application_rejected", now);
    }

    events.record(membershipRejected, {
      resourceId: membership.id,
      payload: { ...eventPayload(membership), reactivation, restricted },
    });

    if (restricted) {
      const imposed = await tx
        .insertInto("app.environment_access_restrictions")
        .values({
          environment_id: membership.environmentId,
          user_id: membership.userId,
          imposed_at: now,
          imposed_by_user_id: userIdOf(actor),
        })
        .onConflict((onConflict) =>
          onConflict
            .columns(["environment_id", "user_id"])
            .where("lifted_at", "is", null)
            .doNothing(),
        )
        .returning("id")
        .executeTakeFirst();

      if (imposed) {
        events.record(environmentRestrictionImposed, {
          resourceId: membership.environmentId,
          payload: { userId: membership.userId },
        });
      }
    }

    return {
      membershipId: membership.id,
      state: reactivation ? ("passive" as const) : ("ended" as const),
    };
  },
});

/**
 * Asks the applicant to add to or change the answers. The conversation itself
 * belongs to the case system (WP-45), not to private chat.
 */
export const requestInformation = defineCommand({
  name: "environment_membership.request_information",
  input: decisionInput,
  output: membershipOutput,
  policy: requestInformationPolicy,
  idempotency: "required",
  load: loadDecision,
  execute: async ({ tx, resource, events, now }) => {
    const membership = await settleMembership(tx, resource.target, now, events);

    if (membership.reviewStage !== "submitted") {
      conflict("Nothing awaits review");
    }

    await tx
      .updateTable("app.environment_memberships")
      .set({ review_stage: "information_requested", updated_at: now })
      .where("id", "=", membership.id)
      .execute();
    events.record(membershipInformationRequested, {
      resourceId: membership.id,
      payload: eventPayload(membership),
    });

    return { membershipId: membership.id, state: membership.state };
  },
});

/** Any administrator may withdraw a pending invitation (PS-ENV-010). */
export const withdrawInvitation = defineCommand({
  name: "environment_membership.withdraw_invitation",
  input: decisionInput,
  output: membershipOutput,
  policy: withdrawInvitationPolicy,
  idempotency: "required",
  load: loadDecision,
  execute: async ({ tx, resource, events, now }) => {
    const membership = resource.target;

    if (membership.state !== "pending" || membership.origin !== "invitation") {
      conflict("No pending invitation");
    }

    await end(tx, membership, "invitation_withdrawn", now);
    events.record(membershipEnded, {
      resourceId: membership.id,
      payload: { ...eventPayload(membership), reason: "invitation_withdrawn" },
    });

    return { membershipId: membership.id, state: "ended" as const };
  },
});

/** How many expired transitions one run records at most. */
const transitionBatchSize = 500;

/**
 * PS-ENV-006: members who did not meet new requirements by the deadline
 * become passive; they are not removed or barred. Safe to run repeatedly and
 * concurrently: rows another run holds are skipped.
 */
export const expireTransitions = defineCommand({
  name: "environment_membership.expire_transitions",
  input: z.strictObject({}),
  output: z.strictObject({ passivated: z.int().nonnegative() }),
  policy: expireTransitionsPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, events, now }) => {
    const due = await tx
      .selectFrom("app.environment_memberships")
      .select([
        "id",
        "environment_id",
        "user_id",
        "state",
        "origin",
        "review_stage",
        "activated_at",
        "activation_revision",
        "transition_deadline",
        "passive_reason",
      ])
      .where("state", "=", "active")
      .where("transition_deadline", "<=", now)
      .orderBy("transition_deadline")
      .limit(transitionBatchSize)
      .forUpdate()
      .skipLocked()
      .execute();

    await passivate(
      tx,
      due.map((row) => ({
        id: row.id,
        environmentId: row.environment_id,
        userId: row.user_id,
        state: "active",
        origin: row.origin as MembershipRecord["origin"],
        reviewStage: null,
        activatedAt: row.activated_at,
        activationRevision: row.activation_revision,
        transitionDeadline: row.transition_deadline,
        passiveReason: null,
        passiveSince: null,
      })),
      now,
      events,
    );

    return { passivated: due.length };
  },
});

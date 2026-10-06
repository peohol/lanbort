import {
  changeEnvironmentTypeSchema,
  environmentTypeSchema,
  typeChangeProcessSchema,
  typeChangeResponseSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import { z } from "zod";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { releaseRolesIn, tryLockEnvironment } from "./continuity-commands";
import {
  environmentIdInput,
  loadLockedAccess,
  userIdOf,
} from "./environment-commands";
import {
  environmentTypeChangeProposed,
  membershipEnded,
  membershipTypeChangeResponded,
} from "./events";
import { endMembership } from "./membership-commands";
import {
  acceptsNewActivity,
  daysAfter,
  type EnvironmentRecord,
  isTransitionExpired,
  type MembershipRecord,
} from "./model";
import {
  changeEnvironmentTypePolicy,
  concludeTypeChangesPolicy,
  respondToTypeChangePolicy,
  typeChangeProcess,
  withdrawTypeChangePolicy,
} from "./policies";
import { classifyTypeChange, typeChangeDays, votePasses } from "./privacy";
import { findEnvironment, lockMemberships, passivate } from "./store";
import {
  applyType,
  closeProposal,
  currentResponses,
  findOpenProposal,
  type TypeProposalRecord,
} from "./type-change-store";

/**
 * Changing an environment's type (WP-23, PS-ENV-007–010). Every command holds
 * the environment row's lock, so a type change never crosses a membership
 * change, and the database checks the type history at commit.
 */
type Tx = Transaction<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

const proposalOutput = z.strictObject({
  id: z.uuid(),
  process: typeChangeProcessSchema,
  deadline: z.iso.datetime(),
});

/**
 * An administrator changes the type. Stricter privacy applies at once,
 * without anyone's consent and without touching established memberships,
 * invitations or loans (PS-ENV-007). Weaker privacy is only proposed: the
 * members decide by the deadline (PS-ENV-008).
 */
export const changeEnvironmentType = defineCommand({
  name: "environment.change_type",
  input: z.strictObject({
    ...changeEnvironmentTypeSchema.shape,
    ...environmentIdInput,
  }),
  output: z.strictObject({
    type: environmentTypeSchema,
    proposal: proposalOutput.nullable(),
  }),
  policy: changeEnvironmentTypePolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const environment = resource.environment;

    if (environment.type !== input.expectedType) {
      conflict("The type has changed");
    }

    const change = classifyTypeChange(environment.type, input.type);

    if (change.kind === "stricter") {
      await applyType(tx, environment, input.type, null, now, events);
      return { type: input.type, proposal: null };
    }

    // Making an environment more visible is new activity (PS-ENV-012).
    if (!acceptsNewActivity(environment)) {
      conflict("The environment starts nothing new");
    }

    if (await findOpenProposal(tx, environment.id)) {
      conflict("A type change is already proposed");
    }

    const deadline = daysAfter(now, typeChangeDays[change.process]);
    const { id } = await tx
      .insertInto("app.environment_type_proposals")
      .values({
        environment_id: environment.id,
        from_type: environment.type,
        to_type: input.type,
        proposed_by_user_id: userIdOf(actor),
        proposed_at: now,
        deadline,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    events.record(environmentTypeChangeProposed, {
      resourceId: environment.id,
      payload: {
        proposalId: id,
        toType: input.type,
        process: change.process,
        deadline: deadline.toISOString(),
      },
    });

    return {
      type: environment.type,
      proposal: {
        id,
        process: change.process,
        deadline: deadline.toISOString(),
      },
    };
  },
});

const proposalInput = z.strictObject({
  ...environmentIdInput,
  proposalId: z.uuid(),
});

/** The open proposal the caller refers to, while it can still be answered. */
async function openProposal(
  tx: Tx,
  environmentId: string,
  proposalId: string,
  now: Date,
): Promise<TypeProposalRecord> {
  const proposal = await findOpenProposal(tx, environmentId);

  if (!proposal || proposal.id !== proposalId) {
    conflict("No such open proposal");
  }

  // At the deadline the outcome is fixed, even before the job records it.
  if (proposal.deadline.getTime() <= now.getTime()) {
    conflict("The deadline has passed");
  }

  return proposal;
}

/** Any administrator may withdraw a proposal; the type stays as it is. */
export const withdrawTypeChange = defineCommand({
  name: "environment.withdraw_type_change",
  input: proposalInput,
  output: z.strictObject({ withdrawn: z.literal(true) }),
  policy: withdrawTypeChangePolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const proposal = await openProposal(
      tx,
      resource.environment.id,
      input.proposalId,
      now,
    );

    await closeProposal(
      tx,
      proposal,
      "withdrawn",
      { closedByUserId: userIdOf(actor) },
      now,
      events,
    );

    return { withdrawn: true as const };
  },
});

/**
 * An active member's own consent (closed → open) or vote (hidden → closed).
 * The member may change the answer until the deadline; only the latest
 * counts. Nobody answers for anyone else.
 */
export const respondToTypeChange = defineCommand({
  name: "environment_membership.respond_to_type_change",
  input: z.strictObject({
    ...typeChangeResponseSchema.shape,
    ...environmentIdInput,
  }),
  output: z.strictObject({ proposalId: z.uuid(), support: z.boolean() }),
  policy: respondToTypeChangePolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, input, resource, events, now }) => {
    const proposal = await openProposal(
      tx,
      resource.environment.id,
      input.proposalId,
      now,
    );
    // The policy only lets active members through.
    const membership = resource.ownMembership;
    if (!membership) {
      throw new DomainError("not_found", "No membership");
    }

    const answer = { proposalId: proposal.id, support: input.support };
    if (
      (await currentResponses(tx, proposal.id)).get(membership.id) ===
      input.support
    ) {
      return answer;
    }

    await tx
      .updateTable("app.environment_type_responses")
      .set({ superseded_at: now })
      .where("proposal_id", "=", proposal.id)
      .where("membership_id", "=", membership.id)
      .where("superseded_at", "is", null)
      .execute();
    await tx
      .insertInto("app.environment_type_responses")
      .values({
        proposal_id: proposal.id,
        environment_id: proposal.environmentId,
        membership_id: membership.id,
        support: input.support,
        responded_at: now,
      })
      .execute();
    events.record(membershipTypeChangeResponded, {
      resourceId: membership.id,
      payload: {
        environmentId: membership.environmentId,
        userId: membership.userId,
        ...answer,
      },
    });

    return answer;
  },
});

type Conclusion = "adopted" | "rejected" | "lapsed";

/**
 * PS-ENV-008, hidden → closed: a member who did not accept is removed, under
 * the ordinary rules for leaving. Roles end first through the continuity
 * model (PS-ENV-013), since nobody handed them over; loans and history stay.
 */
async function removeMembers(
  tx: Tx,
  environment: EnvironmentRecord,
  memberships: readonly MembershipRecord[],
  now: Date,
  events: EventRecorder,
): Promise<void> {
  const reason = "type_change_not_accepted";

  for (const membership of memberships) {
    await releaseRolesIn(
      tx,
      environment,
      membership.userId,
      reason,
      { process: typeChangeProcess },
      now,
      events,
    );
  }

  for (const membership of memberships) {
    await endMembership(tx, membership, reason, now);
    events.record(membershipEnded, {
      resourceId: membership.id,
      payload: {
        environmentId: membership.environmentId,
        userId: membership.userId,
        reason,
      },
    });
  }
}

/**
 * A proposal at its deadline (PS-ENV-008). Only active members count, and
 * only an explicit «yes» is support. Closed → open is adopted, and every
 * member who did not accept becomes passive: the member keeps the membership
 * and the history, and can accept the new type later. Hidden → closed needs
 * 2/3 of all active members; if it passes, everyone who did not vote for it
 * is removed (OD-0012). Either happens just before the type changes. A
 * proposal for a type the environment no longer has, or for an environment
 * winding down, lapses.
 */
async function conclude(
  tx: Tx,
  proposal: TypeProposalRecord,
  now: Date,
  events: EventRecorder,
): Promise<Conclusion> {
  const environment = await findEnvironment(tx, proposal.environmentId);

  if (
    !environment ||
    !acceptsNewActivity(environment) ||
    environment.type !== proposal.fromType
  ) {
    await closeProposal(tx, proposal, "lapsed", {}, now, events);
    return "lapsed";
  }

  const active = await lockMemberships(tx, environment.id, "active");
  const expired = active.filter((membership) =>
    isTransitionExpired(membership, now),
  );
  await passivate(tx, expired, now, events);

  const eligible = active.filter((membership) => !expired.includes(membership));
  const responses = await currentResponses(tx, proposal.id);
  const supporters = eligible.filter(
    (membership) => responses.get(membership.id) === true,
  );
  const counts = { eligible: eligible.length, support: supporters.length };

  if (
    proposal.process === "vote" &&
    !votePasses(counts.support, counts.eligible)
  ) {
    await closeProposal(tx, proposal, "rejected", { counts }, now, events);
    return "rejected";
  }

  await closeProposal(tx, proposal, "adopted", { counts }, now, events);
  const declined = eligible.filter(
    (membership) => !supporters.includes(membership),
  );
  if (proposal.process === "vote") {
    await removeMembers(tx, environment, declined, now, events);
  } else {
    await passivate(tx, declined, now, events, "type_change_not_accepted");
  }
  await applyType(tx, environment, proposal.toType, proposal.id, now, events);

  return "adopted";
}

/** How many proposals one run decides at most. */
const typeChangeBatchSize = 100;

/**
 * The scheduled job that decides proposals whose deadline has passed. Safe to
 * run repeatedly and concurrently: environments another run or a command
 * holds are skipped, and everything is re-checked under the lock.
 */
export const concludeTypeChanges = defineCommand({
  name: "environment.conclude_type_changes",
  input: z.strictObject({}),
  output: z.strictObject({
    adopted: z.int().nonnegative(),
    rejected: z.int().nonnegative(),
    lapsed: z.int().nonnegative(),
  }),
  policy: concludeTypeChangesPolicy,
  idempotency: "none",
  load: async () => ({ resource: undefined, context: undefined }),
  execute: async ({ tx, events, now }) => {
    const result = { adopted: 0, rejected: 0, lapsed: 0 };
    const due = await tx
      .selectFrom("app.environment_type_proposals")
      .select("environment_id")
      .where("closed_at", "is", null)
      .where("deadline", "<=", now)
      .orderBy("deadline")
      .limit(typeChangeBatchSize)
      .execute();

    for (const { environment_id: environmentId } of due) {
      if (!(await tryLockEnvironment(tx, environmentId))) continue;

      const proposal = await findOpenProposal(tx, environmentId);
      if (!proposal || proposal.deadline.getTime() > now.getTime()) continue;

      result[await conclude(tx, proposal, now, events)] += 1;
    }

    return result;
  },
});

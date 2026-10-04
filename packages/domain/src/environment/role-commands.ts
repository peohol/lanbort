import {
  type EnvironmentRole,
  environmentRoleSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Transaction } from "kysely";
import { z } from "zod";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { lockPair, socialRelationBetween } from "../social/pair";
import {
  administrators,
  closeRoleInvitations,
  grantRole,
  type ChangedBy,
  lapseInvitationsOf,
  type RoleRevokeReason,
  pendingRoleInvitations,
  revokeRoles,
  findPendingRoleInvitation,
  withdrawClaims,
} from "./continuity-store";
import {
  environmentIdInput,
  loadLockedAccess,
  userIdOf,
} from "./environment-commands";
import { environmentRoleInvited } from "./events";
import { effectiveState } from "./model";
import {
  acceptRoleInvitationPolicy,
  declineRoleInvitationPolicy,
  inviteAdministratorPolicy,
  offerOwnershipPolicy,
  removeAdministratorPolicy,
  resignAdministratorPolicy,
  withdrawRoleInvitationPolicy,
} from "./policies";
import { findActiveRoles, findCurrentMembership } from "./store";
import { rateLimits } from "../abuse/rate-limits";

/**
 * Roles (WP-22, PS-ENV-003). Every command locks the environment row through
 * `loadLockedAccess`, so role changes of one environment never interleave:
 * a handover racing a removal, or two administrators resigning at once, are
 * decided one after the other on fresh state.
 */
type Tx = Transaction<Database>;

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

const targetUserInput = z.strictObject({
  ...environmentIdInput,
  userId: z.uuid(),
});

const invitationInput = z.strictObject({
  ...environmentIdInput,
  invitationId: z.uuid(),
});

const invitationOutput = z.strictObject({ invitationId: z.uuid() });

const rolesOutput = z.strictObject({ roles: z.array(environmentRoleSchema) });

/**
 * An invitation is new contact from one user to another (PS-USR-006): a
 * block in either direction stops it, and looks like an unknown member so it
 * never reveals who blocked whom. The pair lock orders it against a block
 * placed at the same time.
 */
async function assertNoBlock(tx: Tx, a: string, b: string): Promise<void> {
  await lockPair(tx, a, b);

  if ((await socialRelationBetween(tx, a, b)).blockedEitherWay) {
    throw new DomainError("not_found", "No such member");
  }
}

async function invite(
  tx: Tx,
  environmentId: string,
  inviter: string,
  invitee: string,
  role: EnvironmentRole,
  now: Date,
  events: EventRecorder,
) {
  await assertNoBlock(tx, inviter, invitee);

  if (
    (await pendingRoleInvitations(tx, environmentId, { role })).some(
      (invitation) => role === "owner" || invitation.userId === invitee,
    )
  ) {
    conflict("An invitation is already pending");
  }

  const { id } = await tx
    .insertInto("app.environment_role_invitations")
    .values({
      environment_id: environmentId,
      user_id: invitee,
      role,
      invited_by_user_id: inviter,
      created_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  events.record(environmentRoleInvited, {
    resourceId: environmentId,
    payload: { invitationId: id, userId: invitee, role },
  });

  return { invitationId: id };
}

/**
 * PS-ENV-003: an administrator invites an active member to administer. The
 * role becomes active only when the member accepts. Like membership
 * invitations, it belongs to the environment and stays valid if the sender
 * leaves.
 */
export const inviteAdministrator = defineCommand({
  name: "environment.invite_administrator",
  input: targetUserInput,
  output: invitationOutput,
  policy: inviteAdministratorPolicy,
  rateLimit: rateLimits.invitations,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const environmentId = resource.environment.id;
    const membership = await findCurrentMembership(
      tx,
      environmentId,
      input.userId,
    );

    if (!membership) {
      throw new DomainError("not_found", "No such member");
    }

    if (effectiveState(membership, now) !== "active") {
      conflict("Only active members can become administrators");
    }

    if (
      (await findActiveRoles(tx, environmentId, input.userId)).includes(
        "administrator",
      )
    ) {
      conflict("Already an administrator");
    }

    return invite(
      tx,
      environmentId,
      userIdOf(actor),
      input.userId,
      "administrator",
      now,
      events,
    );
  },
});

/**
 * Controlled handover (PS-ENV-003): the owner offers ownership to another
 * administrator, who becomes owner only by accepting. One offer at a time.
 */
export const offerOwnership = defineCommand({
  name: "environment.offer_ownership",
  input: targetUserInput,
  output: invitationOutput,
  policy: offerOwnershipPolicy,
  rateLimit: rateLimits.invitations,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const environmentId = resource.environment.id;
    const owner = userIdOf(actor);

    if (input.userId === owner) {
      conflict("Already the owner");
    }

    const candidate = (await administrators(tx, environmentId, now)).find(
      (administrator) => administrator.userId === input.userId,
    );

    if (!candidate) {
      throw new DomainError("not_found", "No such administrator");
    }

    if (!candidate.canAct) {
      conflict("The administrator's membership is not active");
    }

    return invite(tx, environmentId, owner, input.userId, "owner", now, events);
  },
});

/** The environment, the caller, and the pending invitation decided on. */
async function loadInvitation(args: {
  tx: Tx;
  actor: Actor;
  input: z.infer<typeof invitationInput>;
  now: Date;
}) {
  const loaded = await loadLockedAccess(args);

  if (!loaded) {
    return null;
  }

  const invitation = await findPendingRoleInvitation(
    args.tx,
    args.input.environmentId,
    args.input.invitationId,
  );

  return invitation
    ? { resource: { ...loaded.resource, invitation }, context: undefined }
    : null;
}

/**
 * Accepting makes the role active. Accepting ownership is the handover
 * itself: in one step the previous owner stops being owner (and stays
 * administrator) and the caller becomes owner.
 */
export const acceptRoleInvitation = defineCommand({
  name: "environment.accept_role_invitation",
  input: invitationInput,
  output: rolesOutput,
  policy: acceptRoleInvitationPolicy,
  idempotency: "required",
  load: loadInvitation,
  execute: async ({ tx, actor, resource, events, now }) => {
    const { environment, invitation, viewer } = resource;
    const userId = userIdOf(actor);

    if (viewer.membership?.state !== "active") {
      conflict("Only active members can take on a role");
    }

    if (invitation.role === "administrator") {
      await grantRole(
        tx,
        environment.id,
        userId,
        "administrator",
        { userId: invitation.invitedByUserId },
        now,
        events,
      );
    } else {
      const previous = invitation.invitedByUserId;
      const roles = await findActiveRoles(tx, environment.id, previous);

      // Handovers lapse whenever either side's role changes, so these only
      // guard against an invitation that should no longer exist.
      if (!roles.includes("owner") || !viewer.roles.includes("administrator")) {
        conflict("The handover is no longer valid");
      }

      await revokeRoles(
        tx,
        environment.id,
        previous,
        ["owner"],
        "transferred",
        { userId: previous },
        now,
        events,
      );
      await grantRole(
        tx,
        environment.id,
        userId,
        "owner",
        { userId: previous },
        now,
        events,
      );
    }

    await closeRoleInvitations(
      tx,
      [invitation],
      "accepted",
      userId,
      now,
      events,
    );

    return { roles: await findActiveRoles(tx, environment.id, userId) };
  },
});

export const declineRoleInvitation = defineCommand({
  name: "environment.decline_role_invitation",
  input: invitationInput,
  output: invitationOutput,
  policy: declineRoleInvitationPolicy,
  idempotency: "required",
  load: loadInvitation,
  execute: async ({ tx, actor, resource, events, now }) => {
    await closeRoleInvitations(
      tx,
      [resource.invitation],
      "declined",
      userIdOf(actor),
      now,
      events,
    );

    return { invitationId: resource.invitation.id };
  },
});

export const withdrawRoleInvitation = defineCommand({
  name: "environment.withdraw_role_invitation",
  input: invitationInput,
  output: invitationOutput,
  policy: withdrawRoleInvitationPolicy,
  idempotency: "required",
  load: loadInvitation,
  execute: async ({ tx, actor, resource, events, now }) => {
    await closeRoleInvitations(
      tx,
      [resource.invitation],
      "withdrawn",
      userIdOf(actor),
      now,
      events,
    );

    return { invitationId: resource.invitation.id };
  },
});

/**
 * Ends a user's administrator role and what depended on it: invitations to
 * the user (such as a pending handover) and a registered ownership claim.
 */
export async function endAdministration(
  tx: Tx,
  environmentId: string,
  userId: string,
  reason: RoleRevokeReason,
  by: ChangedBy,
  now: Date,
  events: EventRecorder,
): Promise<void> {
  await revokeRoles(
    tx,
    environmentId,
    userId,
    ["administrator"],
    reason,
    by,
    now,
    events,
  );
  await lapseInvitationsOf(tx, environmentId, userId, now, events);
  await withdrawClaims(tx, environmentId, userId, now, events);
}

/**
 * Only the owner removes another administrator; administrators cannot remove
 * each other (PS-ENV-003). The owner stays administrator while owner.
 */
export const removeAdministrator = defineCommand({
  name: "environment.remove_administrator",
  input: targetUserInput,
  output: rolesOutput,
  policy: removeAdministratorPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, input, resource, events, now }) => {
    const environmentId = resource.environment.id;
    const owner = userIdOf(actor);

    if (input.userId === owner) {
      conflict("The owner hands over ownership instead");
    }

    if (
      !(await findActiveRoles(tx, environmentId, input.userId)).includes(
        "administrator",
      )
    ) {
      throw new DomainError("not_found", "No such administrator");
    }

    await endAdministration(
      tx,
      environmentId,
      input.userId,
      "removed",
      { userId: owner },
      now,
      events,
    );

    return { roles: await findActiveRoles(tx, environmentId, input.userId) };
  },
});

/**
 * An administrator who is not owner may give up the role while another
 * administrator remains. The owner hands over or winds down first.
 */
export const resignAdministrator = defineCommand({
  name: "environment.resign_administrator",
  input: z.strictObject(environmentIdInput),
  output: rolesOutput,
  policy: resignAdministratorPolicy,
  idempotency: "required",
  load: loadLockedAccess,
  execute: async ({ tx, actor, resource, events, now }) => {
    const environmentId = resource.environment.id;
    const userId = userIdOf(actor);

    if (resource.viewer.roles.includes("owner")) {
      conflict("The owner hands over ownership or winds down first");
    }

    const others = (await administrators(tx, environmentId, now)).filter(
      (administrator) => administrator.userId !== userId,
    );

    if (others.length === 0) {
      conflict("The last administrator cannot resign");
    }

    await endAdministration(
      tx,
      environmentId,
      userId,
      "resigned",
      { userId },
      now,
      events,
    );

    return { roles: await findActiveRoles(tx, environmentId, userId) };
  },
});

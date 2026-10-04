import {
  type AccountDeletionCheck,
  accountInterventionSchema,
  type AccountLifecycleResult,
  accountLifecycleResultSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { z } from "zod";
import {
  type AccountStatus,
  type PlatformRole,
  systemActor,
  userScope,
} from "../actor";
import {
  type DomainContext,
  defineCommand,
  executeCommand,
} from "../commands/command";
import { defineQuery } from "../commands/query";
import { membershipEnded } from "../environment/events";
import { accountLifecycleProcess } from "../environment/policies";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { removeOwner } from "../objects/co-owners";
import {
  loadCommitments,
  type ObjectCommitmentSource,
  objectCommitmentSources,
} from "../objects/commitments";
import { deleteObject } from "../objects/deletion";
import { loadObjectState } from "../objects/state";
import { defineConsumer, OutboxDeliveryError } from "../outbox/consumer";
import { platformRoleRevoked } from "../platform/events";
import { reviewRightsStep } from "../reviews/account-deletion";
import { friendshipEndedByAccountDeletion } from "../social/events";
import { subscriptionsStep } from "../subscriptions/account-deletion";
import {
  type AccountBindingSource,
  accountBindingSources,
  loadBindings,
} from "./bindings";
import { accountDeleted } from "./events";
import {
  type AccountStatusChange,
  changeAccountStatus,
  loadAccountForChange,
  loadOwnAccountForChange,
} from "./lifecycle";
import {
  accountIdentityCleanupProcess,
  completeAccountClosurePolicy,
  deleteOwnAccountPolicy,
  readAccountDeletionCheckPolicy,
  releaseAccountIdentityPolicy,
} from "./policies";

type Db = Kysely<Database>;

/**
 * One part of what deleting an account removes or ends (PS-ADM-005–006).
 * Steps run in order in the deletion's transaction, after the account is
 * marked deleted. Later work packages add theirs here.
 */
export interface AccountDeletionStep {
  readonly name: string;
  run(db: Db, userId: string, now: Date, events: EventRecorder): Promise<void>;
}

function conflict(message: string): never {
  throw new DomainError("conflict", message);
}

/**
 * Objects: one the account owns alone is deleted with its content
 * (PS-OBJ-011); from a shared one the account leaves, and the other owners
 * keep it (PS-OBJ-008). Neither can carry a commitment of the account any
 * more, since its loans bind it; the check is repeated under the object's
 * lock anyway.
 */
function objectsStep(
  sources: readonly ObjectCommitmentSource[],
): AccountDeletionStep {
  return {
    name: "objects",
    run: async (db, userId, now, events) => {
      const owned = await db
        .selectFrom("app.object_owners")
        .select("object_id")
        .where("user_id", "=", userId)
        .orderBy("object_id")
        .execute();

      for (const { object_id: objectId } of owned) {
        const object = await loadObjectState(db, objectId, { lock: true });

        if (!object) {
          continue;
        }

        const commitments = await loadCommitments(db, objectId, sources);
        const alone = object.ownerIds.length === 1;

        if (
          alone
            ? commitments.length > 0
            : commitments.some((c) => c.responsibleOwnerId === userId)
        ) {
          conflict("An object still has a commitment of the account");
        }

        if (alone) {
          await deleteObject(db, object, events, now);
        } else {
          await removeOwner(db, object, userId, events, now);
        }
      }
    },
  };
}

/** Memberships end, and the answers given to join are removed. */
const membershipsStep: AccountDeletionStep = {
  name: "environment_memberships",
  run: async (db, userId, now, events) => {
    const ended = await db
      .updateTable("app.environment_memberships")
      .set({
        state: "ended",
        end_reason: "account_deleted",
        ended_at: now,
        review_stage: null,
        transition_deadline: null,
        updated_at: now,
      })
      .where("user_id", "=", userId)
      .where("state", "<>", "ended")
      .returning(["id", "environment_id"])
      .execute();

    await db
      .deleteFrom("app.environment_membership_answers")
      .where("membership_id", "in", (eb) =>
        eb
          .selectFrom("app.environment_memberships")
          .select("id")
          .where("user_id", "=", userId),
      )
      .execute();

    for (const membership of ended) {
      events.record(membershipEnded, {
        resourceId: membership.id,
        payload: {
          environmentId: membership.environment_id,
          userId,
          reason: "account_deleted",
        },
      });
    }
  },
};

/** Friendships and open friend requests end; blocks stay (PS-USR-006). */
const friendshipsStep: AccountDeletionStep = {
  name: "friendships",
  run: async (db, userId, now, events) => {
    const ended = await db
      .updateTable("app.friendships")
      .set({
        status: "ended",
        ended_at: now,
        ended_by_user_id: userId,
        end_reason: "account_deleted",
      })
      .where((eb) =>
        eb.or([
          eb("requester_id", "=", userId),
          eb("addressee_id", "=", userId),
        ]),
      )
      .where("status", "<>", "ended")
      .returning("id")
      .execute();

    for (const { id } of ended) {
      events.record(friendshipEndedByAccountDeletion, {
        resourceId: id,
        payload: {},
      });
    }
  },
};

/** Pending co-ownership invitations to or from the account lapse. */
const coOwnerInvitationsStep: AccountDeletionStep = {
  name: "object_co_owner_invitations",
  run: async (db, userId, now) => {
    await db
      .updateTable("app.object_co_owner_invitations")
      .set({ status: "closed", ended_at: now })
      .where("status", "=", "pending")
      .where((eb) =>
        eb.or([
          eb("invited_user_id", "=", userId),
          eb("invited_by_user_id", "=", userId),
        ]),
      )
      .execute();
  },
};

/** Global roles end with the account (PS-USR-008). */
const platformRolesStep: AccountDeletionStep = {
  name: "platform_roles",
  run: async (db, userId, now, events) => {
    const revoked = await db
      .updateTable("app.platform_role_grants")
      .set({
        revoked_at: now,
        revoked_by_process: accountLifecycleProcess,
        revoke_reason: "account_deleted",
      })
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .returning("role")
      .execute();

    for (const { role } of revoked) {
      events.record(platformRoleRevoked, {
        resourceId: userId,
        payload: { role: role as PlatformRole },
      });
    }
  },
};

/**
 * PS-ADM-006: the profile, verified contact addresses, stored command
 * results, and the account's own notifications, their waiting e-mails and its
 * preferences go. What remains of the account is its internal id, its state and
 * the records of its changes, so shared history (loans, requests, events)
 * keeps its references but shows no name. How long the remaining history is
 * kept is not decided (OD-0002), so nothing here removes it.
 */
const personalDataStep: AccountDeletionStep = {
  name: "personal_data",
  run: async (db, userId) => {
    await db.deleteFrom("app.profiles").where("user_id", "=", userId).execute();
    await db
      .deleteFrom("app.verified_contacts")
      .where("user_id", "=", userId)
      .execute();
    await db
      .deleteFrom("app.idempotency_records")
      .where("scope", "=", userScope(userId))
      .execute();
    // E-mails still waiting go with their notifications, so nothing is sent
    // afterwards (WP-41). A send under way holds its delivery; this waits
    // for it, and a send that has not started finds nothing to send.
    await db
      .deleteFrom("app.notification_deliveries")
      .where("notification_id", "in", (eb) =>
        eb
          .selectFrom("app.notifications")
          .select("id")
          .where("recipient_id", "=", userId),
      )
      .execute();
    await db
      .deleteFrom("app.notifications")
      .where("recipient_id", "=", userId)
      .execute();
    await db
      .deleteFrom("app.notification_preferences")
      .where("user_id", "=", userId)
      .execute();
  },
};

/** What deleting an account does, in order. */
export const accountDeletionSteps: readonly AccountDeletionStep[] = [
  objectsStep(objectCommitmentSources),
  membershipsStep,
  friendshipsStep,
  coOwnerInvitationsStep,
  platformRolesStep,
  reviewRightsStep,
  subscriptionsStep,
  personalDataStep,
];

/**
 * PS-ADM-004–006: deletes the locked account when nothing binds it any
 * more. It is marked deleted first (which stops new activity and releases
 * its environment roles, as any departure does), then every step runs. The
 * sign-in identity is removed after commit ({@link accountIdentityRemoval}).
 */
async function deleteAccount(
  db: Db,
  change: Omit<AccountStatusChange, "to">,
  steps: readonly AccountDeletionStep[],
  sources: readonly AccountBindingSource[],
  events: EventRecorder,
  now: Date,
): Promise<AccountLifecycleResult> {
  if ((await loadBindings(db, change.account.userId, sources)).length > 0) {
    conflict("The account still has bindings");
  }

  const result = await changeAccountStatus(
    db,
    { ...change, to: "deleted" },
    events,
    now,
  );

  for (const step of steps) {
    await step.run(db, change.account.userId, now, events);
  }

  return result;
}

export function defineAccountDeletion(
  steps: readonly AccountDeletionStep[],
  sources: readonly AccountBindingSource[],
) {
  return {
    /**
     * The user deletes their own account. Not idempotent: a deleted account
     * is signed out and can never repeat a request, and no stored result
     * should outlive it.
     */
    deleteOwnAccount: defineCommand({
      name: "account.delete",
      input: z.strictObject({}),
      output: accountLifecycleResultSchema,
      policy: deleteOwnAccountPolicy,
      idempotency: "none",
      actorAccount: "change",
      load: loadOwnAccountForChange,
      execute: ({ tx, actor, resource, events, now }) =>
        deleteAccount(
          tx,
          { account: resource, reason: "user_request", actor },
          steps,
          sources,
          events,
          now,
        ),
    }),

    /** A steward completes a controlled closure (PS-ADM-014). */
    completeAccountClosure: defineCommand({
      name: "account.complete_closure",
      input: accountInterventionSchema,
      output: accountLifecycleResultSchema,
      policy: completeAccountClosurePolicy,
      idempotency: "required",
      load: ({ tx, input }) => loadAccountForChange(tx, input.userId),
      execute: ({ tx, actor, input, resource, events, now }) =>
        deleteAccount(
          tx,
          {
            account: resource,
            reason: "platform",
            actor,
            basis: input.basis,
          },
          steps,
          sources,
          events,
          now,
        ),
    }),

    /** PS-ADM-004: what the user must finish before deleting the account. */
    getAccountDeletionCheck: defineQuery({
      name: "account.deletion_check",
      input: z.strictObject({}),
      policy: readAccountDeletionCheckPolicy,
      load: async ({ db, actor }) => {
        if (actor.kind !== "user") {
          return null;
        }

        const user = await db
          .selectFrom("app.users")
          .select(["id", "status"])
          .where("id", "=", actor.userId)
          .executeTakeFirst();

        return user
          ? {
              resource: {
                userId: user.id,
                status: user.status as AccountStatus,
                bindings: await loadBindings(db, user.id, sources),
              },
              context: undefined,
            }
          : null;
      },
      present: ({ resource }): AccountDeletionCheck => ({
        bindings: resource.bindings,
      }),
    }),
  };
}

export const {
  deleteOwnAccount,
  completeAccountClosure,
  getAccountDeletionCheck,
} = defineAccountDeletion(accountDeletionSteps, accountBindingSources);

/**
 * Removes the link between a deleted account and its sign-in identity, once
 * the identity is removed at the provider. Repeating it changes nothing.
 */
export const releaseAccountIdentity = defineCommand({
  name: "account.release_identity",
  input: z.strictObject({ userId: z.uuid() }),
  output: z.strictObject({ released: z.int().nonnegative() }),
  policy: releaseAccountIdentityPolicy,
  idempotency: "none",
  load: ({ tx, input }) => loadAccountForChange(tx, input.userId),
  execute: async ({ tx, resource }) => {
    const released = await tx
      .deleteFrom("app.auth_identities")
      .where("user_id", "=", resource.userId)
      .executeTakeFirst();

    return { released: Number(released.numDeletedRows) };
  },
});

/**
 * The auth provider's side of deleting an account (ADR-0007: the adapter
 * lives in `@lanbort/auth`). Removing an identity the provider no longer
 * has succeeds.
 */
export interface IdentityProviderAdmin {
  deleteIdentity(subject: string): Promise<void>;
}

export interface AccountIdentityRemovalOptions {
  /** Undefined where no provider key is configured; delivery is retried. */
  readonly identities: () => IdentityProviderAdmin | undefined;
  readonly domain: () => DomainContext;
}

/**
 * PS-ADM-006 after commit (outbox, at-least-once): removes the deleted
 * account's identities at the provider, which ends its sessions there, and
 * only then the links to them. Until the link is gone, signing in with the
 * identity finds the deleted account, which is never returned to anybody;
 * afterwards the same address could register a new, empty account.
 */
export function accountIdentityRemoval({
  identities,
  domain,
}: AccountIdentityRemovalOptions) {
  return defineConsumer({
    name: "account.remove_identity",
    eventTypes: [accountDeleted.type],
    handle: async ({ event }) => {
      const provider = identities();

      if (!provider) {
        throw new OutboxDeliveryError("identity_provider_unavailable");
      }

      const context = domain();
      const links = await context.db
        .selectFrom("app.auth_identities")
        .select("subject")
        .where("user_id", "=", event.resourceId)
        .execute();

      for (const { subject } of links) {
        await provider.deleteIdentity(subject);
      }

      await executeCommand(context, releaseAccountIdentity, {
        actor: systemActor(accountIdentityCleanupProcess),
        input: { userId: event.resourceId },
      });
    },
  });
}

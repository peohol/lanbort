import type { AccountStatusReason } from "@lanbort/contracts";
import type { AccountStatus } from "../actor";
import {
  type ActorRule,
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireMinimumAccess,
  requireNotInvolved,
  requireRecentAuthentication,
  requireSystemProcess,
  requireUser,
} from "../authorization/rules";
import { platformStewardAccess } from "../platform/policies";
import { statesBefore } from "./model";

export interface AccountResource {
  readonly userId: string;
  readonly status: AccountStatus;
}

/** Another account looks exactly like one that does not exist. */
const isOwnAccount: ResourceRule<AccountResource, void> = ({
  actor,
  resource,
}) =>
  actor.kind === "user" && actor.userId === resource.userId
    ? allow
    : deny("not_found");

/** Pending accounts may read their own status to continue registration. */
export const readOwnAccount = definePolicy<AccountResource, void>({
  action: "account.read",
  actor: [requireUser],
  resource: [isOwnAccount],
});

export const completeRegistrationPolicy = definePolicy<AccountResource, void>({
  action: "account.complete_registration",
  actor: [requireUser],
  resource: [
    isOwnAccount,
    ({ resource }) =>
      resource.status === "pending_registration" ? allow : deny("forbidden"),
  ],
});

/**
 * Proving the identity again with a new e-mail code, before a sensitive
 * action. The code always goes to the account's own verified address.
 */
export const reauthenticatePolicy = definePolicy({
  action: "account.reauthenticate",
  actor: [requireUser],
});

/** Puts accounts to rest after long inactivity (PS-ADM-001). */
export const accountInactivityProcess = "account.inactivity";

/**
 * Removes a deleted account's sign-in identity at the auth provider, then
 * the link to it (PS-ADM-006).
 */
export const accountIdentityCleanupProcess = "account.identity_cleanup";

/**
 * The account, as locked by the command, is in a state that `reason` may
 * move into `to` (`account/model.ts`). The command checks the same table
 * again when it records the change.
 */
function canMove(
  to: AccountStatus,
  reason: AccountStatusReason,
): ResourceRule<AccountResource, void> {
  const from = statesBefore(to, reason);

  return ({ resource }) =>
    from.includes(resource.status) ? allow : deny("forbidden");
}

/** The user's own change of their account's state. */
function ownChangePolicy(
  action: string,
  to: AccountStatus,
  ...actor: readonly ActorRule[]
) {
  return definePolicy<AccountResource, void>({
    action,
    actor,
    resource: [isOwnAccount, canMove(to, "user_request")],
  });
}

/** PS-ADM-001–002: the user stops new activity on their own account. */
export const deactivateAccountPolicy = ownChangePolicy(
  "account.deactivate",
  "deactivated",
  requireActiveAccount,
);

/** The user takes a deactivated or dormant account into use again. */
export const reactivateAccountPolicy = ownChangePolicy(
  "account.reactivate",
  "active",
  requireMinimumAccess,
);

/**
 * PS-ADM-004–006: the user deletes their own account, with their identity
 * proven again just before (docs/architecture/08). Not while suspended or
 * closing: a platform intervention decides those.
 */
export const deleteOwnAccountPolicy = ownChangePolicy(
  "account.delete",
  "deleted",
  requireMinimumAccess,
  requireRecentAuthentication(),
);

/** PS-ADM-004: what still binds the user's own account. */
export const readAccountDeletionCheckPolicy = definePolicy<
  AccountResource,
  void
>({
  action: "account.deletion_check",
  actor: [requireMinimumAccess],
  resource: [isOwnAccount],
});

/** Long inactivity puts an active account to rest. */
export const makeAccountDormantPolicy = definePolicy<AccountResource, void>({
  action: "account.make_dormant",
  actor: [requireSystemProcess(accountInactivityProcess)],
  resource: [canMove("dormant", "inactivity")],
});

/** Only a deleted account's identity link is removed. */
export const releaseAccountIdentityPolicy = definePolicy<AccountResource, void>(
  {
    action: "account.release_identity",
    actor: [requireSystemProcess(accountIdentityCleanupProcess)],
    resource: [
      ({ resource }) =>
        resource.status === "deleted" ? allow : deny("forbidden"),
    ],
  },
);

/**
 * PS-ADM-003, PS-ADM-014: a platform steward's intervention on someone
 * else's account, recorded with its basis. Closed until stronger
 * authentication is decided (OD-0010, `platformStewardAccess`).
 */
function interventionPolicy(action: string, to: AccountStatus) {
  return definePolicy<AccountResource, void>({
    action,
    actor: [...platformStewardAccess],
    resource: [
      requireNotInvolved(({ resource }) => [resource.userId]),
      canMove(to, "platform"),
    ],
  });
}

export const suspendAccountPolicy = interventionPolicy(
  "account.suspend",
  "suspended",
);

/** Ends a suspension or a closure that is not completed. */
export const reinstateAccountPolicy = interventionPolicy(
  "account.reinstate",
  "active",
);

export const startAccountClosurePolicy = interventionPolicy(
  "account.start_closure",
  "closing",
);

/** Deletes an account under closure once nothing binds it any more. */
export const completeAccountClosurePolicy = interventionPolicy(
  "account.complete_closure",
  "deleted",
);

export const accountPolicies = [
  readOwnAccount,
  completeRegistrationPolicy,
  reauthenticatePolicy,
  deactivateAccountPolicy,
  reactivateAccountPolicy,
  deleteOwnAccountPolicy,
  readAccountDeletionCheckPolicy,
  makeAccountDormantPolicy,
  releaseAccountIdentityPolicy,
  suspendAccountPolicy,
  reinstateAccountPolicy,
  startAccountClosurePolicy,
  completeAccountClosurePolicy,
];

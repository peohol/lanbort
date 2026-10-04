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
import { statesBefore, takesNewActivity } from "./model";

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

/**
 * PS-ADM-009: the two accounts a duplicate retirement decides on, as the
 * command locked them.
 */
export interface DuplicateRetirementResource {
  readonly retired: AccountResource;
  readonly continued: AccountResource;
}

/**
 * The states a duplicate is retired from: those a controlled closure starts
 * from, and a closure already under way. Never a suspension: a second
 * account beside a suspended one is a way around the suspension, not a
 * duplicate (vision 08, «Duplikatkonto med historikk på begge kontoer»).
 */
const retirableStates: readonly AccountStatus[] = [
  ...statesBefore("closing", "platform").filter(
    (status) => status !== "suspended",
  ),
  "closing",
];

/**
 * PS-ADM-009, PS-ADM-014: a steward who has verified that two accounts
 * belong to the same person retires one of them; the other, which is
 * active, continues. Closed until OD-0010, like every intervention.
 */
export const retireDuplicateAccountPolicy = definePolicy<
  DuplicateRetirementResource,
  void
>({
  action: "account.retire_duplicate",
  actor: [...platformStewardAccess],
  resource: [
    requireNotInvolved(({ resource }) => [
      resource.retired.userId,
      resource.continued.userId,
    ]),
    ({ resource }) =>
      retirableStates.includes(resource.retired.status) &&
      takesNewActivity(resource.continued.status)
        ? allow
        : deny("forbidden"),
  ],
});

/** Accounts a steward links or reads about, with everyone they involve. */
export interface AccountRecordResource {
  readonly userId: string;
  readonly status: AccountStatus;
  /** The accounts the action concerns, the target included. */
  readonly involvedUserIds: readonly string[];
}

const notInvolvedInRecord = requireNotInvolved<AccountRecordResource, void>(
  ({ resource }) => resource.involvedUserIds,
);

/**
 * PS-ADM-010: a steward links two accounts of the same person, for security
 * work only.
 */
export const linkSamePersonPolicy = definePolicy<AccountRecordResource, void>({
  action: "account.link_same_person",
  actor: [...platformStewardAccess],
  resource: [notInvolvedInRecord],
});

/**
 * PS-ADM-010: a steward records that an account was created or used under
 * a false identity. An account that never completed registration has
 * claimed no identity.
 */
export const recordFalseIdentityPolicy = definePolicy<
  AccountRecordResource,
  void
>({
  action: "account.record_false_identity",
  actor: [...platformStewardAccess],
  resource: [
    notInvolvedInRecord,
    ({ resource }) =>
      resource.status === "pending_registration" ? deny("forbidden") : allow,
  ],
});

/** What the platform holds about an account's identity, for a steward. */
export const readAccountIdentityRecordPolicy = definePolicy<
  AccountRecordResource,
  void
>({
  action: "account.read_identity_record",
  actor: [...platformStewardAccess],
  resource: [notInvolvedInRecord],
});

/**
 * PS-ADM-009: an object and the duplicate link of the owner retired as a
 * duplicate, with both accounts' states as locked by the command.
 */
export interface DuplicateObjectResource {
  readonly objectId: string;
  readonly ownerIds: readonly string[];
  readonly link: {
    readonly id: string;
    readonly retired: AccountResource;
    readonly continued: AccountResource;
  } | null;
}

/**
 * PS-ADM-009: a steward moves an object of a duplicate under closure to the
 * account that continues. Only one the duplicate owns alone (or with the
 * continuing account): other owners decide themselves who joins them.
 */
export const moveDuplicateObjectPolicy = definePolicy<
  DuplicateObjectResource,
  void
>({
  action: "account.move_duplicate_object",
  actor: [...platformStewardAccess],
  resource: [
    requireNotInvolved(({ resource }) => [
      ...resource.ownerIds,
      ...(resource.link ? [resource.link.continued.userId] : []),
    ]),
    ({ resource: { link, ownerIds } }) =>
      link !== null &&
      link.retired.status === "closing" &&
      takesNewActivity(link.continued.status) &&
      ownerIds.every(
        (id) => id === link.retired.userId || id === link.continued.userId,
      )
        ? allow
        : deny("forbidden"),
  ],
});

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
  retireDuplicateAccountPolicy,
  linkSamePersonPolicy,
  recordFalseIdentityPolicy,
  readAccountIdentityRecordPolicy,
  moveDuplicateObjectPolicy,
];

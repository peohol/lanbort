import { type AccountStatus, anonymousActor, systemActor } from "../actor";
import { policyMatrix } from "../authorization/policy-matrix";
import { testUserActor } from "../testing/actors";
import {
  accountIdentityCleanupProcess,
  accountInactivityProcess,
  completeAccountClosurePolicy,
  completeRegistrationPolicy,
  deactivateAccountPolicy,
  linkSamePersonPolicy,
  moveDuplicateObjectPolicy,
  readAccountIdentityRecordPolicy,
  recordFalseIdentityPolicy,
  retireDuplicateAccountPolicy,
  deleteOwnAccountPolicy,
  makeAccountDormantPolicy,
  reactivateAccountPolicy,
  readAccountDeletionCheckPolicy,
  readOwnAccount,
  reauthenticatePolicy,
  reinstateAccountPolicy,
  releaseAccountIdentityPolicy,
  startAccountClosurePolicy,
  suspendAccountPolicy,
} from "./policies";

const pending = testUserActor({ accountStatus: "pending_registration" });
const active = testUserActor();
const other = testUserActor();

// Signed in an hour ago: too long ago for sensitive actions.
const stale = testUserActor({
  authentication: {
    sessionId: "session",
    assurance: "aal1",
    methods: [{ method: "otp", at: new Date(Date.now() - 3_600_000) }],
  },
});

const own = (actor: typeof pending, status = actor.accountStatus) => ({
  userId: actor.userId,
  status,
});

const withStatus = (accountStatus: AccountStatus) =>
  testUserActor({ accountStatus });
const deactivated = withStatus("deactivated");
const dormant = withStatus("dormant");
const suspended = withStatus("suspended");
const closing = withStatus("closing");

const account = (status: AccountStatus) => ({
  userId: testUserActor().userId,
  status,
});

// Holds the role in a session with stronger authentication. The mechanism
// is open (OD-0010), so no real session gets here yet.
const steward = testUserActor({
  platformRoles: ["platform_steward"],
  authentication: {
    sessionId: "steward-session",
    assurance: "aal2",
    methods: [{ method: "otp", at: new Date() }],
  },
});
const stewardWithoutStrongAuth = testUserActor({
  platformRoles: ["platform_steward"],
});

/** The cases every steward intervention shares, for a target in `from`. */
function interventionCases(from: AccountStatus, refused: AccountStatus) {
  return [
    {
      name: `steward intervenes on an account that is ${from}`,
      actor: steward,
      resource: account(from),
      context: undefined,
      expected: "allow" as const,
    },
    {
      name: `not on an account that is ${refused}`,
      actor: steward,
      resource: account(refused),
      context: undefined,
      expected: "forbidden" as const,
    },
    {
      name: "never on the steward's own account",
      actor: steward,
      resource: own(steward, from),
      context: undefined,
      expected: "conflict_of_interest" as const,
    },
    {
      name: "not without stronger authentication",
      actor: stewardWithoutStrongAuth,
      resource: account(from),
      context: undefined,
      expected: "stronger_authentication_required" as const,
    },
    {
      name: "an ordinary user cannot intervene",
      actor: active,
      resource: account(from),
      context: undefined,
      expected: "forbidden" as const,
    },
    {
      name: "a suspended steward cannot intervene",
      actor: testUserActor({
        ...steward,
        userId: testUserActor().userId,
        accountStatus: "suspended",
      }),
      resource: account(from),
      context: undefined,
      expected: "account_inactive" as const,
    },
  ];
}

/** The cases every steward record shares (PS-USR-009, OD-0010). */
function stewardCases<R>(
  resource: R,
  ownResource: R,
): {
  name: string;
  actor: typeof steward;
  resource: R;
  context: undefined;
  expected:
    "conflict_of_interest" | "stronger_authentication_required" | "forbidden";
}[] {
  return [
    {
      name: "never where the steward's own account is concerned",
      actor: steward,
      resource: ownResource,
      context: undefined,
      expected: "conflict_of_interest",
    },
    {
      name: "not without stronger authentication",
      actor: stewardWithoutStrongAuth,
      resource,
      context: undefined,
      expected: "stronger_authentication_required",
    },
    {
      name: "an ordinary user cannot",
      actor: active,
      resource,
      context: undefined,
      expected: "forbidden",
    },
  ];
}

const pair = (retired: AccountStatus, continued: AccountStatus) => ({
  retired: account(retired),
  continued: account(continued),
});

const record = (status: AccountStatus = "active", ...others: string[]) => {
  const target = account(status);

  return {
    ...target,
    involvedUserIds: [target.userId, ...others],
  };
};

const duplicateObject = (
  retiredStatus: AccountStatus,
  continuedStatus: AccountStatus,
  extraOwners: readonly string[] = [],
) => {
  const retired = account(retiredStatus);

  return {
    objectId: testUserActor().userId,
    ownerIds: [retired.userId, ...extraOwners],
    link: {
      id: testUserActor().userId,
      retired,
      continued: account(continuedStatus),
    },
  };
};

export const accountMatrices = [
  policyMatrix(readOwnAccount, [
    {
      name: "pending user reads own account to continue registration",
      actor: pending,
      resource: own(pending),
      context: undefined,
      expected: "allow",
    },
    {
      name: "active user reads own account",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "allow",
    },
    {
      name: "another user's account is indistinguishable from a missing one",
      actor: other,
      resource: own(active),
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: own(active),
      context: undefined,
      expected: "unauthenticated",
    },
    {
      name: "system processes have no own account",
      actor: systemActor("outbox.worker"),
      resource: own(active),
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
  policyMatrix(completeRegistrationPolicy, [
    {
      name: "pending user completes own registration",
      actor: pending,
      resource: own(pending),
      context: undefined,
      expected: "allow",
    },
    {
      name: "registration cannot be completed twice",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "cannot complete someone else's registration",
      actor: other,
      resource: own(pending),
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: own(pending),
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
  policyMatrix(deactivateAccountPolicy, [
    {
      name: "active user stops new activity on their account",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "allow",
    },
    {
      name: "an account deactivated meanwhile is not deactivated again",
      actor: active,
      resource: own(active, "deactivated"),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "a deactivated account has nothing new to stop",
      actor: deactivated,
      resource: own(deactivated),
      context: undefined,
      expected: "account_inactive",
    },
    {
      name: "pending user finishes registration first",
      actor: pending,
      resource: own(pending),
      context: undefined,
      expected: "registration_required",
    },
    {
      name: "cannot deactivate someone else's account",
      actor: other,
      resource: own(active),
      context: undefined,
      expected: "not_found",
    },
  ]),
  policyMatrix(reactivateAccountPolicy, [
    {
      name: "deactivated user takes the account into use again",
      actor: deactivated,
      resource: own(deactivated),
      context: undefined,
      expected: "allow",
    },
    {
      name: "dormant user takes the account into use again",
      actor: dormant,
      resource: own(dormant),
      context: undefined,
      expected: "allow",
    },
    {
      name: "a suspension is ended by a steward, not the user",
      actor: suspended,
      resource: own(suspended),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "a closing account is not reopened by the user",
      actor: closing,
      resource: own(closing),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "an active account is already active",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "cannot reactivate someone else's account",
      actor: other,
      resource: own(deactivated),
      context: undefined,
      expected: "not_found",
    },
  ]),
  policyMatrix(deleteOwnAccountPolicy, [
    {
      name: "active user deletes their account after proving identity",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "allow",
    },
    {
      name: "deactivated user deletes their account",
      actor: deactivated,
      resource: own(deactivated),
      context: undefined,
      expected: "allow",
    },
    {
      name: "dormant user deletes their account",
      actor: dormant,
      resource: own(dormant),
      context: undefined,
      expected: "allow",
    },
    {
      name: "identity must be proven again just before",
      actor: stale,
      resource: own(stale),
      context: undefined,
      expected: "reauthentication_required",
    },
    {
      name: "not while suspended",
      actor: suspended,
      resource: own(suspended),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "not while the platform closes the account",
      actor: closing,
      resource: own(closing),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "pending user finishes registration first",
      actor: pending,
      resource: own(pending),
      context: undefined,
      expected: "registration_required",
    },
    {
      name: "cannot delete someone else's account",
      actor: other,
      resource: own(active),
      context: undefined,
      expected: "not_found",
    },
  ]),
  policyMatrix(readAccountDeletionCheckPolicy, [
    {
      name: "active user sees what binds their account",
      actor: active,
      resource: own(active),
      context: undefined,
      expected: "allow",
    },
    {
      name: "a suspended user sees it too",
      actor: suspended,
      resource: own(suspended),
      context: undefined,
      expected: "allow",
    },
    {
      name: "someone else's bindings are not visible",
      actor: other,
      resource: own(active),
      context: undefined,
      expected: "not_found",
    },
    {
      name: "pending user has nothing to delete yet",
      actor: pending,
      resource: own(pending),
      context: undefined,
      expected: "registration_required",
    },
  ]),
  policyMatrix(makeAccountDormantPolicy, [
    {
      name: "the inactivity process puts an active account to rest",
      actor: systemActor(accountInactivityProcess),
      resource: account("active"),
      context: undefined,
      expected: "allow",
    },
    {
      name: "not an account that is already deactivated",
      actor: systemActor(accountInactivityProcess),
      resource: account("deactivated"),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "no other process",
      actor: systemActor("outbox.worker"),
      resource: account("active"),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "no user, not even a steward",
      actor: steward,
      resource: account("active"),
      context: undefined,
      expected: "forbidden",
    },
  ]),
  policyMatrix(releaseAccountIdentityPolicy, [
    {
      name: "the cleanup process releases a deleted account's identity",
      actor: systemActor(accountIdentityCleanupProcess),
      resource: account("deleted"),
      context: undefined,
      expected: "allow",
    },
    {
      name: "never the identity of an account that is not deleted",
      actor: systemActor(accountIdentityCleanupProcess),
      resource: account("closing"),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "no other process",
      actor: systemActor(accountInactivityProcess),
      resource: account("deleted"),
      context: undefined,
      expected: "forbidden",
    },
  ]),
  policyMatrix(suspendAccountPolicy, interventionCases("active", "closing")),
  policyMatrix(
    reinstateAccountPolicy,
    interventionCases("suspended", "deactivated"),
  ),
  policyMatrix(
    startAccountClosurePolicy,
    interventionCases("suspended", "deleted"),
  ),
  policyMatrix(
    completeAccountClosurePolicy,
    interventionCases("closing", "active"),
  ),
  policyMatrix(retireDuplicateAccountPolicy, [
    {
      name: "steward retires an active duplicate of an active account",
      actor: steward,
      resource: pair("active", "active"),
      context: undefined,
      expected: "allow",
    },
    {
      name: "a deactivated or dormant duplicate too",
      actor: steward,
      resource: pair("dormant", "active"),
      context: undefined,
      expected: "allow",
    },
    {
      name: "one already under closure is linked",
      actor: steward,
      resource: pair("closing", "active"),
      context: undefined,
      expected: "allow",
    },
    {
      name: "never a suspended account: that is a way around the suspension",
      actor: steward,
      resource: pair("suspended", "active"),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "the account that continues must be active",
      actor: steward,
      resource: pair("active", "suspended"),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "not a deleted account",
      actor: steward,
      resource: pair("deleted", "active"),
      context: undefined,
      expected: "forbidden",
    },
    ...stewardCases(pair("active", "active"), {
      retired: account("active"),
      continued: own(steward, "active"),
    }),
  ]),
  policyMatrix(linkSamePersonPolicy, [
    {
      name: "steward links two accounts of the same person",
      actor: steward,
      resource: record("active", testUserActor().userId),
      context: undefined,
      expected: "allow",
    },
    {
      name: "a deleted account can still be linked for security",
      actor: steward,
      resource: record("deleted", testUserActor().userId),
      context: undefined,
      expected: "allow",
    },
    ...stewardCases(
      record("active", testUserActor().userId),
      record("active", steward.userId),
    ),
  ]),
  policyMatrix(recordFalseIdentityPolicy, [
    {
      name: "steward records a false identity",
      actor: steward,
      resource: record("active"),
      context: undefined,
      expected: "allow",
    },
    {
      name: "also on a suspended account",
      actor: steward,
      resource: record("suspended"),
      context: undefined,
      expected: "allow",
    },
    {
      name: "an unregistered account has claimed no identity",
      actor: steward,
      resource: record("pending_registration"),
      context: undefined,
      expected: "forbidden",
    },
    ...stewardCases(record("active"), {
      ...own(steward),
      involvedUserIds: [steward.userId],
    }),
  ]),
  policyMatrix(readAccountIdentityRecordPolicy, [
    {
      name: "steward reads what the platform holds about an account",
      actor: steward,
      resource: record("closing", testUserActor().userId),
      context: undefined,
      expected: "allow",
    },
    {
      name: "not a record the steward's own account is linked in",
      actor: steward,
      resource: record("active", steward.userId),
      context: undefined,
      expected: "conflict_of_interest",
    },
    ...stewardCases(record("active"), {
      ...own(steward),
      involvedUserIds: [steward.userId],
    }),
  ]),
  policyMatrix(moveDuplicateObjectPolicy, [
    {
      name: "steward moves a closing duplicate's own object",
      actor: steward,
      resource: duplicateObject("closing", "active"),
      context: undefined,
      expected: "allow",
    },
    {
      name: "not before the duplicate is under closure",
      actor: steward,
      resource: duplicateObject("active", "active"),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "not to an account that is no longer active",
      actor: steward,
      resource: duplicateObject("closing", "deactivated"),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "not an object other people own too",
      actor: steward,
      resource: duplicateObject("closing", "active", [testUserActor().userId]),
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "not an object of an account that is no duplicate",
      actor: steward,
      resource: { ...duplicateObject("closing", "active"), link: null },
      context: undefined,
      expected: "forbidden",
    },
    ...stewardCases(
      duplicateObject("closing", "active"),
      duplicateObject("closing", "active", [steward.userId]),
    ),
  ]),
  policyMatrix(reauthenticatePolicy, [
    {
      name: "a signed-in user confirms their identity again",
      actor: stale,
      resource: undefined,
      context: undefined,
      expected: "allow",
    },
    {
      name: "anonymous caller has no identity to confirm",
      actor: anonymousActor,
      resource: undefined,
      context: undefined,
      expected: "unauthenticated",
    },
  ]),
];

import type { AccountStatusReason } from "@lanbort/contracts";
import type { AccountStatus } from "../actor";

/**
 * PS-ADM-001–003: what an account's lifecycle state allows. This is the one
 * place the states are interpreted; policies and commands ask these
 * functions instead of comparing states themselves.
 */

/** Only an active account starts anything new (requests, loans, contact). */
export function takesNewActivity(status: AccountStatus | undefined): boolean {
  return status === "active";
}

/**
 * PS-ADM-002, PS-ADM-003, PS-LOAN-021: the states that keep the minimum
 * access to what the account is already bound by: its existing loans, and
 * winding its ownership down. A suspension follows already handed over
 * objects to their return the same way; a stricter process for a special
 * security risk is not decided and is not part of this.
 */
export function keepsMinimumAccess(status: AccountStatus | undefined): boolean {
  return (
    status === "active" ||
    status === "dormant" ||
    status === "deactivated" ||
    status === "suspended" ||
    status === "closing"
  );
}

export interface AccountTransition {
  readonly from: AccountStatus;
  readonly to: AccountStatus;
  readonly reason: AccountStatusReason;
}

/**
 * The lifecycle changes each reason allows. The database has the same table
 * (`app.account_transition_allowed`) and refuses any other change.
 * Registration (pending → active) is not a lifecycle change, and a deleted
 * account never changes again.
 */
export const accountTransitions: readonly AccountTransition[] = [
  // The user's own choices.
  { from: "active", to: "deactivated", reason: "user_request" },
  { from: "deactivated", to: "active", reason: "user_request" },
  { from: "dormant", to: "active", reason: "user_request" },
  { from: "active", to: "deleted", reason: "user_request" },
  { from: "deactivated", to: "deleted", reason: "user_request" },
  { from: "dormant", to: "deleted", reason: "user_request" },
  // Long inactivity puts an account to rest.
  { from: "active", to: "dormant", reason: "inactivity" },
  // Platform interventions (PS-ADM-003, PS-ADM-014).
  { from: "active", to: "suspended", reason: "platform" },
  { from: "deactivated", to: "suspended", reason: "platform" },
  { from: "dormant", to: "suspended", reason: "platform" },
  { from: "suspended", to: "active", reason: "platform" },
  { from: "active", to: "closing", reason: "platform" },
  { from: "deactivated", to: "closing", reason: "platform" },
  { from: "dormant", to: "closing", reason: "platform" },
  { from: "suspended", to: "closing", reason: "platform" },
  { from: "closing", to: "active", reason: "platform" },
  { from: "closing", to: "deleted", reason: "platform" },
];

export function transitionAllowed(transition: AccountTransition): boolean {
  return accountTransitions.some(
    ({ from, to, reason }) =>
      from === transition.from &&
      to === transition.to &&
      reason === transition.reason,
  );
}

/** The states a reason can move an account from into `to`. */
export function statesBefore(
  to: AccountStatus,
  reason: AccountStatusReason,
): AccountStatus[] {
  return accountTransitions
    .filter(
      (transition) => transition.to === to && transition.reason === reason,
    )
    .map((transition) => transition.from);
}

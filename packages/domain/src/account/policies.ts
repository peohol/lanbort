import type { AccountStatus } from "../actor";
import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireUser } from "../authorization/rules";

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

export const accountPolicies = [
  readOwnAccount,
  completeRegistrationPolicy,
  reauthenticatePolicy,
];

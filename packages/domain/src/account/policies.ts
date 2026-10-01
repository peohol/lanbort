import type { TotpStatus } from "@lanbort/contracts";
import type { AccountStatus } from "../actor";
import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireAssurance,
  requireRecentAuthentication,
  requireUser,
} from "../authorization/rules";

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

/** Reading the own sign-in security settings. */
export const readSecurityPolicy = definePolicy({
  action: "account.security.read",
  actor: [requireActiveAccount],
});

/** The provider's view of the user's authenticator app (TOTP) factor. */
export interface MfaResource {
  readonly totp: TotpStatus;
}

/**
 * Adding an authenticator app changes how the account is protected, so it
 * requires a recent sign-in: a forgotten open session alone is not enough.
 * Covers both starting and confirming the enrollment. Replacing or removing a
 * confirmed app is not supported yet.
 */
export const enrollMfaPolicy = definePolicy<MfaResource, void>({
  action: "account.mfa.enroll",
  actor: [requireActiveAccount, requireRecentAuthentication()],
  resource: [
    ({ resource }) =>
      resource.totp === "verified" ? deny("forbidden") : allow,
  ],
});

/** Raising the current session to `aal2` with the confirmed app. */
export const stepUpMfaPolicy = definePolicy<MfaResource, void>({
  action: "account.mfa.step_up",
  actor: [requireActiveAccount],
  resource: [
    ({ resource }) =>
      resource.totp === "verified" ? allow : deny("not_found"),
  ],
});

/** Audit record of an enrollment the provider has just confirmed. */
export const recordMfaEnabledPolicy = definePolicy<AccountResource, void>({
  action: "account.mfa.record_enabled",
  actor: [requireActiveAccount, requireAssurance("aal2")],
  resource: [isOwnAccount],
});

export const accountPolicies = [
  readOwnAccount,
  completeRegistrationPolicy,
  reauthenticatePolicy,
  readSecurityPolicy,
  enrollMfaPolicy,
  stepUpMfaPolicy,
  recordMfaEnabledPolicy,
];

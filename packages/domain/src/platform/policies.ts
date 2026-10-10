import type { StewardPasskeys } from "@lanbort/contracts";
import type { AccountStatus, UserActor } from "../actor";
import {
  allow,
  type Decision,
  definePolicy,
  deny,
  type PolicyInput,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireAssurance,
  requirePlatformRole,
  requireSystemProcess,
  userRule,
} from "../authorization/rules";
import {
  type PasskeyChallenge,
  passkeyConfirmationMaxAgeMs,
  passkeyMethod,
  type StoredCredential,
} from "./passkeys";

/**
 * Every action taken through the platform steward role: an active account
 * holding the role, in a session with stronger authentication (`aal2`,
 * docs/architecture/04): a passkey confirmation in this session within the
 * last 10 minutes, with at least two passkeys registered (ADR-0011,
 * OD-0023, `platform/passkeys.ts`). Policies for
 * steward actions start with these rules and add their own, including
 * `requireNotInvolved` wherever a steward could be a party (PS-USR-009).
 */
export const platformStewardAccess = [
  requireActiveAccount,
  requirePlatformRole("platform_steward"),
  requireAssurance("aal2"),
] as const;

/**
 * The audited operational command that grants and revokes global roles.
 * Who may appoint stewards inside the app is not decided yet, so for now
 * only this process can (see docs/implementation/server-boundary.md).
 */
export const platformRoleOpsProcess = "ops.platform_roles";

export interface PlatformRoleTarget {
  readonly userId: string;
  readonly status: AccountStatus;
  readonly activeGrantId: string | null;
}

export const grantPlatformRolePolicy = definePolicy<PlatformRoleTarget, void>({
  action: "platform_role.grant",
  actor: [requireSystemProcess(platformRoleOpsProcess)],
  resource: [
    // Only someone who has completed registration (name, 18+) can hold it.
    ({ resource }) =>
      resource.status === "active" ? allow : deny("forbidden"),
  ],
});

export const revokePlatformRolePolicy = definePolicy<PlatformRoleTarget, void>({
  action: "platform_role.revoke",
  actor: [requireSystemProcess(platformRoleOpsProcess)],
  resource: [
    ({ resource }) =>
      resource.activeGrantId !== null ? allow : deny("not_found"),
  ],
});

/**
 * The audited operational command that issues enrollment codes and resets
 * a steward's passkeys when every one is lost (OD-0023).
 */
export const stewardPasskeyOpsProcess = "ops.steward_passkeys";

/** Managing one's own passkeys: an active account holding the role. */
const stewardRole = [
  requireActiveAccount,
  requirePlatformRole("platform_steward"),
] as const;

function confirmedRecently(actor: UserActor, now: Date): Decision {
  const latest = Math.max(
    ...actor.authentication.methods
      .filter(({ method }) => method === passkeyMethod)
      .map(({ at }) => at.getTime()),
  );

  return now.getTime() - latest <= passkeyConfirmationMaxAgeMs
    ? allow
    : deny("stronger_authentication_required");
}

/**
 * The session was confirmed with one of the steward's passkeys within the
 * last 10 minutes, whether or not they have two yet.
 */
export const requireRecentPasskeyConfirmation = userRule((actor, { now }) =>
  confirmedRecently(actor, now),
);

/**
 * How a new passkey is vouched for (OD-0023): an open enrollment code from
 * the operational command bound to the ceremony, a code that has since been
 * used or voided, or the session's own recent confirmation with another
 * passkey. An e-mail session alone never adds one.
 */
export interface PasskeyEnrollmentResource {
  readonly vouchedBy: "enrollment_code" | "lapsed_code" | "session";
}

const vouched = <C>({
  actor,
  now,
  resource,
}: PolicyInput<PasskeyEnrollmentResource, C>): Decision => {
  switch (resource.vouchedBy) {
    case "enrollment_code":
      return allow;
    case "lapsed_code":
      return deny("forbidden");
    case "session":
      return actor.kind === "user"
        ? confirmedRecently(actor, now)
        : deny("unauthenticated");
  }
};

/** Its context is the enrollment code the caller typed, if any. */
export const beginPasskeyRegistrationPolicy = definePolicy<
  PasskeyEnrollmentResource,
  string | null
>({
  action: "steward_passkey.begin_registration",
  actor: [...stewardRole],
  resource: [vouched],
});

export const finishPasskeyRegistrationPolicy = definePolicy<
  PasskeyEnrollmentResource,
  PasskeyChallenge
>({
  action: "steward_passkey.finish_registration",
  actor: [...stewardRole],
  resource: [vouched],
});

/** The steward's passkeys that count, as the command found them. */
export interface OwnPasskeysResource {
  readonly activeCount: number;
}

export const beginPasskeyConfirmationPolicy = definePolicy<
  OwnPasskeysResource,
  readonly StoredCredential[]
>({
  action: "steward_passkey.begin_confirmation",
  actor: [...stewardRole],
  resource: [
    ({ resource }) => (resource.activeCount > 0 ? allow : deny("forbidden")),
  ],
});

/** Answers a challenge this session started; anything else is not found. */
export const finishPasskeyConfirmationPolicy = definePolicy<
  undefined,
  PasskeyChallenge
>({
  action: "steward_passkey.finish_confirmation",
  actor: [...stewardRole],
});

/**
 * Removing a lost or retired passkey takes a fresh confirmation, and never
 * the last one: losing every passkey is the operational reset's case.
 */
export const removePasskeyPolicy = definePolicy<OwnPasskeysResource>({
  action: "steward_passkey.remove",
  actor: [...stewardRole, requireRecentPasskeyConfirmation],
  resource: [
    ({ resource }) => (resource.activeCount > 1 ? allow : deny("forbidden")),
  ],
});

export const listOwnPasskeysPolicy = definePolicy<StewardPasskeys>({
  action: "steward_passkey.list_own",
  actor: [...stewardRole],
});

/** The steward an operational passkey command is about. */
export interface StewardTarget {
  readonly userId: string;
  readonly status: AccountStatus;
  readonly holdsRole: boolean;
}

const activeSteward = ({ resource }: { resource: StewardTarget }) =>
  resource.status === "active" && resource.holdsRole
    ? allow
    : deny("forbidden");

export const issueEnrollmentCodePolicy = definePolicy<StewardTarget>({
  action: "steward_passkey.issue_enrollment_code",
  actor: [requireSystemProcess(stewardPasskeyOpsProcess)],
  resource: [activeSteward],
});

export const resetStewardPasskeysPolicy = definePolicy<StewardTarget>({
  action: "steward_passkey.reset",
  actor: [requireSystemProcess(stewardPasskeyOpsProcess)],
  resource: [activeSteward],
});

export const platformPolicies = [
  grantPlatformRolePolicy,
  revokePlatformRolePolicy,
  beginPasskeyRegistrationPolicy,
  finishPasskeyRegistrationPolicy,
  beginPasskeyConfirmationPolicy,
  finishPasskeyConfirmationPolicy,
  removePasskeyPolicy,
  listOwnPasskeysPolicy,
  issueEnrollmentCodePolicy,
  resetStewardPasskeysPolicy,
];

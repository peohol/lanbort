import type { CaseKind, StewardPasskeys } from "@lanbort/contracts";
import type { AccountStatus, UserActor } from "../actor";
import {
  allow,
  type Decision,
  definePolicy,
  deny,
  type PolicyInput,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireAssurance,
  requireNotInvolved,
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

/**
 * PS-ADM-015: a platform steward's intervention is taken from a case in the
 * platform queue (`platform/interventions.ts`): one of these kinds.
 */
export const interventionCaseKinds: readonly CaseKind[] = [
  "platform_report",
  "platform_inquiry",
];

/** The case an intervention is taken from, as the steward stands to it. */
export interface InterventionCase {
  readonly id: string;
  readonly kind: CaseKind;
  /** The steward may handle cases of its kind (`app.case_handler_role`). */
  readonly holdsRole: boolean;
  /** The steward is involved in it (`app.case_involved`). */
  readonly involved: boolean;
  /** The intervention is toward what the case is about. */
  readonly about: boolean;
}

export interface FromCase {
  readonly fromCase: InterventionCase;
}

/**
 * PS-ADM-015, PS-USR-009: only from a platform case the steward may
 * handle, is not involved in, and that is about the intervention's target.
 * A case of another queue looks like one that does not exist.
 */
export const fromItsCase: ResourceRule<FromCase, void> = ({
  resource: { fromCase },
}) => {
  if (!fromCase.holdsRole) {
    return deny("not_found");
  }

  if (!interventionCaseKinds.includes(fromCase.kind)) {
    return deny("forbidden");
  }

  if (fromCase.involved) {
    return deny("conflict_of_interest");
  }

  return fromCase.about ? allow : deny("forbidden");
};

/** What a steward's own inquiry is about, as the command found it. */
export type InquiryTarget =
  | {
      readonly kind: "user";
      readonly userId: string;
      readonly status: AccountStatus;
    }
  | {
      readonly kind: "object";
      readonly objectId: string;
      readonly ownerIds: readonly string[];
    };

/**
 * PS-ADM-015: without a report, a steward opens a case of their own about
 * someone else's account or thing, with the basis as its first entry
 * («autorisert saksgrunnlag»). An account that never completed
 * registration, or is deleted, is not there to intervene on.
 */
export const openPlatformInquiryPolicy = definePolicy<InquiryTarget, void>({
  action: "case.open_platform_inquiry",
  actor: [...platformStewardAccess],
  resource: [
    ({ resource }) =>
      resource.kind === "user" &&
      (resource.status === "pending_registration" ||
        resource.status === "deleted")
        ? deny("not_found")
        : allow,
    requireNotInvolved(({ resource }) =>
      resource.kind === "user" ? [resource.userId] : resource.ownerIds,
    ),
  ],
});

/** The roles someone holds in one environment, as the command locked them. */
export interface EnvironmentRolesTarget {
  readonly environmentId: string;
  readonly userId: string;
}

/**
 * PS-ADM-015: a steward ends the administrator and owner roles someone
 * misuses in an environment, from the case about them.
 */
export const endEnvironmentRolesPolicy = definePolicy<
  EnvironmentRolesTarget & FromCase,
  void
>({
  action: "environment_role.end_by_platform",
  actor: [...platformStewardAccess],
  resource: [
    fromItsCase,
    requireNotInvolved(({ resource }) => [resource.userId]),
  ],
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
  openPlatformInquiryPolicy,
  endEnvironmentRolesPolicy,
];

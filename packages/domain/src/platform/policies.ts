import type { AccountStatus } from "../actor";
import { allow, definePolicy, deny } from "../authorization/policy";
import {
  requireActiveAccount,
  requireAssurance,
  requirePlatformRole,
  requireSystemProcess,
} from "../authorization/rules";

/**
 * Every action taken through the platform steward role: an active account
 * holding the role, in a session with stronger authentication (`aal2`,
 * docs/architecture/04; the mechanism is open in OD-0010, so this stays closed
 * until it is decided). Policies for
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

export const platformPolicies = [
  grantPlatformRolePolicy,
  revokePlatformRolePolicy,
];

import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireNotInvolved,
  requireRecentAuthentication,
  requireSystemProcess,
} from "../authorization/rules";
import type { RoleInvitationRecord } from "./continuity-store";
import type {
  EnvironmentAccess,
  MembershipRecord,
  OwnEnvironmentRow,
} from "./model";

/** A membership an administrator acts on. */
export interface AdministeredMembership extends EnvironmentAccess {
  readonly target: MembershipRecord;
}

/**
 * PS-ENV-001 / PS-NFR-002: open and closed environments can be discovered by
 * every signed-in user. A hidden one exists only for its current members,
 * including invited users; to everyone else it is indistinguishable from an
 * environment that does not exist. This rule comes first in every policy.
 */
export const canSeeEnvironment: ResourceRule<EnvironmentAccess, void> = ({
  resource,
}) =>
  resource.environment.type !== "hidden" || resource.viewer.membership !== null
    ? allow
    : deny("not_found");

/** The caller has a current membership in the environment. */
const hasMembership: ResourceRule<EnvironmentAccess, void> = ({ resource }) =>
  resource.viewer.membership !== null ? allow : deny("not_found");

/**
 * An administrator acts only while holding the role and an active
 * membership; a passive member has no ordinary environment activity.
 */
export const isAdministrator: ResourceRule<EnvironmentAccess, void> = ({
  resource,
}) =>
  resource.viewer.roles.includes("administrator") &&
  resource.viewer.membership?.state === "active"
    ? allow
    : deny("forbidden");

/**
 * PS-ENV-003: the owner's own powers (handing over, winding down, removing
 * administrators) need the owner role and an active membership.
 */
const isOwner: ResourceRule<EnvironmentAccess, void> = ({ resource }) =>
  resource.viewer.roles.includes("owner") &&
  resource.viewer.membership?.state === "active"
    ? allow
    : deny("forbidden");

/** Holds the role in any membership state: a passive one may still resign. */
const holdsAdministratorRole: ResourceRule<EnvironmentAccess, void> = ({
  resource,
}) =>
  resource.viewer.roles.includes("administrator") ? allow : deny("forbidden");

/** Taking part in the environment's decisions needs an active membership. */
const isActiveMember: ResourceRule<EnvironmentAccess, void> = ({ resource }) =>
  resource.viewer.membership?.state === "active" ? allow : deny("forbidden");

/** PS-ENV-004: a barred user cannot make a new membership attempt. */
const isNotRestricted: ResourceRule<EnvironmentAccess, void> = ({
  resource,
}) => (resource.viewer.restricted ? deny("forbidden") : allow);

const administration = [canSeeEnvironment, isAdministrator] as const;

export const createEnvironmentPolicy = definePolicy({
  action: "environment.create",
  actor: [requireActiveAccount],
});

export const listOwnEnvironmentsPolicy = definePolicy<
  readonly OwnEnvironmentRow[],
  void
>({
  action: "environment.list_own",
  actor: [requireActiveAccount],
});

export const readEnvironmentPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.read",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment],
});

export const updateEnvironmentDetailsPolicy = definePolicy<
  EnvironmentAccess,
  void
>({
  action: "environment.update_details",
  actor: [requireActiveAccount],
  resource: [...administration],
});

export const updateRequirementsPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.update_requirements",
  actor: [requireActiveAccount],
  resource: [...administration],
});

/** Joining an open environment, applying to a closed one, or reactivating. */
export const joinEnvironmentPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment_membership.join",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, isNotRestricted],
});

/** The member's own answers, invitation and departure. */
export const submitAnswersPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment_membership.submit_answers",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, hasMembership],
});

export const acceptInvitationPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment_membership.accept_invitation",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, hasMembership],
});

export const leaveEnvironmentPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment_membership.leave",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, hasMembership],
});

export const listMembershipsPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment_membership.list",
  actor: [requireActiveAccount],
  resource: [...administration],
});

/**
 * Active members see each other (vision 03); passive members, applicants
 * and outsiders see no list.
 */
export const listMembersPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment_member.list",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, hasMembership, isActiveMember],
});

export const inviteMemberPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment_membership.invite",
  actor: [requireActiveAccount],
  resource: [...administration],
});

export const liftRestrictionPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.lift_restriction",
  actor: [requireActiveAccount],
  resource: [...administration],
});

/**
 * Deciding on someone's membership. An administrator never decides on their
 * own (PS-USR-009).
 */
function decisionPolicy(action: string) {
  return definePolicy<AdministeredMembership, void>({
    action,
    actor: [requireActiveAccount],
    resource: [
      ...administration,
      requireNotInvolved(({ resource }) => [resource.target.userId]),
    ],
  });
}

export const approveMembershipPolicy = decisionPolicy(
  "environment_membership.approve",
);
export const rejectMembershipPolicy = decisionPolicy(
  "environment_membership.reject",
);
export const requestInformationPolicy = decisionPolicy(
  "environment_membership.request_information",
);
export const withdrawInvitationPolicy = decisionPolicy(
  "environment_membership.withdraw_invitation",
);

/** A pending role invitation and the environment it belongs to. */
export interface RoleInvitationAccess extends EnvironmentAccess {
  readonly invitation: RoleInvitationRecord;
}

/** Only the invited user sees an invitation; to anyone else it is unknown. */
const isInvitee: ResourceRule<RoleInvitationAccess, void> = ({
  actor,
  resource,
}) =>
  actor.kind === "user" && resource.invitation.userId === actor.userId
    ? allow
    : deny("not_found");

/**
 * Any administrator may withdraw an administrator invitation, which belongs
 * to the environment; an ownership handover is the owner's own offer.
 */
const mayWithdrawInvitation: ResourceRule<RoleInvitationAccess, void> = (
  input,
) => (input.resource.invitation.role === "owner" ? isOwner(input) : allow);

/** Administrators see who holds and is invited to the roles. */
export const listRolesPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.list_roles",
  actor: [requireActiveAccount],
  resource: [...administration],
});

/** PS-ENV-003: any administrator may invite a member to administer. */
export const inviteAdministratorPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.invite_administrator",
  actor: [requireActiveAccount],
  resource: [...administration],
});

export const acceptRoleInvitationPolicy = definePolicy<
  RoleInvitationAccess,
  void
>({
  action: "environment.accept_role_invitation",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, hasMembership, isInvitee],
});

export const declineRoleInvitationPolicy = definePolicy<
  RoleInvitationAccess,
  void
>({
  action: "environment.decline_role_invitation",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, hasMembership, isInvitee],
});

export const withdrawRoleInvitationPolicy = definePolicy<
  RoleInvitationAccess,
  void
>({
  action: "environment.withdraw_role_invitation",
  actor: [requireActiveAccount],
  resource: [...administration, mayWithdrawInvitation],
});

/**
 * Offering ownership to another administrator. Handing over is a sensitive
 * action, so it needs a recent proof of identity (docs/architecture/04).
 */
export const offerOwnershipPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.offer_ownership",
  actor: [requireActiveAccount, requireRecentAuthentication()],
  resource: [canSeeEnvironment, isOwner],
});

/** Only the owner removes another administrator (PS-ENV-003). */
export const removeAdministratorPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.remove_administrator",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, isOwner],
});

export const resignAdministratorPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.resign_administrator",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, holdsAdministratorRole],
});

/** PS-ENV-013: an administrator who can act registers interest. */
export const claimOwnershipPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.claim_ownership",
  actor: [requireActiveAccount],
  resource: [...administration],
});

export const withdrawOwnershipClaimPolicy = definePolicy<
  EnvironmentAccess,
  void
>({
  action: "environment.withdraw_ownership_claim",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, holdsAdministratorRole],
});

/** PS-ENV-012: only the owner starts winding down, with a recent proof. */
export const startWindDownPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.start_wind_down",
  actor: [requireActiveAccount, requireRecentAuthentication()],
  resource: [canSeeEnvironment, isOwner],
});

export const cancelWindDownPolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.cancel_wind_down",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, isOwner],
});

/**
 * PS-ENV-007–008: any administrator changes the type. A stricter type
 * applies at once; a weaker one only asks the members, who decide for
 * themselves. Withdrawing a proposal keeps the stricter type.
 */
export const changeEnvironmentTypePolicy = definePolicy<
  EnvironmentAccess,
  void
>({
  action: "environment.change_type",
  actor: [requireActiveAccount],
  resource: [...administration],
});

export const withdrawTypeChangePolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment.withdraw_type_change",
  actor: [requireActiveAccount],
  resource: [...administration],
});

/** Each active member answers for themselves only (PS-ENV-008). */
export const respondToTypeChangePolicy = definePolicy<EnvironmentAccess, void>({
  action: "environment_membership.respond_to_type_change",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, hasMembership, isActiveMember],
});

/** The scheduled job that decides proposals whose deadline has passed. */
export const typeChangeProcess = "environment.type_changes";

export const concludeTypeChangesPolicy = definePolicy({
  action: "environment.conclude_type_changes",
  actor: [requireSystemProcess(typeChangeProcess)],
});

/**
 * The scheduled job that resolves expired ownership vacancies and settles
 * final wind-downs (PS-ENV-012–013).
 */
export const continuityProcess = "environment.continuity";

export const settleContinuityPolicy = definePolicy({
  action: "environment.settle_continuity",
  actor: [requireSystemProcess(continuityProcess)],
});

/**
 * Account lifecycle (deactivation, controlled closure; PS-ADM-001–006) ends
 * a departed user's environment roles through this boundary, which starts
 * the continuity model where the user was owner (PS-ENV-013).
 */
export const accountLifecycleProcess = "account.lifecycle";

export const releaseDepartedUserPolicy = definePolicy({
  action: "environment.release_departed_user",
  actor: [requireSystemProcess(accountLifecycleProcess)],
});

/** The scheduled job that ends expired transition periods (PS-ENV-006). */
export const membershipTransitionProcess = "environment.membership_transitions";

export const expireTransitionsPolicy = definePolicy({
  action: "environment_membership.expire_transitions",
  actor: [requireSystemProcess(membershipTransitionProcess)],
});

export const environmentPolicies = [
  createEnvironmentPolicy,
  listOwnEnvironmentsPolicy,
  readEnvironmentPolicy,
  updateEnvironmentDetailsPolicy,
  updateRequirementsPolicy,
  joinEnvironmentPolicy,
  submitAnswersPolicy,
  acceptInvitationPolicy,
  leaveEnvironmentPolicy,
  listMembershipsPolicy,
  listMembersPolicy,
  inviteMemberPolicy,
  liftRestrictionPolicy,
  approveMembershipPolicy,
  rejectMembershipPolicy,
  requestInformationPolicy,
  withdrawInvitationPolicy,
  expireTransitionsPolicy,
  listRolesPolicy,
  inviteAdministratorPolicy,
  acceptRoleInvitationPolicy,
  declineRoleInvitationPolicy,
  withdrawRoleInvitationPolicy,
  offerOwnershipPolicy,
  removeAdministratorPolicy,
  resignAdministratorPolicy,
  claimOwnershipPolicy,
  withdrawOwnershipClaimPolicy,
  startWindDownPolicy,
  cancelWindDownPolicy,
  settleContinuityPolicy,
  releaseDepartedUserPolicy,
  changeEnvironmentTypePolicy,
  withdrawTypeChangePolicy,
  respondToTypeChangePolicy,
  concludeTypeChangesPolicy,
];

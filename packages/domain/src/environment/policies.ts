import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireNotInvolved,
  requireSystemProcess,
} from "../authorization/rules";
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
const canSeeEnvironment: ResourceRule<EnvironmentAccess, void> = ({
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
const isAdministrator: ResourceRule<EnvironmentAccess, void> = ({
  resource,
}) =>
  resource.viewer.roles.includes("administrator") &&
  resource.viewer.membership?.state === "active"
    ? allow
    : deny("forbidden");

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
  inviteMemberPolicy,
  liftRestrictionPolicy,
  approveMembershipPolicy,
  rejectMembershipPolicy,
  requestInformationPolicy,
  withdrawInvitationPolicy,
  expireTransitionsPolicy,
];

import type { EnvironmentRole, EnvironmentType } from "@lanbort/contracts";
import { anonymousActor, systemActor, type UserActor } from "../actor";
import type { RoleInvitationRecord } from "./continuity-store";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import type { EnvironmentAccess, MembershipRecord, Viewer } from "./model";
import {
  acceptInvitationPolicy,
  acceptRoleInvitationPolicy,
  accountLifecycleProcess,
  type AdministeredMembership,
  approveMembershipPolicy,
  cancelWindDownPolicy,
  changeEnvironmentTypePolicy,
  claimOwnershipPolicy,
  concludeTypeChangesPolicy,
  continuityProcess,
  createEnvironmentPolicy,
  declineRoleInvitationPolicy,
  expireTransitionsPolicy,
  inviteAdministratorPolicy,
  listRolesPolicy,
  offerOwnershipPolicy,
  releaseDepartedUserPolicy,
  removeAdministratorPolicy,
  resignAdministratorPolicy,
  type RoleInvitationAccess,
  settleContinuityPolicy,
  startWindDownPolicy,
  withdrawOwnershipClaimPolicy,
  withdrawRoleInvitationPolicy,
  inviteMemberPolicy,
  joinEnvironmentPolicy,
  leaveEnvironmentPolicy,
  liftConcealedRestrictionsPolicy,
  liftRestrictionPolicy,
  listMembershipsPolicy,
  listMembersPolicy,
  listOwnEnvironmentsPolicy,
  membershipTransitionProcess,
  readEnvironmentPolicy,
  rejectMembershipPolicy,
  requestInformationPolicy,
  respondToTypeChangePolicy,
  submitAnswersPolicy,
  typeChangeProcess,
  updateEnvironmentDetailsPolicy,
  updateRequirementsPolicy,
  withdrawInvitationPolicy,
  withdrawTypeChangePolicy,
} from "./policies";

const user = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });
const applicantId = "00000000-0000-4000-8000-0000000000a1";
const environmentId = "00000000-0000-4000-8000-0000000000e1";

/** The policies decide on the environment type and the caller's relation. */
function access(
  type: EnvironmentType,
  viewer: Partial<Viewer> = {},
): EnvironmentAccess {
  return {
    environment: {
      id: environmentId,
      type,
      state: "active",
      name: "Borettslaget",
      description: null,
      audience: null,
      objectFocus: null,
      location: null,
      area: null,
      version: 1,
      requirementsRevision: 0,
      requiresObjectApproval: false,
    },
    ownMembership: null,
    viewer: { membership: null, roles: [], restricted: false, ...viewer },
  };
}

const application: MembershipRecord = {
  id: "00000000-0000-4000-8000-0000000000f2",
  environmentId,
  userId: applicantId,
  state: "pending",
  origin: "application",
  reviewStage: "submitted",
  activatedPosition: null,
  activationRevision: null,
  transitionDeadline: null,
  passiveReason: null,
  passivePosition: null,
};

const member = (
  state: "pending" | "active" | "passive",
  roles: EnvironmentRole[] = [],
): Partial<Viewer> => ({
  membership: { id: "00000000-0000-4000-8000-0000000000f1", state },
  roles,
});

const administrator = member("active", ["owner", "administrator"]);

type Case = PolicyCase<EnvironmentAccess, void>;

function expectCase(
  name: string,
  resource: EnvironmentAccess,
  expected: "allow" | DenialReason,
  actor: UserActor = user,
): Case {
  return { name, actor, resource, context: undefined, expected };
}

/** Cases every environment policy shares: who the caller is at all. */
const callerCases = (resource: EnvironmentAccess): Case[] => [
  {
    name: "anonymous caller",
    actor: anonymousActor,
    resource,
    context: undefined,
    expected: "unauthenticated",
  },
  expectCase(
    "an account that has not completed registration",
    resource,
    "registration_required",
    pendingAccount,
  ),
];

/** A hidden environment does not exist for anyone outside it. */
const hiddenFromOutsiders = (resource = access("hidden")): Case =>
  expectCase("an outsider to a hidden environment", resource, "not_found");

/** Administration: an active administrator, nobody else. */
function administrationCases(): Case[] {
  return [
    expectCase("an administrator", access("closed", administrator), "allow"),
    expectCase(
      "an administrator of a hidden environment",
      access("hidden", administrator),
      "allow",
    ),
    expectCase(
      "an ordinary active member",
      access("closed", member("active")),
      "forbidden",
    ),
    expectCase(
      "a member of a hidden environment without the role",
      access("hidden", member("active")),
      "forbidden",
    ),
    expectCase(
      "an administrator whose membership is passive",
      access("closed", member("passive", ["administrator"])),
      "forbidden",
    ),
    expectCase("a non-member", access("open"), "forbidden"),
    hiddenFromOutsiders(),
    ...callerCases(access("closed", administrator)),
  ];
}

function decisionCases(): PolicyCase<AdministeredMembership, void>[] {
  const target = application;
  const withTarget = (resource: EnvironmentAccess) => ({ ...resource, target });

  return [
    ...administrationCases().map((testCase) => ({
      ...testCase,
      resource: withTarget(testCase.resource),
    })),
    {
      name: "an administrator deciding on their own membership",
      actor: { ...user, userId: applicantId },
      resource: withTarget(access("closed", administrator)),
      context: undefined,
      expected: "conflict_of_interest",
    },
  ];
}

/**
 * The owner's own powers (PS-ENV-003): only the owner with an active
 * membership. Administrators cannot use them on each other, and a platform
 * steward without the role gains nothing (PS-ENV-014).
 */
function ownerCases(): Case[] {
  return [
    expectCase("the owner", access("closed", administrator), "allow"),
    expectCase(
      "the owner of a winding-down hidden environment",
      {
        ...access("hidden", administrator),
        environment: { ...access("hidden").environment, state: "winding_down" },
      },
      "allow",
    ),
    expectCase(
      "an administrator who is not owner",
      access("closed", member("active", ["administrator"])),
      "forbidden",
    ),
    expectCase(
      "an owner whose membership is passive",
      access("closed", member("passive", ["owner", "administrator"])),
      "forbidden",
    ),
    expectCase(
      "a platform steward without the role",
      access("open", member("active")),
      "forbidden",
      { ...user, platformRoles: ["platform_steward"] },
    ),
    expectCase("a non-member", access("open"), "forbidden"),
    hiddenFromOutsiders(),
    ...callerCases(access("closed", administrator)),
  ];
}

/** Owner powers that also need a recent proof of identity. */
function sensitiveOwnerCases(): Case[] {
  const stale = new Date(Date.now() - 60 * 60 * 1000);

  return [
    ...ownerCases(),
    expectCase(
      "the owner without a recent proof of identity",
      access("closed", administrator),
      "reauthentication_required",
      {
        ...user,
        authentication: {
          ...user.authentication,
          methods: [{ method: "otp", at: stale }],
        },
      },
    ),
  ];
}

/** Holding the administrator role in any membership state. */
function roleHolderCases(): Case[] {
  return [
    expectCase(
      "an administrator",
      access("closed", member("active", ["administrator"])),
      "allow",
    ),
    expectCase(
      "an administrator whose membership is passive",
      access("hidden", member("passive", ["administrator"])),
      "allow",
    ),
    expectCase(
      "an ordinary member",
      access("closed", member("active")),
      "forbidden",
    ),
    hiddenFromOutsiders(),
    ...callerCases(access("closed", administrator)),
  ];
}

function roleInvitation(
  role: "owner" | "administrator",
  userId: string,
): RoleInvitationRecord {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    environmentId,
    userId,
    role,
    invitedByUserId: applicantId,
    createdAt: new Date(),
  };
}

/** Only the invited user decides on a role invitation. */
function inviteeCases(): PolicyCase<RoleInvitationAccess, void>[] {
  const withInvitation = (
    resource: EnvironmentAccess,
    userId = user.userId,
  ): RoleInvitationAccess => ({
    ...resource,
    invitation: roleInvitation("administrator", userId),
  });
  const someoneElse = "00000000-0000-4000-8000-0000000000a2";

  return [
    expectCase(
      "the invited member",
      access("closed", member("active")),
      "allow",
    ),
    expectCase(
      "the invited member of a hidden environment",
      access("hidden", member("active")),
      "allow",
    ),
    {
      ...expectCase(
        "an administrator, for someone else's invitation",
        access("closed", administrator),
        "not_found",
      ),
      resource: withInvitation(access("closed", administrator), someoneElse),
    },
    hiddenFromOutsiders(),
    ...callerCases(access("closed", member("active"))),
  ].map((testCase) =>
    "invitation" in testCase.resource
      ? (testCase as PolicyCase<RoleInvitationAccess, void>)
      : { ...testCase, resource: withInvitation(testCase.resource) },
  );
}

/** Any administrator withdraws an administrator invitation; a handover only the owner. */
function withdrawRoleInvitationCases(): PolicyCase<
  RoleInvitationAccess,
  void
>[] {
  const withInvitation =
    (role: "owner" | "administrator") =>
    (testCase: Case): PolicyCase<RoleInvitationAccess, void> => ({
      ...testCase,
      resource: {
        ...testCase.resource,
        invitation: roleInvitation(role, applicantId),
      },
    });
  const coAdministrator = access("closed", member("active", ["administrator"]));

  return [
    ...administrationCases().map(withInvitation("administrator")),
    withInvitation("administrator")(
      expectCase("an administrator who is not owner", coAdministrator, "allow"),
    ),
    withInvitation("owner")(
      expectCase(
        "the owner, for a handover",
        access("closed", administrator),
        "allow",
      ),
    ),
    withInvitation("owner")(
      expectCase(
        "an administrator who is not owner, for a handover",
        coAdministrator,
        "forbidden",
      ),
    ),
  ];
}

/** Scheduled jobs and lifecycle boundaries: only the named process. */
const systemCases = (process: string): PolicyCase<void, void>[] =>
  [
    {
      name: `the ${process} process`,
      actor: systemActor(process),
      expected: "allow" as const,
    },
    {
      name: "another system process",
      actor: systemActor("outbox.worker"),
      expected: "forbidden" as const,
    },
    { name: "a signed-in user", actor: user, expected: "forbidden" as const },
  ].map((testCase) => ({
    ...testCase,
    resource: undefined,
    context: undefined,
  }));

const actorOnly = <R>(policy: Policy<R, void>, resource: R) =>
  policyMatrix(policy, [
    {
      name: "a registered user",
      actor: user,
      resource,
      context: undefined,
      expected: "allow",
    },
    {
      name: "an account that has not completed registration",
      actor: pendingAccount,
      resource,
      context: undefined,
      expected: "registration_required",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource,
      context: undefined,
      expected: "unauthenticated",
    },
  ]);

/** Own-membership actions: only with a current membership. */
const ownMembershipCases = (): Case[] => [
  expectCase("an applicant", access("closed", member("pending")), "allow"),
  expectCase(
    "an invited user of a hidden environment",
    access("hidden", member("pending")),
    "allow",
  ),
  expectCase("a passive member", access("open", member("passive")), "allow"),
  expectCase(
    "a non-member of an open environment",
    access("open"),
    "not_found",
  ),
  hiddenFromOutsiders(),
  ...callerCases(access("open", member("active"))),
];

/**
 * What only active members do: each for themselves, with or without a role.
 * Passive members, applicants and outsiders take no part.
 */
const activeMemberCases = (): Case[] => [
  expectCase("an active member", access("closed", member("active")), "allow"),
  expectCase(
    "an active member of a hidden environment",
    access("hidden", member("active")),
    "allow",
  ),
  expectCase(
    "a passive member",
    access("closed", member("passive")),
    "forbidden",
  ),
  expectCase("an applicant", access("closed", member("pending")), "forbidden"),
  expectCase(
    "a passive administrator",
    access("hidden", member("passive", ["owner", "administrator"])),
    "forbidden",
  ),
  expectCase("a non-member", access("closed"), "not_found"),
  hiddenFromOutsiders(),
  ...callerCases(access("closed", member("active"))),
];

export const environmentMatrices = [
  actorOnly(createEnvironmentPolicy, undefined),
  actorOnly(listOwnEnvironmentsPolicy, []),
  policyMatrix(readEnvironmentPolicy, [
    expectCase("anyone signed in, open environment", access("open"), "allow"),
    expectCase(
      "anyone signed in, closed environment",
      access("closed"),
      "allow",
    ),
    expectCase(
      "a member of a hidden environment",
      access("hidden", member("active")),
      "allow",
    ),
    expectCase(
      "an invited user of a hidden environment",
      access("hidden", member("pending")),
      "allow",
    ),
    expectCase(
      "a passive member of a hidden environment",
      access("hidden", member("passive")),
      "allow",
    ),
    hiddenFromOutsiders(),
    expectCase(
      "a barred outsider to a hidden environment",
      access("hidden", { restricted: true }),
      "not_found",
    ),
    ...callerCases(access("open")),
  ]),
  policyMatrix(updateEnvironmentDetailsPolicy, administrationCases()),
  policyMatrix(updateRequirementsPolicy, administrationCases()),
  policyMatrix(listMembershipsPolicy, administrationCases()),
  policyMatrix(listMembersPolicy, activeMemberCases()),
  policyMatrix(inviteMemberPolicy, administrationCases()),
  policyMatrix(liftRestrictionPolicy, administrationCases()),
  policyMatrix(liftConcealedRestrictionsPolicy, administrationCases()),
  policyMatrix(joinEnvironmentPolicy, [
    expectCase("a non-member of an open environment", access("open"), "allow"),
    expectCase(
      "a non-member of a closed environment",
      access("closed"),
      "allow",
    ),
    expectCase(
      "a passive member of a hidden environment",
      access("hidden", member("passive")),
      "allow",
    ),
    expectCase(
      "a barred user",
      access("closed", { restricted: true }),
      "forbidden",
    ),
    hiddenFromOutsiders(),
    ...callerCases(access("open")),
  ]),
  policyMatrix(submitAnswersPolicy, ownMembershipCases()),
  policyMatrix(acceptInvitationPolicy, ownMembershipCases()),
  policyMatrix(leaveEnvironmentPolicy, ownMembershipCases()),
  policyMatrix(approveMembershipPolicy, decisionCases()),
  policyMatrix(rejectMembershipPolicy, decisionCases()),
  policyMatrix(requestInformationPolicy, decisionCases()),
  policyMatrix(withdrawInvitationPolicy, decisionCases()),
  policyMatrix(listRolesPolicy, administrationCases()),
  policyMatrix(inviteAdministratorPolicy, administrationCases()),
  policyMatrix(claimOwnershipPolicy, administrationCases()),
  policyMatrix(acceptRoleInvitationPolicy, inviteeCases()),
  policyMatrix(declineRoleInvitationPolicy, inviteeCases()),
  policyMatrix(withdrawRoleInvitationPolicy, withdrawRoleInvitationCases()),
  policyMatrix(offerOwnershipPolicy, sensitiveOwnerCases()),
  policyMatrix(startWindDownPolicy, sensitiveOwnerCases()),
  policyMatrix(removeAdministratorPolicy, ownerCases()),
  policyMatrix(cancelWindDownPolicy, ownerCases()),
  policyMatrix(resignAdministratorPolicy, roleHolderCases()),
  policyMatrix(withdrawOwnershipClaimPolicy, roleHolderCases()),
  policyMatrix(settleContinuityPolicy, systemCases(continuityProcess)),
  policyMatrix(releaseDepartedUserPolicy, systemCases(accountLifecycleProcess)),
  policyMatrix(
    expireTransitionsPolicy,
    systemCases(membershipTransitionProcess),
  ),
  policyMatrix(changeEnvironmentTypePolicy, administrationCases()),
  policyMatrix(withdrawTypeChangePolicy, administrationCases()),
  policyMatrix(respondToTypeChangePolicy, activeMemberCases()),
  policyMatrix(concludeTypeChangesPolicy, systemCases(typeChangeProcess)),
];

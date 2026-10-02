import type { EnvironmentRole, EnvironmentType } from "@lanbort/contracts";
import { anonymousActor, systemActor, type UserActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import type { EnvironmentAccess, MembershipRecord, Viewer } from "./model";
import {
  acceptInvitationPolicy,
  type AdministeredMembership,
  approveMembershipPolicy,
  createEnvironmentPolicy,
  expireTransitionsPolicy,
  inviteMemberPolicy,
  joinEnvironmentPolicy,
  leaveEnvironmentPolicy,
  liftRestrictionPolicy,
  listMembershipsPolicy,
  listOwnEnvironmentsPolicy,
  membershipTransitionProcess,
  readEnvironmentPolicy,
  rejectMembershipPolicy,
  requestInformationPolicy,
  submitAnswersPolicy,
  updateEnvironmentDetailsPolicy,
  updateRequirementsPolicy,
  withdrawInvitationPolicy,
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
      version: 1,
      requirementsRevision: 0,
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
  activationRevision: null,
  transitionDeadline: null,
  passiveReason: null,
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
  policyMatrix(inviteMemberPolicy, administrationCases()),
  policyMatrix(liftRestrictionPolicy, administrationCases()),
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
  policyMatrix(expireTransitionsPolicy, [
    {
      name: "the scheduled transition job",
      actor: systemActor(membershipTransitionProcess),
      resource: undefined,
      context: undefined,
      expected: "allow",
    },
    {
      name: "another system process",
      actor: systemActor("outbox.worker"),
      resource: undefined,
      context: undefined,
      expected: "forbidden",
    },
    {
      name: "a signed-in user",
      actor: user,
      resource: undefined,
      context: undefined,
      expected: "forbidden",
    },
  ]),
];

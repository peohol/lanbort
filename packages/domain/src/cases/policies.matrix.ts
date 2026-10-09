import { type Actor, anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { EnvironmentAccess } from "../environment/model";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import { type CaseRecord, caseKinds } from "./model";
import {
  type CaseResource,
  claimCasePolicy,
  closeCasePolicy,
  listEnvironmentCaseQueuePolicy,
  listOwnCasesPolicy,
  listPlatformCaseQueuePolicy,
  openCaseRoundPolicy,
  openEnvironmentContactPolicy,
  readCasePolicy,
  recuseFromCasePolicy,
  releaseCasePolicy,
  type ReportTarget,
  reportUnavailabilityPolicy,
  shareCaseStatementsPolicy,
  transferCasePolicy,
  writeCaseEntryPolicy,
} from "./policies";

const member = testUserActor();
const administrator = testUserActor();
const reporter = testUserActor();
const subject = testUserActor();
const stranger = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });
const steward = (assurance: "aal1" | "aal2", userId?: string) => {
  const actor = testUserActor({
    platformRoles: ["platform_steward"],
    ...(userId === undefined ? {} : { userId }),
  });

  return {
    ...actor,
    authentication: { ...actor.authentication, assurance },
  };
};
const strongSteward = steward("aal2");
const weakSteward = steward("aal1");
/** The same user, with an account that keeps only its minimum access. */
const deactivated = (actor: Actor): Actor =>
  actor.kind === "user" ? { ...actor, accountStatus: "deactivated" } : actor;

export function expectCase<R>(
  name: string,
  actor: Actor,
  resource: R,
  expected: "allow" | DenialReason,
): PolicyCase<R, void> {
  return { name, actor, resource, context: undefined, expected };
}

export const callerCases = <R>(resource: R): PolicyCase<R, void>[] => [
  expectCase("anonymous caller", anonymousActor, resource, "unauthenticated"),
  expectCase(
    "an account that has not completed registration",
    pendingAccount,
    resource,
    "registration_required",
  ),
  expectCase(
    "system processes act on nobody's behalf",
    systemActor("outbox.worker"),
    resource,
    "unauthenticated",
  ),
];

/** A case reported by `reporter` about `subject`. */
const isReport = (kind: CaseRecord["kind"]) =>
  kind === "unavailability_report" ||
  kind === "environment_report" ||
  kind === "platform_report";

const record = (kind: CaseRecord["kind"]): CaseRecord => ({
  id: "00000000-0000-4000-8000-0000000000c1",
  kind,
  environmentId: caseKinds[kind].platform
    ? null
    : "00000000-0000-4000-8000-0000000000e1",
  loanId: null,
  subjectUserId: isReport(kind) ? subject.userId : null,
  reportTarget:
    kind === "environment_report" || kind === "platform_report" ? "user" : null,
  objectId: null,
  reviewId: null,
  escalatedFromCaseId: null,
  openedByUserId: isReport(kind) ? reporter.userId : member.userId,
  openedAt: new Date(),
  status: "open",
  assigneeUserId: null,
  closedAt: null,
});

/** The case as `actor` stands to it. */
const standing = (
  kind: CaseRecord["kind"],
  actor: Actor,
  { holdsRole = false, involved = false } = {},
): CaseResource => {
  const userId = actor.kind === "user" ? actor.userId : null;
  const opener = isReport(kind) ? reporter : member;
  const reported = isReport(kind) && userId === subject.userId;

  return {
    case: record(kind),
    participant:
      userId === opener.userId
        ? {
            userId,
            role: isReport(kind) ? "reporter" : "requester",
            mayWrite: true,
          }
        : null,
    standing: {
      holdsRole,
      involved: involved || reported || userId === opener.userId,
      reported,
    },
  };
};

/**
 * The situations every case policy is checked against, for an environment's
 * case and an unavailability report, with the outcome for a participant's
 * action (`party`) and for a handler's.
 */
interface Situation {
  readonly name: string;
  readonly actor: Actor;
  readonly resource: CaseResource;
  readonly party: "allow" | DenialReason;
  readonly handler: "allow" | DenialReason;
}

const situations = (kind: CaseRecord["kind"]): Situation[] => {
  const platform = caseKinds[kind].platform;
  const handler = platform ? strongSteward : administrator;
  const opener = isReport(kind) ? reporter : member;

  return [
    {
      name: "its participant",
      actor: opener,
      resource: standing(kind, opener),
      party: "allow",
      handler: "forbidden",
    },
    {
      name: "its participant who also holds the handler's role",
      actor: platform ? steward("aal2", opener.userId) : opener,
      resource: standing(kind, opener, { holdsRole: true }),
      party: "allow",
      handler: "conflict_of_interest",
    },
    {
      name: "a handler who is not involved",
      actor: handler,
      resource: standing(kind, handler, { holdsRole: true }),
      party: "allow",
      handler: "allow",
    },
    {
      name: "its participant whose account is deactivated (PS-ADM-002)",
      actor: deactivated(opener),
      resource: standing(kind, opener),
      party: "allow",
      handler: "forbidden",
    },
    {
      name: "a handler whose account is deactivated handles nothing",
      actor: deactivated(handler),
      resource: standing(kind, handler, { holdsRole: true }),
      party: "account_inactive",
      handler: "account_inactive",
    },
    {
      name: "a handler who is involved",
      actor: handler,
      resource: standing(kind, handler, { holdsRole: true, involved: true }),
      party: "conflict_of_interest",
      handler: "conflict_of_interest",
    },
    {
      name: "someone without the handler's role does not see it",
      actor: stranger,
      resource: standing(kind, stranger),
      party: "not_found",
      handler: "not_found",
    },
    ...((platform
      ? [
          {
            name: "a steward without stronger authentication (OD-0010)",
            actor: weakSteward,
            resource: standing(kind, weakSteward, { holdsRole: true }),
            party: "stronger_authentication_required",
            handler: "stronger_authentication_required",
          },
        ]
      : []) satisfies Situation[]),
    ...((isReport(kind)
      ? [
          {
            name: "the user the report is about never sees it",
            actor: platform ? steward("aal2", subject.userId) : subject,
            resource: standing(kind, subject, { holdsRole: true }),
            party: "not_found",
            handler: "not_found",
          },
        ]
      : []) satisfies Situation[]),
  ];
};

export const caseMatrix = (
  policy: Policy<CaseResource, void>,
  side: "party" | "handler",
) =>
  policyMatrix(policy, [
    ...(
      [
        "environment_contact",
        "unavailability_report",
        "environment_report",
        "platform_report",
      ] as const
    ).flatMap((kind) =>
      situations(kind).map((situation) =>
        expectCase(
          `${kind}: ${situation.name}`,
          situation.actor,
          situation.resource,
          situation[side],
        ),
      ),
    ),
    ...callerCases(standing("environment_contact", member)),
  ]);

const environment = (
  viewer: EnvironmentAccess["viewer"],
  type: EnvironmentAccess["environment"]["type"] = "open",
): EnvironmentAccess =>
  ({
    environment: { id: "00000000-0000-4000-8000-0000000000e1", type },
    ownMembership: null,
    viewer,
  }) as unknown as EnvironmentAccess;

export const activeMember = (
  roles: EnvironmentAccess["viewer"]["roles"] = [],
) =>
  environment({
    membership: { id: "m", state: "active" },
    roles,
    restricted: false,
  });
export const passiveMember = environment({
  membership: { id: "m", state: "passive" },
  roles: ["administrator"],
  restricted: false,
});
export const outsider = (type: EnvironmentAccess["environment"]["type"]) =>
  environment({ membership: null, roles: [], restricted: false }, type);

const reportTarget = (overrides: Partial<ReportTarget> = {}): ReportTarget => ({
  actorId: reporter.userId,
  otherUserId: subject.userId,
  otherActive: true,
  openFriendship: null,
  blockedByActor: false,
  blockedByOther: false,
  requestHeldBack: false,
  related: true,
  ...overrides,
});

export const caseMatrices = [
  caseMatrix(readCasePolicy, "party"),
  caseMatrix(writeCaseEntryPolicy, "party"),
  caseMatrix(claimCasePolicy, "handler"),
  caseMatrix(releaseCasePolicy, "handler"),
  caseMatrix(transferCasePolicy, "handler"),
  caseMatrix(openCaseRoundPolicy, "handler"),
  caseMatrix(shareCaseStatementsPolicy, "handler"),
  caseMatrix(recuseFromCasePolicy, "handler"),
  caseMatrix(closeCasePolicy, "handler"),
  policyMatrix(openEnvironmentContactPolicy, [
    expectCase("an active member", member, activeMember(), "allow"),
    expectCase(
      "an administrator, as a member",
      administrator,
      activeMember(["administrator"]),
      "allow",
    ),
    expectCase(
      "a passive member takes part in nothing new",
      member,
      passiveMember,
      "forbidden",
    ),
    expectCase(
      "a non-member of an open environment",
      stranger,
      outsider("open"),
      "forbidden",
    ),
    expectCase(
      "a non-member of a hidden environment does not see it",
      stranger,
      outsider("hidden"),
      "not_found",
    ),
    expectCase(
      "a deactivated account starts nothing new",
      deactivated(member),
      activeMember(),
      "account_inactive",
    ),
    ...callerCases(activeMember()),
  ]),
  policyMatrix(reportUnavailabilityPolicy, [
    expectCase("someone with a relation", reporter, reportTarget(), "allow"),
    expectCase(
      "someone without a relation does not see the user",
      reporter,
      reportTarget({ related: false }),
      "not_found",
    ),
    expectCase(
      "a user who blocks the reporter looks like a missing one",
      reporter,
      reportTarget({ blockedByOther: true }),
      "not_found",
    ),
    expectCase(
      "a user the reporter blocks",
      reporter,
      reportTarget({ blockedByActor: true }),
      "forbidden",
    ),
    expectCase(
      "a deactivated account starts nothing new",
      deactivated(reporter),
      reportTarget(),
      "account_inactive",
    ),
    ...callerCases(reportTarget()),
  ]),
  policyMatrix(listOwnCasesPolicy, [
    expectCase("a signed-in user", member, undefined, "allow"),
    expectCase(
      "a deactivated account, with minimum access",
      deactivated(member),
      undefined,
      "allow",
    ),
    ...callerCases(undefined),
  ]),
  policyMatrix(listEnvironmentCaseQueuePolicy, [
    expectCase(
      "an active administrator",
      administrator,
      activeMember(["administrator"]),
      "allow",
    ),
    expectCase("a member", member, activeMember(), "forbidden"),
    expectCase(
      "a passive administrator",
      administrator,
      passiveMember,
      "forbidden",
    ),
    expectCase(
      "a non-member of a hidden environment",
      stranger,
      outsider("hidden"),
      "not_found",
    ),
    ...callerCases(activeMember(["administrator"])),
  ]),
  policyMatrix(listPlatformCaseQueuePolicy, [
    expectCase(
      "a steward with stronger authentication",
      strongSteward,
      undefined,
      "allow",
    ),
    expectCase(
      "a steward without it (OD-0010)",
      weakSteward,
      undefined,
      "stronger_authentication_required",
    ),
    expectCase("a user without the role", member, undefined, "forbidden"),
    expectCase(
      "anonymous caller",
      anonymousActor,
      undefined,
      "unauthenticated",
    ),
  ]),
];

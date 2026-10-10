import {
  allow,
  type Decision,
  definePolicy,
  deny,
  type PolicyInput,
  type ResourceRule,
} from "../authorization/policy";
import { takesNewActivity } from "../account/model";
import {
  requireActiveAccount,
  requireMinimumAccess,
  requireNotInvolved,
} from "../authorization/rules";
import type { EnvironmentAccess } from "../environment/model";
import { canSeeEnvironment, isAdministrator } from "../environment/policies";
import { platformStewardAccess } from "../platform/policies";
import type { SocialPair } from "../social/pair";
import { type CaseRecord, caseKinds, type ParticipantRecord } from "./model";
import type { HandlerStanding } from "./store";

/**
 * A case as the caller stands to it: as one of its participants, or as
 * someone who holds the role that handles it, and whether they are involved.
 */
export interface CaseResource {
  readonly case: CaseRecord;
  readonly participant: ParticipantRecord | null;
  readonly standing: HandlerStanding;
}

/**
 * Whoever a report is about never learns of it through the case: the user
 * (PS-COM-015), the author of a reported review or response, or an owner of
 * a reported object (WP-52).
 */
const hiddenFromSubject: ResourceRule<CaseResource, void> = ({ resource }) =>
  resource.standing.reported && !resource.participant
    ? deny("not_found")
    : allow;

const notInvolved = requireNotInvolved<CaseResource, void>(
  ({ actor, resource }) =>
    resource.standing.involved && actor.kind === "user" ? [actor.userId] : [],
);

/**
 * PS-COM-011, PS-USR-009: a handler holds the role the case's kind names and
 * is not involved in it. A platform steward also needs the steward's own
 * access (`platformStewardAccess`, closed until OD-0010 is decided). A
 * participant is told they may not; anyone else does not see the case.
 * Handling is new activity: only an active account handles (PS-ADM-001).
 */
export const asHandler: ResourceRule<CaseResource, void> = (input) => {
  const { actor, resource } = input;

  if (!resource.standing.holdsRole) {
    return deny(resource.participant ? "forbidden" : "not_found");
  }

  if (actor.kind === "user" && !takesNewActivity(actor.accountStatus)) {
    return deny("account_inactive");
  }

  const rules = caseKinds[resource.case.kind].platform
    ? platformStewardAccess
    : [];

  for (const rule of [...rules, notInvolved]) {
    const decision: Decision = rule(input as PolicyInput<CaseResource, void>);

    if (!decision.allowed) {
      return decision;
    }
  }

  return allow;
};

/**
 * Only a participant: a handler is told they may not, and anyone else does
 * not see the case.
 */
const asParticipant: ResourceRule<CaseResource, void> = ({ resource }) =>
  resource.participant
    ? allow
    : deny(resource.standing.holdsRole ? "forbidden" : "not_found");

/** A participant acts as one; anyone else only as a handler. */
const asParticipantOrHandler: ResourceRule<CaseResource, void> = (input) =>
  input.resource.participant ? allow : asHandler(input);

/**
 * PS-ADM-002: a participant keeps taking part in an open case with minimum
 * access, also while their account is deactivated, dormant, suspended or
 * closing; handling it takes an active account (`asHandler`).
 */
export function casePolicy(
  action: string,
  rule: ResourceRule<CaseResource, void>,
) {
  return definePolicy<CaseResource>({
    action,
    actor: [requireMinimumAccess],
    resource: [hiddenFromSubject, rule],
  });
}

/** A participant sees what was written for them, a handler all of it. */
export const readCasePolicy = casePolicy("case.read", asParticipantOrHandler);

/** PS-OBJ-021: the pictures of the thing a case names, as the case. */
export const readCaseImagePolicy = casePolicy(
  "case.read_image",
  asParticipantOrHandler,
);

/** A participant writes when it is their turn; a handler while acting. */
export const writeCaseEntryPolicy = casePolicy(
  "case.write",
  asParticipantOrHandler,
);

export const claimCasePolicy = casePolicy("case.claim", asHandler);
export const releaseCasePolicy = casePolicy("case.release", asHandler);
export const transferCasePolicy = casePolicy("case.transfer", asHandler);
export const openCaseRoundPolicy = casePolicy("case.open_round", asHandler);
export const shareCaseStatementsPolicy = casePolicy(
  "case.share_statements",
  asHandler,
);
export const recuseFromCasePolicy = casePolicy("case.recuse", asHandler);
export const closeCasePolicy = casePolicy("case.close", asHandler);

/**
 * PS-COM-021: the member who contacted the administrators closes the
 * contact, and a reporter withdraws their report, also while their account
 * keeps only its minimum access (PS-ADM-002).
 */
export const endContactPolicy = casePolicy("case.end_contact", asParticipant);
export const withdrawReportPolicy = casePolicy(
  "case.withdraw_report",
  asParticipant,
);

/** The environment as the caller stands to it, and whether they were removed. */
export interface EnvironmentContactAccess extends EnvironmentAccess {
  /** Their latest membership was ended as a measure (PS-ENV-021). */
  readonly removed: boolean;
}

/**
 * PS-COM-010: an active member contacts the environment's administrators.
 * A hidden environment exists only for its members. Whoever was removed
 * from it may still ask its administrators for a new assessment
 * (PS-TRUST-018).
 */
export const openEnvironmentContactPolicy =
  definePolicy<EnvironmentContactAccess>({
    action: "case.open_environment_contact",
    actor: [requireActiveAccount],
    resource: [
      (input) => (input.resource.removed ? allow : canSeeEnvironment(input)),
      ({ resource }) =>
        resource.removed || resource.viewer.membership?.state === "active"
          ? allow
          : deny("forbidden"),
    ],
  });

/**
 * Someone the caller may report about: another user they have a concrete
 * relation with (`related`), not across a block (vision 06, «Melding om
 * mulig dødsfall»).
 */
export interface ReportTarget extends SocialPair {
  readonly related: boolean;
}

/** PS-COM-015: anyone with a concrete relation to the user may report. */
export const reportUnavailabilityPolicy = definePolicy<ReportTarget>({
  action: "case.report_unavailability",
  actor: [requireActiveAccount],
  resource: [
    ({ resource }) =>
      resource.blockedByOther || !resource.related ? deny("not_found") : allow,
    ({ resource }) => (resource.blockedByActor ? deny("forbidden") : allow),
  ],
});

/** The caller's own cases, as a participant, also with minimum access. */
export const listOwnCasesPolicy = definePolicy<unknown, void>({
  action: "case.list_own",
  actor: [requireMinimumAccess],
});

/** The environment's cases, for its administrators (UX-IA-007). */
export const listEnvironmentCaseQueuePolicy = definePolicy<EnvironmentAccess>({
  action: "case.list_environment_queue",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, isAdministrator],
});

/** The platform's cases, for the platform stewards. */
export const listPlatformCaseQueuePolicy = definePolicy<unknown, void>({
  action: "case.list_platform_queue",
  actor: [...platformStewardAccess],
});

export const casePolicies = [
  readCasePolicy,
  readCaseImagePolicy,
  writeCaseEntryPolicy,
  claimCasePolicy,
  releaseCasePolicy,
  transferCasePolicy,
  openCaseRoundPolicy,
  shareCaseStatementsPolicy,
  recuseFromCasePolicy,
  closeCasePolicy,
  endContactPolicy,
  withdrawReportPolicy,
  openEnvironmentContactPolicy,
  reportUnavailabilityPolicy,
  listOwnCasesPolicy,
  listEnvironmentCaseQueuePolicy,
  listPlatformCaseQueuePolicy,
];

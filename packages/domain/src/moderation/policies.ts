import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireActiveAccount } from "../authorization/rules";
import { asHandler, casePolicy } from "../cases/policies";
import type { EnvironmentAccess } from "../environment/model";
import { canSeeEnvironment } from "../environment/policies";
import { isActiveMember } from "../publications/policies";

/**
 * Moderation (WP-52, PS-TRUST-013–016). Reports are cases, so who handles
 * one, and who may not because they are involved (PS-USR-009), follows the
 * case rules: an environment report is for the environment's administrators,
 * a platform report for the platform stewards, whose stronger
 * authentication keeps it closed until OD-0010 is decided.
 */

/**
 * An active member reports to the environment's administrators. A hidden
 * environment exists only for its members.
 */
export const reportInEnvironmentPolicy = definePolicy<EnvironmentAccess>({
  action: "case.report_in_environment",
  actor: [requireActiveAccount],
  resource: [canSeeEnvironment, isActiveMember],
});

/**
 * What the caller reports to the platform, as they stand to it: they can
 * reach it (a user they are related to, an object they have met and do not
 * own, a published review about them, the response to their own review).
 * Anything else does not exist for them.
 */
export interface PlatformReportTarget {
  readonly reachable: boolean;
}

const reachable: ResourceRule<PlatformReportTarget, void> = ({ resource }) =>
  resource.reachable ? allow : deny("not_found");

export const reportToPlatformPolicy = definePolicy<PlatformReportTarget>({
  action: "case.report_to_platform",
  actor: [requireActiveAccount],
  resource: [reachable],
});

/** The acting administrator takes an environment report to the platform. */
export const escalateReportPolicy = casePolicy("case.escalate", asHandler);

/** PS-TRUST-016: the acting handler takes a measure on the report. */
export const takeModerationMeasurePolicy = casePolicy(
  "moderation.take_measure",
  asHandler,
);

/** The measures on a report, for its handlers (internal history). */
export const listCaseMeasuresPolicy = casePolicy(
  "moderation.list_measures",
  asHandler,
);

export const moderationPolicies = [
  reportInEnvironmentPolicy,
  reportToPlatformPolicy,
  escalateReportPolicy,
  takeModerationMeasurePolicy,
  listCaseMeasuresPolicy,
];

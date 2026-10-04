import { testUserActor } from "../testing/actors";
import { policyMatrix } from "../authorization/policy-matrix";
import {
  activeMember,
  callerCases,
  caseMatrix,
  expectCase,
  outsider,
  passiveMember,
} from "../cases/policies.matrix";
import {
  escalateReportPolicy,
  listCaseMeasuresPolicy,
  type PlatformReportTarget,
  reportInEnvironmentPolicy,
  reportToPlatformPolicy,
  takeModerationMeasurePolicy,
} from "./policies";

const member = testUserActor();
const reachable = (value: boolean): PlatformReportTarget => ({
  reachable: value,
});

export const moderationMatrices = [
  // Handled like every case: the environment's administrators or the
  // stewards, never anyone involved, never what the report is about.
  caseMatrix(escalateReportPolicy, "handler"),
  caseMatrix(takeModerationMeasurePolicy, "handler"),
  caseMatrix(listCaseMeasuresPolicy, "handler"),
  policyMatrix(reportInEnvironmentPolicy, [
    expectCase("an active member", member, activeMember(), "allow"),
    expectCase(
      "a passive member takes part in nothing new",
      member,
      passiveMember,
      "forbidden",
    ),
    expectCase(
      "a non-member of an open environment",
      member,
      outsider("open"),
      "forbidden",
    ),
    expectCase(
      "a non-member of a hidden environment does not see it",
      member,
      outsider("hidden"),
      "not_found",
    ),
    ...callerCases(activeMember()),
  ]),
  policyMatrix(reportToPlatformPolicy, [
    expectCase("what the caller can reach", member, reachable(true), "allow"),
    expectCase(
      "what the caller cannot reach does not exist for them",
      member,
      reachable(false),
      "not_found",
    ),
    ...callerCases(reachable(true)),
  ]),
];

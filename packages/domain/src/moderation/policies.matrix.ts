import type { Actor } from "../actor";
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
  readMeasureNoticePolicy,
  reportInEnvironmentPolicy,
  reportToPlatformPolicy,
  takeModerationMeasurePolicy,
} from "./policies";

const member = testUserActor();
const owner = testUserActor();
const deactivated = (actor: Actor): Actor =>
  actor.kind === "user" ? { ...actor, accountStatus: "deactivated" } : actor;
const hitting = (...actors: Actor[]) => ({
  affected: actors.flatMap((actor) =>
    actor.kind === "user" ? [actor.userId] : [],
  ),
});
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
  // PS-TRUST-018: the notice is for whoever the measure hits, and nobody
  // else learns that it exists.
  policyMatrix(readMeasureNoticePolicy, [
    expectCase("an owner it hits", owner, hitting(owner), "allow"),
    expectCase(
      "an owner it hits, with minimum access",
      deactivated(owner),
      hitting(owner),
      "allow",
    ),
    expectCase("anyone else", member, hitting(owner), "not_found"),
    expectCase("a measure that hits nobody", owner, hitting(), "not_found"),
    ...callerCases(hitting(owner)),
  ]),
];

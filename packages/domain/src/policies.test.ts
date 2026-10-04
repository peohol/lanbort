import { caseParticipantRoleSchema } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { platformRoles } from "./actor";
import { accountMatrices } from "./account/policies.matrix";
import { caseMatrices } from "./cases/policies.matrix";
import { environmentMatrices } from "./environment/policies.matrix";
import { homeMatrices } from "./home/policies.matrix";
import { loanMatrices } from "./loans/policies.matrix";
import { moderationMatrices } from "./moderation/policies.matrix";
import { notificationMatrices } from "./notifications/policies.matrix";
import {
  matrixGaps,
  outcomeOf,
  type PolicyMatrix,
} from "./authorization/policy-matrix";
import { objectMatrices } from "./objects/policies.matrix";
import { outboxMatrices } from "./outbox/policy.matrix";
import { platformMatrices } from "./platform/policies.matrix";
import { allPolicies } from "./policies";
import { publicationMatrices } from "./publications/policies.matrix";
import { questionMatrices } from "./questions/policies.matrix";
import { restoreMatrices } from "./restore/policies.matrix";
import { reviewMatrices } from "./reviews/policies.matrix";
import { searchMatrices } from "./search/policies.matrix";
import { socialMatrices } from "./social/policies.matrix";
import { subscriptionMatrices } from "./subscriptions/policies.matrix";
import { trustMatrices } from "./trust/policies.matrix";

/**
 * Port A: authorization has both positive and negative automated tests.
 * Adding a policy without a matrix, or a matrix without both outcomes, fails.
 */
const matrices: readonly PolicyMatrix<never, never>[] = [
  ...accountMatrices,
  ...environmentMatrices,
  ...outboxMatrices,
  ...platformMatrices,
  ...objectMatrices,
  ...publicationMatrices,
  ...loanMatrices,
  ...reviewMatrices,
  ...socialMatrices,
  ...notificationMatrices,
  ...homeMatrices,
  ...caseMatrices,
  ...trustMatrices,
  ...subscriptionMatrices,
  ...questionMatrices,
  ...moderationMatrices,
  ...searchMatrices,
  ...restoreMatrices,
] as never;

describe("policy coverage", () => {
  it("has exactly one test matrix per registered policy", () => {
    const covered = matrices.map((matrix) => matrix.policy.action).sort();
    const registered = allPolicies.map((policy) => policy.action).sort();

    expect(covered).toEqual(registered);
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("covers both allowed and denied outcomes for every policy", () => {
    expect(matrices.flatMap(matrixGaps)).toEqual([]);
  });
});

/**
 * PS-ADM-008, OD-0003: representative access is not part of the pilot. No
 * policy, global role or case role may give it until OD-0003 is decided and
 * a policy explicitly allows it; adding one means changing this test on
 * purpose (pgTAP 0030 holds the same line in the database).
 */
describe("representative access while OD-0003 is open", () => {
  const representative = /represent|deceas|death|on_behalf|impersonat/i;

  it("has no policy, global role or case role", () => {
    expect(
      [
        ...allPolicies.map((policy) => policy.action),
        ...platformRoles,
        ...caseParticipantRoleSchema.options,
      ].filter((name) => representative.test(name)),
    ).toEqual([]);
  });
});

describe.each(
  matrices.map((matrix) => [matrix.policy.action, matrix] as const),
)("policy %s", (_action, matrix) => {
  it.each(matrix.cases)("$name → $expected", (testCase) => {
    expect(outcomeOf(matrix.policy, testCase)).toBe(testCase.expected);
  });
});

import { describe, expect, it } from "vitest";
import { accountMatrices } from "./account/policies.matrix";
import { environmentMatrices } from "./environment/policies.matrix";
import { loanMatrices } from "./loans/policies.matrix";
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
import { reviewMatrices } from "./reviews/policies.matrix";
import { socialMatrices } from "./social/policies.matrix";

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

describe.each(
  matrices.map((matrix) => [matrix.policy.action, matrix] as const),
)("policy %s", (_action, matrix) => {
  it.each(matrix.cases)("$name → $expected", (testCase) => {
    expect(outcomeOf(matrix.policy, testCase)).toBe(testCase.expected);
  });
});

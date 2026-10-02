import type { Actor } from "../actor";
import type { DenialReason } from "../errors";
import { evaluate, type Policy } from "./policy";

export interface PolicyCase<R, C> {
  readonly name: string;
  readonly actor: Actor;
  readonly resource: R;
  readonly context: C;
  readonly now?: Date;
  readonly expected: "allow" | DenialReason;
}

/**
 * The test matrix of one policy. Every policy must be covered by a matrix
 * with at least one allowed and one denied case (Port A).
 */
export interface PolicyMatrix<R = never, C = never> {
  readonly policy: Policy<R, C>;
  readonly cases: readonly PolicyCase<R, C>[];
}

export function policyMatrix<R, C>(
  policy: Policy<R, C>,
  cases: readonly PolicyCase<R, C>[],
): PolicyMatrix<R, C> {
  return { policy, cases };
}

export function outcomeOf<R, C>(
  policy: Policy<R, C>,
  testCase: PolicyCase<R, C>,
): "allow" | DenialReason {
  const decision = evaluate(policy, {
    actor: testCase.actor,
    resource: testCase.resource,
    context: testCase.context,
    now: testCase.now ?? new Date(),
  });

  return decision.allowed ? "allow" : decision.reason;
}

/** Describes what is missing for the matrix to count as complete. */
export function matrixGaps<R, C>(matrix: PolicyMatrix<R, C>): string[] {
  const gaps: string[] = [];

  if (!matrix.cases.some((testCase) => testCase.expected === "allow")) {
    gaps.push(`${matrix.policy.action} has no allowed case`);
  }

  if (!matrix.cases.some((testCase) => testCase.expected !== "allow")) {
    gaps.push(`${matrix.policy.action} has no denied case`);
  }

  return gaps;
}

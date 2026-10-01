import type { Policy } from "./authorization/policy";
import { accountPolicies } from "./account/policies";
import { processOutboxPolicy } from "./outbox/policy";
import { platformPolicies } from "./platform/policies";

/**
 * Every policy in the system. `policies.test.ts` requires each one to have a
 * test matrix with both allowed and denied cases.
 */
export const allPolicies: readonly Policy<never, never>[] = [
  ...accountPolicies,
  ...platformPolicies,
  processOutboxPolicy,
];

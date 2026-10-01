import type { Policy } from "./authorization/policy";
import { accountPolicies } from "./account/policies";
import { processOutboxPolicy } from "./outbox/policy";

/**
 * Every policy in the system. `policies.test.ts` requires each one to have a
 * test matrix with both allowed and denied cases.
 */
export const allPolicies: readonly Policy<never, never>[] = [
  ...accountPolicies,
  processOutboxPolicy,
];

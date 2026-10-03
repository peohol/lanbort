import type { Policy } from "./authorization/policy";
import { accountPolicies } from "./account/policies";
import { casePolicies } from "./cases/policies";
import { environmentPolicies } from "./environment/policies";
import { loanRequestPolicies } from "./loans/policies";
import { objectPolicies } from "./objects/policies";
import { processOutboxPolicy } from "./outbox/policy";
import { platformPolicies } from "./platform/policies";
import { publicationPolicies } from "./publications/policies";
import { reviewPolicies } from "./reviews/policies";
import { socialPolicies } from "./social/policies";

/**
 * Every policy in the system. `policies.test.ts` requires each one to have a
 * test matrix with both allowed and denied cases.
 */
export const allPolicies: readonly Policy<never, never>[] = [
  ...accountPolicies,
  ...environmentPolicies,
  ...platformPolicies,
  ...objectPolicies,
  ...publicationPolicies,
  ...loanRequestPolicies,
  ...reviewPolicies,
  ...socialPolicies,
  ...casePolicies,
  processOutboxPolicy,
];

import type { Policy } from "./authorization/policy";
import { accountPolicies } from "./account/policies";
import { casePolicies } from "./cases/policies";
import { environmentPolicies } from "./environment/policies";
import { homePolicies } from "./home/policies";
import { loanRequestPolicies } from "./loans/policies";
import { moderationPolicies } from "./moderation/policies";
import { notificationPolicies } from "./notifications/policies";
import { objectPolicies } from "./objects/policies";
import { processOutboxPolicy } from "./outbox/policy";
import { platformPolicies } from "./platform/policies";
import { publicationPolicies } from "./publications/policies";
import { questionPolicies } from "./questions/policies";
import { reviewPolicies } from "./reviews/policies";
import { searchPolicies } from "./search/policies";
import { socialPolicies } from "./social/policies";
import { subscriptionPolicies } from "./subscriptions/policies";
import { trustPolicies } from "./trust/policies";

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
  ...notificationPolicies,
  ...homePolicies,
  ...casePolicies,
  ...trustPolicies,
  ...subscriptionPolicies,
  ...questionPolicies,
  ...moderationPolicies,
  ...searchPolicies,
  processOutboxPolicy,
];

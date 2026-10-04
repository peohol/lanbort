import { definePolicy } from "../authorization/policy";
import { requireLoanStanding } from "../loans/policies";

/**
 * The caller's own Home. It needs the standing that keeps what an existing
 * loan needs (PS-LOAN-021), so whoever still has a loan to finish sees it;
 * each part of Home is read through its own query and policy.
 */
export const readHomePolicy = definePolicy<unknown, void>({
  action: "home.read",
  actor: [requireLoanStanding],
});

export const homePolicies = [readHomePolicy];

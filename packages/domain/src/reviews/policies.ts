import type { LoanRequestRole } from "@lanbort/contracts";
import type { Actor } from "../actor";
import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireSystemProcess } from "../authorization/rules";
import { requireLoanStanding } from "../loans/policies";

/**
 * The parties of a loan's reviews: its borrower and its lender when it
 * ended (the review window's), or, before it has ended, its borrower and
 * responsible lender.
 */
export interface ReviewPartiesResource {
  readonly borrowerUserId: string;
  readonly lenderUserId: string;
}

export function reviewRoleOf(
  actor: Actor,
  resource: ReviewPartiesResource,
): LoanRequestRole | null {
  if (actor.kind !== "user") {
    return null;
  }

  if (actor.userId === resource.borrowerUserId) {
    return "borrower";
  }

  return actor.userId === resource.lenderUserId ? "lender" : null;
}

/**
 * Only the parties: to everyone else, other co-owners included, the loan
 * and its reviews do not exist. Nothing social is checked: a block or a
 * friendship that is gone never takes an earned review right or the one
 * response away (PS-TRUST-009, PS-USR-007).
 */
const asReviewParty: ResourceRule<ReviewPartiesResource, void> = ({
  actor,
  resource,
}) => (reviewRoleOf(actor, resource) ? allow : deny("not_found"));

/**
 * Reviews belong to what an existing loan needs to be finished
 * (PS-ADM-002: earned review rights stand), so they take the loan standing
 * that WP-53 widens for deactivated accounts.
 */
function reviewPartyPolicy(action: string) {
  return definePolicy<ReviewPartiesResource, void>({
    action,
    actor: [requireLoanStanding],
    resource: [asReviewParty],
  });
}

/** The loan's reviews as one of its parties sees them. */
export const readLoanReviewsPolicy = reviewPartyPolicy("loan_review.read");

/** PS-TRUST-001–004: a party reviews the other one, and revises it while hidden. */
export const submitLoanReviewPolicy = reviewPartyPolicy("loan_review.submit");

/** PS-TRUST-005: a party responds once to the review about them. */
export const respondToLoanReviewPolicy = reviewPartyPolicy(
  "loan_review.respond",
);

/** The scheduled job that publishes reviews when their window is over. */
export const reviewPublicationProcess = "loan_review.publications";

export const publishDueLoanReviewsPolicy = definePolicy({
  action: "loan_review.publish_due",
  actor: [requireSystemProcess(reviewPublicationProcess)],
});

export const reviewPolicies = [
  readLoanReviewsPolicy,
  submitLoanReviewPolicy,
  respondToLoanReviewPolicy,
  publishDueLoanReviewsPolicy,
];

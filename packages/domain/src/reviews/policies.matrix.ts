import { type Actor, anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import {
  publishDueLoanReviewsPolicy,
  readLoanReviewsPolicy,
  type ReviewPartiesResource,
  respondToLoanReviewPolicy,
  reviewPublicationProcess,
  submitLoanReviewPolicy,
} from "./policies";

const borrower = testUserActor();
const lender = testUserActor();
const coOwner = testUserActor();
const stranger = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });

function expectCase<R>(
  name: string,
  actor: Actor,
  resource: R,
  expected: "allow" | DenialReason,
): PolicyCase<R, void> {
  return { name, actor, resource, context: undefined, expected };
}

/** The parties of the loan's reviews: its borrower and its lender. */
const parties: ReviewPartiesResource = {
  borrowerUserId: borrower.userId,
  lenderUserId: lender.userId,
};

/**
 * Only the two parties, each about the other; a co-owner who is not the
 * lender and anyone else do not see the loan's reviews at all.
 */
const partyMatrix = (policy: Policy<ReviewPartiesResource, void>) =>
  policyMatrix(policy, [
    expectCase("the borrower", borrower, parties, "allow"),
    expectCase("the lender", lender, parties, "allow"),
    expectCase(
      "a co-owner who is not the loan's lender",
      coOwner,
      parties,
      "not_found",
    ),
    expectCase("anyone else", stranger, parties, "not_found"),
    expectCase("anonymous caller", anonymousActor, parties, "unauthenticated"),
    expectCase(
      "an account that has not completed registration",
      pendingAccount,
      parties,
      "registration_required",
    ),
    expectCase(
      "system processes act on nobody's behalf",
      systemActor(reviewPublicationProcess),
      parties,
      "unauthenticated",
    ),
  ]);

export const reviewMatrices = [
  partyMatrix(readLoanReviewsPolicy),
  partyMatrix(submitLoanReviewPolicy),
  partyMatrix(respondToLoanReviewPolicy),
  policyMatrix(publishDueLoanReviewsPolicy, [
    expectCase(
      "the review publication process",
      systemActor(reviewPublicationProcess),
      undefined,
      "allow",
    ),
    expectCase(
      "another system process",
      systemActor("outbox.worker"),
      undefined,
      "forbidden",
    ),
    expectCase("a party of a loan", borrower, undefined, "forbidden"),
  ]),
];

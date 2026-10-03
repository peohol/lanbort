import { type Actor, anonymousActor, systemActor } from "../actor";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { Policy } from "../authorization/policy";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import {
  acceptResponsibilityPolicy,
  approveLoanRequestPolicy,
  confirmLoanTermsPolicy,
  createLoanRequestPolicy,
  declineLoanRequestPolicy,
  type LoanRequestResource,
  type LoanRequestTarget,
  type LoanResource,
  listLoanRequestsPolicy,
  previewLoanRequestPolicy,
  readLoanPolicy,
  readLoanRequestPolicy,
  withdrawLoanRequestPolicy,
} from "./policies";

const borrower = testUserActor();
const owner = testUserActor();
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

const callerCases = <R>(resource: R): PolicyCase<R, void>[] => [
  expectCase("anonymous caller", anonymousActor, resource, "unauthenticated"),
  expectCase(
    "an account that has not completed registration",
    pendingAccount,
    resource,
    "registration_required",
  ),
  expectCase(
    "system processes act on nobody's behalf",
    systemActor("outbox.worker"),
    resource,
    "unauthenticated",
  ),
];

const target = (reachable: boolean): LoanRequestTarget => ({
  ownerIds: [owner.userId, coOwner.userId],
  reachable,
});

const targetCases = [
  expectCase(
    "someone who can reach the object",
    borrower,
    target(true),
    "allow",
  ),
  expectCase(
    "someone who cannot reach it does not see it",
    stranger,
    target(false),
    "not_found",
  ),
  expectCase(
    "an owner does not borrow their own object",
    owner,
    target(true),
    "forbidden",
  ),
  ...callerCases(target(true)),
];

/** The owner sees the request as a lender; the co-owner does not. */
const request: LoanRequestResource = {
  borrowerUserId: borrower.userId,
  lenderIds: [owner.userId],
};

/** The owner approved and is the responsible lender. */
const loan: LoanResource = {
  borrowerUserId: borrower.userId,
  responsibleLenderId: owner.userId,
};

const partyCases = (allowed: { borrower: boolean; lender: boolean }) => [
  expectCase(
    "the borrower",
    borrower,
    request,
    allowed.borrower ? "allow" : "forbidden",
  ),
  expectCase(
    "an owner who sees it as a lender",
    owner,
    request,
    allowed.lender ? "allow" : "forbidden",
  ),
  expectCase(
    "a co-owner without the borrower's relation to the origin",
    coOwner,
    request,
    "not_found",
  ),
  expectCase("anyone else", stranger, request, "not_found"),
  ...callerCases(request),
];

const partyMatrix = (
  policy: Policy<LoanRequestResource, void>,
  allowed: { borrower: boolean; lender: boolean },
) => policyMatrix(policy, partyCases(allowed));

export const loanMatrices = [
  policyMatrix(createLoanRequestPolicy, targetCases),
  policyMatrix(previewLoanRequestPolicy, targetCases),
  partyMatrix(readLoanRequestPolicy, { borrower: true, lender: true }),
  partyMatrix(withdrawLoanRequestPolicy, { borrower: true, lender: false }),
  partyMatrix(declineLoanRequestPolicy, { borrower: false, lender: true }),
  partyMatrix(approveLoanRequestPolicy, { borrower: false, lender: true }),
  partyMatrix(confirmLoanTermsPolicy, { borrower: true, lender: false }),
  partyMatrix(acceptResponsibilityPolicy, { borrower: true, lender: true }),
  policyMatrix(listLoanRequestsPolicy, [
    expectCase("a signed-in user", borrower, undefined, "allow"),
    ...callerCases(undefined),
  ]),
  policyMatrix(readLoanPolicy, [
    expectCase("the borrower", borrower, loan, "allow"),
    expectCase("the responsible lender", owner, loan, "allow"),
    expectCase(
      "a co-owner who is not the responsible lender",
      coOwner,
      loan,
      "not_found",
    ),
    expectCase("anyone else", stranger, loan, "not_found"),
    ...callerCases(loan),
  ]),
];

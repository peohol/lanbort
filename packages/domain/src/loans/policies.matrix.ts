import { type Actor, anonymousActor, systemActor } from "../actor";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { Policy } from "../authorization/policy";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import {
  acceptLoanAmendmentPolicy,
  acceptResponsibilityPolicy,
  acceptResponsibilityTransferPolicy,
  approveLoanRequestPolicy,
  cancelLoanPolicy,
  concludeHandoversPolicy,
  concludeReturnsPolicy,
  confirmLoanControlPolicy,
  confirmLoanTermsPolicy,
  createLoanRequestPolicy,
  declineLoanAmendmentPolicy,
  declineLoanRequestPolicy,
  declineResponsibilityTransferPolicy,
  endLoanUnresolvedPolicy,
  handoverProcess,
  type LoanAmendmentResource,
  type LoanControlResource,
  type LoanReceiptResource,
  type LoanReturnResource,
  type LoanRequestResource,
  type LoanRequestTarget,
  type LoanResource,
  type LoanTakeoverResource,
  listCoOwnerLoansPolicy,
  listLoanRequestsPolicy,
  offerResponsibilityPolicy,
  previewLoanRequestPolicy,
  proposeLoanAmendmentPolicy,
  readLoanPolicy,
  readLoanRequestPolicy,
  reportHandoverPolicy,
  reportReturnPolicy,
  requestLoanMediationPolicy,
  type ResponsibilityTransferResource,
  returnProcess,
  takeOverResponsibilityPolicy,
  undoReturnPolicy,
  unresolvedEndingProcess,
  withdrawLoanAmendmentPolicy,
  withdrawLoanRequestPolicy,
  withdrawResponsibilityTransferPolicy,
} from "./policies";

const borrower = testUserActor();
const owner = testUserActor();
const coOwner = testUserActor();
const stranger = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });

/** What a party keeps while their account is not active (PS-ADM-002). */
type Standing = "allow" | "account_inactive";

/** The same party, with a deactivated or suspended account. */
const inactiveCases = <R>(
  party: Actor & { kind: "user" },
  side: string,
  resource: R,
  expected: Standing,
) =>
  (["deactivated", "suspended"] as const).map((accountStatus) =>
    expectCase(
      `the ${side} with a ${accountStatus} account`,
      { ...party, accountStatus },
      resource,
      expected,
    ),
  );

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

/**
 * Only the loan's parties: other co-owners, who may see the request, do not
 * see the loan or act on it, however the friendship or membership behind it
 * changed.
 */
const loanCases = <R extends LoanResource>(
  resource: R,
  allowed: { borrower: boolean; lender: boolean },
  standing: Standing = "allow",
) => [
  ...(allowed.borrower
    ? inactiveCases(borrower, "borrower", resource, standing)
    : []),
  ...(allowed.lender
    ? inactiveCases(owner, "responsible lender", resource, standing)
    : []),
  expectCase(
    "the borrower",
    borrower,
    resource,
    allowed.borrower ? "allow" : "forbidden",
  ),
  expectCase(
    "the responsible lender",
    owner,
    resource,
    allowed.lender ? "allow" : "forbidden",
  ),
  expectCase(
    "a co-owner who is not the responsible lender",
    coOwner,
    resource,
    "not_found",
  ),
  expectCase("anyone else", stranger, resource, "not_found"),
  ...callerCases(resource),
];

const loanPartyMatrix = (
  policy: Policy<LoanResource, void>,
  standing: Standing = "allow",
) =>
  policyMatrix(
    policy,
    loanCases(loan, { borrower: true, lender: true }, standing),
  );

/**
 * PS-LOAN-010: on a proposal by either side, the other side answers it and
 * the proposing side may withdraw it; nobody agrees with themselves.
 */
const amendmentMatrix = (
  policy: Policy<LoanAmendmentResource, void>,
  allowed: "other" | "proposer",
  standing: Standing = "allow",
) =>
  policyMatrix(
    policy,
    (["borrower", "lender"] as const).flatMap((proposerRole) =>
      loanCases(
        { ...loan, proposerRole },
        {
          borrower: (proposerRole === "borrower") === (allowed === "proposer"),
          lender: (proposerRole === "lender") === (allowed === "proposer"),
        },
        standing,
      ).map((testCase) => ({
        ...testCase,
        name: `${testCase.name}, on the ${proposerRole}'s proposal`,
      })),
    ),
  );

const partyCases = (
  allowed: { borrower: boolean; lender: boolean },
  standing: Standing,
) => [
  ...(allowed.borrower
    ? inactiveCases(borrower, "borrower", request, standing)
    : []),
  ...(allowed.lender ? inactiveCases(owner, "lender", request, standing) : []),
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
  standing: Standing = "account_inactive",
) => policyMatrix(policy, partyCases(allowed, standing));

/**
 * PS-LOAN-015: a co-owner of the circle while the responsible lender is
 * established as unavailable may confirm the lender side's receipt; the
 * role never lifts a party beyond their own side.
 */
const receiverCases = <R extends LoanReceiptResource>(
  resource: R,
  expected: { borrower: "allow" | DenialReason },
) => [
  expectCase(
    "a co-owner in the narrow receipt role",
    coOwner,
    { ...resource, receivesForLender: true },
    "allow",
  ),
  expectCase(
    "the borrower is still only their own side",
    borrower,
    { ...resource, receivesForLender: true },
    expected.borrower,
  ),
];

/**
 * PS-LOAN-014–015: a return statement belongs to one side; the other party
 * may not say it for them. A co-owner in the narrow receipt role confirms
 * the lender side's receipt (the loader grants the role for `received`
 * only).
 */
const returnMatrix = policyMatrix(reportReturnPolicy, [
  ...(["borrower", "lender"] as const).flatMap((side) =>
    loanCases<LoanReturnResource>(
      { ...loan, side, receivesForLender: false },
      { borrower: side === "borrower", lender: side === "lender" },
    ).map((testCase) => ({
      ...testCase,
      name: `${testCase.name}, on a ${side}'s statement`,
    })),
  ),
  ...receiverCases<LoanReturnResource>(
    { ...loan, side: "lender", receivesForLender: false },
    { borrower: "forbidden" },
  ),
]);

/** PS-LOAN-016: the parties, and a co-owner undoing their own receipt. */
const undoMatrix = policyMatrix(undoReturnPolicy, [
  ...loanCases<LoanReceiptResource>(
    { ...loan, receivesForLender: false },
    { borrower: true, lender: true },
  ),
  ...receiverCases<LoanReceiptResource>(
    { ...loan, receivesForLender: false },
    { borrower: "allow" },
  ),
]);

const takeover = (
  standing: LoanTakeoverResource["standing"],
  lenderUnavailable: boolean,
): LoanTakeoverResource => ({ ...loan, standing, lenderUnavailable });

/**
 * PS-LOAN-009: a co-owner who can step in takes over only while the
 * responsible lender is established as unavailable; otherwise the loan
 * stays invisible to them. The parties may not.
 */
const takeoverMatrix = policyMatrix(takeOverResponsibilityPolicy, [
  expectCase(
    "a co-owner of the circle, the lender unavailable",
    coOwner,
    takeover("circle", true),
    "allow",
  ),
  expectCase(
    "a later co-owner, the lender unavailable",
    coOwner,
    takeover("later", true),
    "allow",
  ),
  expectCase(
    "a co-owner while the lender is available",
    coOwner,
    takeover("circle", false),
    "not_found",
  ),
  expectCase(
    "someone who cannot step in (not an owner, or blocked with the borrower)",
    stranger,
    takeover(null, true),
    "not_found",
  ),
  expectCase(
    "the responsible lender",
    owner,
    takeover(null, true),
    "forbidden",
  ),
  expectCase("the borrower", borrower, takeover(null, true), "forbidden"),
  ...callerCases(takeover("circle", true)),
]);

const transfer = (
  kind: "voluntary" | "takeover",
  needsBorrowerConsent: boolean,
): ResponsibilityTransferResource => ({
  ...loan,
  transfer: {
    kind,
    fromUserId: owner.userId,
    toUserId: coOwner.userId,
    needsBorrowerConsent,
  },
});

const transferShapes = [
  ["voluntary", false, "an offer to a co-owner of the circle"],
  ["voluntary", true, "an offer to a later co-owner"],
  ["takeover", true, "a later co-owner's takeover"],
] as const;

/**
 * PS-LOAN-009: on each kind of open transfer, `allowed` act; everyone else
 * it concerns may not, and to anyone else it does not exist.
 */
const transferMatrix = (
  policy: Policy<ResponsibilityTransferResource, void>,
  allowed: (
    kind: "voluntary" | "takeover",
    needsBorrowerConsent: boolean,
  ) => { borrower: boolean; lender: boolean; recipient: boolean },
) =>
  policyMatrix(policy, [
    ...transferShapes.flatMap(([kind, consent, shape]) => {
      const resource = transfer(kind, consent);
      const may = allowed(kind, consent);
      const outcome = (yes: boolean) => (yes ? "allow" : "forbidden");

      return [
        expectCase(
          `the borrower, on ${shape}`,
          borrower,
          resource,
          outcome(may.borrower),
        ),
        expectCase(
          `the responsible lender, on ${shape}`,
          owner,
          resource,
          outcome(may.lender),
        ),
        expectCase(
          `the recipient, on ${shape}`,
          coOwner,
          resource,
          outcome(may.recipient),
        ),
        expectCase(`anyone else, on ${shape}`, stranger, resource, "not_found"),
      ];
    }),
    ...callerCases(transfer("voluntary", false)),
  ]);

/** The recipient answers an offer; the borrower answers when asked. */
const answerers = (kind: "voluntary" | "takeover", consent: boolean) => ({
  borrower: consent,
  lender: false,
  recipient: kind === "voluntary",
});

/** A scheduled job, or a process acting on `resource`, runs only as itself. */
const processMatrix = <R = void>(
  policy: Policy<R, void>,
  process: string,
  resource = undefined as R,
) =>
  policyMatrix(policy, [
    expectCase(
      `the ${process} process`,
      systemActor(process),
      resource,
      "allow",
    ),
    expectCase(
      "another system process",
      systemActor("outbox.worker"),
      resource,
      "forbidden",
    ),
    expectCase("a party of a loan", borrower, resource, "forbidden"),
    expectCase(
      "an account that has not completed registration",
      pendingAccount,
      resource,
      "forbidden",
    ),
  ]);

/**
 * PS-LOAN-019: any current owner confirms having the object back after the
 * loan ended unresolved; the borrower never does. On any other loan, only
 * its responsible lender learns that there is nothing to confirm.
 */
const controlLoan = (endedUnresolved: boolean): LoanControlResource => ({
  ...loan,
  ownerIds: [owner.userId, coOwner.userId],
  endedUnresolved,
});

const controlMatrix = policyMatrix(confirmLoanControlPolicy, [
  expectCase("the responsible lender", owner, controlLoan(true), "allow"),
  expectCase(
    "a co-owner who is not a party",
    coOwner,
    controlLoan(true),
    "allow",
  ),
  expectCase("the borrower", borrower, controlLoan(true), "forbidden"),
  expectCase(
    "someone who no longer owns the object",
    stranger,
    controlLoan(true),
    "not_found",
  ),
  expectCase(
    "the lender of a loan that did not end unresolved",
    owner,
    controlLoan(false),
    "allow",
  ),
  expectCase(
    "a co-owner of a loan that did not end unresolved does not see it",
    coOwner,
    controlLoan(false),
    "not_found",
  ),
  ...inactiveCases(owner, "responsible lender", controlLoan(true), "allow"),
  ...inactiveCases(coOwner, "co-owner", controlLoan(true), "allow"),
  ...callerCases(controlLoan(true)),
]);

export const loanMatrices = [
  policyMatrix(createLoanRequestPolicy, targetCases),
  policyMatrix(previewLoanRequestPolicy, targetCases),
  partyMatrix(readLoanRequestPolicy, { borrower: true, lender: true }, "allow"),
  partyMatrix(withdrawLoanRequestPolicy, { borrower: true, lender: false }),
  partyMatrix(declineLoanRequestPolicy, { borrower: false, lender: true }),
  partyMatrix(approveLoanRequestPolicy, { borrower: false, lender: true }),
  partyMatrix(confirmLoanTermsPolicy, { borrower: true, lender: false }),
  partyMatrix(acceptResponsibilityPolicy, { borrower: true, lender: true }),
  policyMatrix(listLoanRequestsPolicy, [
    expectCase("a signed-in user", borrower, undefined, "allow"),
    ...inactiveCases(borrower, "user", undefined, "allow"),
    ...callerCases(undefined),
  ]),
  loanPartyMatrix(readLoanPolicy),
  loanPartyMatrix(cancelLoanPolicy),
  loanPartyMatrix(proposeLoanAmendmentPolicy, "account_inactive"),
  amendmentMatrix(acceptLoanAmendmentPolicy, "other", "account_inactive"),
  amendmentMatrix(declineLoanAmendmentPolicy, "other"),
  amendmentMatrix(withdrawLoanAmendmentPolicy, "proposer"),
  loanPartyMatrix(reportHandoverPolicy),
  processMatrix(concludeHandoversPolicy, handoverProcess),
  returnMatrix,
  undoMatrix,
  processMatrix(concludeReturnsPolicy, returnProcess),
  policyMatrix(
    offerResponsibilityPolicy,
    loanCases(loan, { borrower: false, lender: true }),
  ),
  takeoverMatrix,
  transferMatrix(acceptResponsibilityTransferPolicy, answerers),
  transferMatrix(declineResponsibilityTransferPolicy, answerers),
  transferMatrix(withdrawResponsibilityTransferPolicy, (kind) => ({
    borrower: false,
    lender: kind === "voluntary",
    recipient: kind === "takeover",
  })),
  policyMatrix(listCoOwnerLoansPolicy, [
    expectCase("a signed-in user", coOwner, undefined, "allow"),
    ...callerCases(undefined),
  ]),
  loanPartyMatrix(requestLoanMediationPolicy),
  processMatrix(endLoanUnresolvedPolicy, unresolvedEndingProcess, loan),
  controlMatrix,
];

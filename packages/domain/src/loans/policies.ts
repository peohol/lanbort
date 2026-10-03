import type { LoanRequestRole } from "@lanbort/contracts";
import type { Actor } from "../actor";
import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireSystemProcess,
} from "../authorization/rules";

/**
 * An object someone wants to request through an origin. `reachable` is
 * decided by the loader with the same rules as discovery: through an
 * environment, the caller finds the object there now (WP-25, PS-ENV-009);
 * directly, the caller is a friend of an owner (PS-LOAN-001); either way the
 * object takes new loans and no block stands between the caller and any
 * owner (PS-USR-006).
 */
export interface LoanRequestTarget {
  readonly ownerIds: readonly string[];
  readonly reachable: boolean;
}

/**
 * Owners do not borrow their own object. Anyone who cannot reach it gets
 * `not_found`, as if it did not exist.
 */
const mayRequest: ResourceRule<LoanRequestTarget, void> = ({
  actor,
  resource,
}) => {
  if (actor.kind === "user" && resource.ownerIds.includes(actor.userId)) {
    return deny("forbidden");
  }

  return resource.reachable ? allow : deny("not_found");
};

function targetPolicy(action: string) {
  return definePolicy<LoanRequestTarget, void>({
    action,
    actor: [requireActiveAccount],
    resource: [mayRequest],
  });
}

/** PS-LOAN-001/004: sending a request. */
export const createLoanRequestPolicy = targetPolicy("loan_request.create");

/** What a request would be for: the object and the terms to confirm. */
export const previewLoanRequestPolicy = targetPolicy("loan_request.preview");

/**
 * A request and who may act on it. `lenderIds` are the owners who may see it
 * as lenders now: ownership alone is not enough, the owner also needs the
 * borrower's relation to the origin (docs/architecture/04, `visibleToLender`).
 */
export interface LoanRequestResource {
  readonly borrowerUserId: string;
  readonly lenderIds: readonly string[];
}

export function roleOf(
  actor: Actor,
  resource: LoanRequestResource,
): LoanRequestRole | null {
  if (actor.kind !== "user") {
    return null;
  }

  if (actor.userId === resource.borrowerUserId) {
    return "borrower";
  }

  return resource.lenderIds.includes(actor.userId) ? "lender" : null;
}

/**
 * Only the given side may act. The other side learns that it may not
 * (`forbidden`); to everyone else the request does not exist.
 */
function asParty(
  roles: readonly LoanRequestRole[],
): ResourceRule<LoanRequestResource, void> {
  return ({ actor, resource }) => {
    const role = roleOf(actor, resource);

    if (role === null) {
      return deny("not_found");
    }

    return roles.includes(role) ? allow : deny("forbidden");
  };
}

function partyPolicy(action: string, roles: readonly LoanRequestRole[]) {
  return definePolicy<LoanRequestResource, void>({
    action,
    actor: [requireActiveAccount],
    resource: [asParty(roles)],
  });
}

export const readLoanRequestPolicy = partyPolicy("loan_request.read", [
  "borrower",
  "lender",
]);

/** The borrower takes their own request back. */
export const withdrawLoanRequestPolicy = partyPolicy("loan_request.withdraw", [
  "borrower",
]);

/**
 * Any owner who sees the request may decline it: limiting new commitments is
 * every co-owner's right (vision «Uenighet mellom medeiere om framtidig
 * utlån»).
 */
export const declineLoanRequestPolicy = partyPolicy("loan_request.decline", [
  "lender",
]);

/**
 * PS-LOAN-006/008: any owner who sees the request may approve it, and
 * becomes its responsible lender.
 */
export const approveLoanRequestPolicy = partyPolicy("loan_request.approve", [
  "lender",
]);

/** PS-LOAN-005: only the borrower confirms changed terms. */
export const confirmLoanTermsPolicy = partyPolicy(
  "loan_request.confirm_terms",
  ["borrower"],
);

/** PS-LOAN-003: both parties accept the declaration themselves. */
export const acceptResponsibilityPolicy = partyPolicy(
  "loan_request.accept_responsibility",
  ["borrower", "lender"],
);

/** The caller's own requests, as borrower or as lender. */
export const listLoanRequestsPolicy = definePolicy<unknown, void>({
  action: "loan_request.list",
  actor: [requireActiveAccount],
});

/**
 * The parties of a loan: its borrower and its responsible lender
 * (PS-LOAN-008). They keep what the loan needs whatever happens to the
 * friendship or membership it came from (PS-LOAN-002).
 */
export interface LoanResource {
  readonly borrowerUserId: string;
  readonly responsibleLenderId: string;
}

/** The user's side of the loan, or null if they are not a party. */
export function partyRole(
  resource: LoanResource,
  userId: string,
): LoanRequestRole | null {
  if (userId === resource.borrowerUserId) {
    return "borrower";
  }

  return userId === resource.responsibleLenderId ? "lender" : null;
}

export function loanRoleOf(
  actor: Actor,
  resource: LoanResource,
): LoanRequestRole | null {
  return actor.kind === "user" ? partyRole(resource, actor.userId) : null;
}

/**
 * Only the parties see the loan or act on it; to everyone else, other
 * co-owners included, it does not exist. A party is allowed `sides`: the
 * other side learns that it may not (`forbidden`).
 */
function asLoanParty<R extends LoanResource>(
  sides: (resource: R) => readonly LoanRequestRole[],
): ResourceRule<R, void> {
  return ({ actor, resource }) => {
    const role = loanRoleOf(actor, resource);

    if (role === null) {
      return deny("not_found");
    }

    return sides(resource).includes(role) ? allow : deny("forbidden");
  };
}

const bothSides = () => ["borrower", "lender"] as const;

function loanPartyPolicy<R extends LoanResource>(
  action: string,
  sides: (resource: R) => readonly LoanRequestRole[],
) {
  return definePolicy<R, void>({
    action,
    actor: [requireActiveAccount],
    resource: [asLoanParty(sides)],
  });
}

/** The loan and its agreement, for its parties only; others do not see it. */
export const readLoanPolicy = loanPartyPolicy<LoanResource>(
  "loan.read",
  bothSides,
);

/**
 * PS-LOAN-011: either party cancels on their own. Owning the object is not
 * enough: other co-owners are not parties of the loan.
 */
export const cancelLoanPolicy = loanPartyPolicy<LoanResource>(
  "loan.cancel",
  bothSides,
);

/** PS-LOAN-010: either party proposes a change. */
export const proposeLoanAmendmentPolicy = loanPartyPolicy<LoanResource>(
  "loan.propose_amendment",
  bothSides,
);

/** A proposal on a loan, with the side that made it. */
export interface LoanAmendmentResource extends LoanResource {
  readonly proposerRole: LoanRequestRole;
}

const otherSide = ({ proposerRole }: LoanAmendmentResource) =>
  [proposerRole === "borrower" ? "lender" : "borrower"] as const;

const proposingSide = ({ proposerRole }: LoanAmendmentResource) =>
  [proposerRole] as const;

/**
 * PS-LOAN-010: a change takes effect only with the other party's consent,
 * so only they accept or decline it; nobody agrees with themselves.
 */
export const acceptLoanAmendmentPolicy = loanPartyPolicy<LoanAmendmentResource>(
  "loan.accept_amendment",
  otherSide,
);

export const declineLoanAmendmentPolicy =
  loanPartyPolicy<LoanAmendmentResource>("loan.decline_amendment", otherSide);

/** The proposing side takes its proposal back. */
export const withdrawLoanAmendmentPolicy =
  loanPartyPolicy<LoanAmendmentResource>(
    "loan.withdraw_amendment",
    proposingSide,
  );

/**
 * PS-LOAN-012–013: either party says whether the object was handed over.
 * Only the parties: another co-owner was not there for the loan.
 */
export const reportHandoverPolicy = loanPartyPolicy<LoanResource>(
  "loan.report_handover",
  bothSides,
);

/**
 * The scheduled job that ends loans as not completed when a «not handed
 * over» statement went unanswered past its deadline (PS-LOAN-012).
 */
export const handoverProcess = "loan.handovers";

export const concludeHandoversPolicy = definePolicy({
  action: "loan.conclude_handovers",
  actor: [requireSystemProcess(handoverProcess)],
});

/** A return statement on a loan, with the side that statement belongs to. */
export interface LoanReturnResource extends LoanResource {
  readonly side: LoanRequestRole;
}

/**
 * PS-LOAN-014–015: each side says its own statements: the borrower that it
 * was returned or that they still have it, the responsible lender that it
 * was received or not. Only the responsible lender's receipt ends the loan;
 * another co-owner is not a party (the narrow receipt by a co-owner comes
 * with WP-35).
 */
export const reportReturnPolicy = loanPartyPolicy<LoanReturnResource>(
  "loan.report_return",
  ({ side }) => [side],
);

/** PS-LOAN-016: each party undoes only their own waiting confirmation. */
export const undoReturnPolicy = loanPartyPolicy<LoanResource>(
  "loan.undo_return",
  bothSides,
);

/**
 * The scheduled job that makes return confirmations whose undo buffer is
 * over (PS-LOAN-016).
 */
export const returnProcess = "loan.returns";

export const concludeReturnsPolicy = definePolicy({
  action: "loan.conclude_returns",
  actor: [requireSystemProcess(returnProcess)],
});

export const loanRequestPolicies = [
  createLoanRequestPolicy,
  previewLoanRequestPolicy,
  readLoanRequestPolicy,
  withdrawLoanRequestPolicy,
  declineLoanRequestPolicy,
  approveLoanRequestPolicy,
  confirmLoanTermsPolicy,
  acceptResponsibilityPolicy,
  listLoanRequestsPolicy,
  readLoanPolicy,
  cancelLoanPolicy,
  proposeLoanAmendmentPolicy,
  acceptLoanAmendmentPolicy,
  declineLoanAmendmentPolicy,
  withdrawLoanAmendmentPolicy,
  reportHandoverPolicy,
  concludeHandoversPolicy,
  reportReturnPolicy,
  undoReturnPolicy,
  concludeReturnsPolicy,
];

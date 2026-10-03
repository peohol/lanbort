import type { LoanRequestRole } from "@lanbort/contracts";
import type { Actor } from "../actor";
import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireActiveAccount } from "../authorization/rules";

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
 * utlån»). Approving is WP-31's.
 */
export const declineLoanRequestPolicy = partyPolicy("loan_request.decline", [
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

export const loanRequestPolicies = [
  createLoanRequestPolicy,
  previewLoanRequestPolicy,
  readLoanRequestPolicy,
  withdrawLoanRequestPolicy,
  declineLoanRequestPolicy,
  confirmLoanTermsPolicy,
  acceptResponsibilityPolicy,
  listLoanRequestsPolicy,
];

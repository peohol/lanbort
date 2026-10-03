import type { LoanRequestRole } from "@lanbort/contracts";
import type { Actor } from "../actor";
import {
  type ActorRule,
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireMinimumAccess,
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

function partyPolicy(
  action: string,
  roles: readonly LoanRequestRole[],
  standing: ActorRule = requireActiveAccount,
) {
  return definePolicy<LoanRequestResource, void>({
    action,
    actor: [standing],
    resource: [asParty(roles)],
  });
}

/**
 * A party sees the request also while their account is not active: an
 * approved request is part of their loan (PS-ADM-002).
 */
export const readLoanRequestPolicy = partyPolicy(
  "loan_request.read",
  ["borrower", "lender"],
  requireMinimumAccess,
);

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

/**
 * The caller's own requests, as borrower or as lender, also while their
 * account is not active (PS-ADM-002): they lead to the caller's loans.
 */
export const listLoanRequestsPolicy = definePolicy<unknown, void>({
  action: "loan_request.list",
  actor: [requireMinimumAccess],
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

/**
 * PS-LOAN-021, PS-ADM-002: the account standing that keeps what an existing
 * loan needs to be finished or handed on: seeing it, saying what happened at
 * the handover and the return, cancelling it, handing the lender's role on,
 * and declining or withdrawing what was proposed. Friendship, membership,
 * publication and blocks never take these away (the loaders check none of
 * them). A deactivated, dormant, suspended or closing account keeps exactly
 * these actions (PS-ADM-002–003, `requireMinimumAccess`), and nothing that
 * makes a new commitment (proposing or accepting a change, taking a role on).
 */
export const requireLoanStanding: ActorRule = requireMinimumAccess;

function loanPartyPolicy<R extends LoanResource>(
  action: string,
  sides: (resource: R) => readonly LoanRequestRole[],
  standing: ActorRule = requireActiveAccount,
) {
  return definePolicy<R, void>({
    action,
    actor: [standing],
    resource: [asLoanParty(sides)],
  });
}

/** The loan and its agreement, for its parties only; others do not see it. */
export const readLoanPolicy = loanPartyPolicy<LoanResource>(
  "loan.read",
  bothSides,
  requireLoanStanding,
);

/**
 * PS-LOAN-011: either party cancels on their own. Owning the object is not
 * enough: other co-owners are not parties of the loan.
 */
export const cancelLoanPolicy = loanPartyPolicy<LoanResource>(
  "loan.cancel",
  bothSides,
  requireLoanStanding,
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
  loanPartyPolicy<LoanAmendmentResource>(
    "loan.decline_amendment",
    otherSide,
    requireLoanStanding,
  );

/** The proposing side takes its proposal back. */
export const withdrawLoanAmendmentPolicy =
  loanPartyPolicy<LoanAmendmentResource>(
    "loan.withdraw_amendment",
    proposingSide,
    requireLoanStanding,
  );

/**
 * PS-LOAN-012–013: either party says whether the object was handed over.
 * Only the parties: another co-owner was not there for the loan.
 */
export const reportHandoverPolicy = loanPartyPolicy<LoanResource>(
  "loan.report_handover",
  bothSides,
  requireLoanStanding,
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

/**
 * A loan with whether the caller, who is not its party, may confirm the
 * receipt for the lender's side: a co-owner who owned the object at
 * approval, while the responsible lender is established as really
 * unavailable (PS-LOAN-015, `app.loan_receives_for_lender`).
 */
export interface LoanReceiptResource extends LoanResource {
  readonly receivesForLender: boolean;
}

/**
 * The parties as `sides` allows, and a co-owner in the narrow receipt role.
 * To any other co-owner the loan still does not exist.
 */
function asPartyOrReceiver<R extends LoanReceiptResource>(
  sides: (resource: R) => readonly LoanRequestRole[],
): ResourceRule<R, void> {
  const asParty = asLoanParty(sides);

  return (input) =>
    loanRoleOf(input.actor, input.resource) === null &&
    input.resource.receivesForLender
      ? allow
      : asParty(input);
}

/**
 * A return statement on a loan, with the side that statement belongs to.
 * `receivesForLender` holds only for the lender's receipt.
 */
export interface LoanReturnResource extends LoanReceiptResource {
  readonly side: LoanRequestRole;
}

/**
 * PS-LOAN-014–015: each side says its own statements: the borrower that it
 * was returned or that they still have it, the responsible lender that it
 * was received or not. Only the lender side's receipt ends the loan. While
 * the responsible lender is established as unavailable, a co-owner of the
 * circle may confirm that receipt without becoming responsible; ownership
 * alone is never enough.
 */
export const reportReturnPolicy = definePolicy<LoanReturnResource, void>({
  action: "loan.report_return",
  actor: [requireLoanStanding],
  resource: [asPartyOrReceiver(({ side }) => [side])],
});

/**
 * PS-LOAN-016: each party, or a co-owner in the narrow receipt role, undoes
 * only their own waiting confirmation.
 */
export const undoReturnPolicy = definePolicy<LoanReceiptResource, void>({
  action: "loan.undo_return",
  actor: [requireLoanStanding],
  resource: [asPartyOrReceiver(bothSides)],
});

/**
 * The scheduled job that makes return confirmations whose undo buffer is
 * over (PS-LOAN-016).
 */
export const returnProcess = "loan.returns";

export const concludeReturnsPolicy = definePolicy({
  action: "loan.conclude_returns",
  actor: [requireSystemProcess(returnProcess)],
});

/** PS-LOAN-009: the responsible lender offers the role to a co-owner. */
export const offerResponsibilityPolicy = loanPartyPolicy<LoanResource>(
  "loan.offer_responsibility",
  () => ["lender"],
  requireLoanStanding,
);

/**
 * A loan with what the caller could do for its lender side
 * (`app.loan_co_owner_standing`): null when they cannot step in at all.
 */
export interface LoanTakeoverResource extends LoanResource {
  readonly standing: "circle" | "later" | null;
  readonly lenderUnavailable: boolean;
}

/**
 * PS-LOAN-009: a co-owner who can step in takes the role over, only while
 * the responsible lender is established as really unavailable. The parties
 * learn that they may not; to anyone else, other co-owners included, the
 * loan does not exist.
 */
const mayTakeOver: ResourceRule<LoanTakeoverResource, void> = ({
  actor,
  resource,
}) => {
  if (loanRoleOf(actor, resource) !== null) {
    return deny("forbidden");
  }

  return resource.standing !== null && resource.lenderUnavailable
    ? allow
    : deny("not_found");
};

export const takeOverResponsibilityPolicy = definePolicy<
  LoanTakeoverResource,
  void
>({
  action: "loan.take_over_responsibility",
  actor: [requireActiveAccount],
  resource: [mayTakeOver],
});

/** An open change of the responsible lender and the loan it is on. */
export interface ResponsibilityTransferResource extends LoanResource {
  readonly transfer: {
    readonly kind: "voluntary" | "takeover";
    readonly fromUserId: string;
    readonly toUserId: string;
    readonly needsBorrowerConsent: boolean;
  };
}

/** Who answers the transfer: the recipient of an offer, the borrower when asked. */
export function transferAnswerers({
  borrowerUserId,
  transfer,
}: ResponsibilityTransferResource): string[] {
  return [
    ...(transfer.kind === "voluntary" ? [transfer.toUserId] : []),
    ...(transfer.needsBorrowerConsent ? [borrowerUserId] : []),
  ];
}

/** Who proposed it: the lender who offers the role, or the co-owner taking it. */
export const transferProposer = ({
  transfer,
}: ResponsibilityTransferResource) =>
  transfer.kind === "voluntary" ? transfer.fromUserId : transfer.toUserId;

/**
 * Only `allowed` act on the transfer. Everyone it concerns (the parties and
 * the recipient) learns that they may not; to anyone else it does not exist.
 */
function onTransfer(
  allowed: (resource: ResponsibilityTransferResource) => readonly string[],
): ResourceRule<ResponsibilityTransferResource, void> {
  return ({ actor, resource }) => {
    if (actor.kind !== "user") {
      return deny("not_found");
    }

    if (allowed(resource).includes(actor.userId)) {
      return allow;
    }

    const concerned = [
      resource.borrowerUserId,
      resource.responsibleLenderId,
      resource.transfer.fromUserId,
      resource.transfer.toUserId,
    ];

    return concerned.includes(actor.userId)
      ? deny("forbidden")
      : deny("not_found");
  };
}

/**
 * PS-LOAN-009: the recipient accepts the role offered to them (nobody is
 * made responsible against their will), and the borrower consents when a
 * co-owner who joined after the approval steps in.
 */
export const acceptResponsibilityTransferPolicy = definePolicy<
  ResponsibilityTransferResource,
  void
>({
  action: "loan.accept_responsibility_transfer",
  actor: [requireActiveAccount],
  resource: [onTransfer(transferAnswerers)],
});

/** The same answerers may say no. */
export const declineResponsibilityTransferPolicy = definePolicy<
  ResponsibilityTransferResource,
  void
>({
  action: "loan.decline_responsibility_transfer",
  actor: [requireLoanStanding],
  resource: [onTransfer(transferAnswerers)],
});

/** Whoever proposed the transfer takes it back. */
export const withdrawResponsibilityTransferPolicy = definePolicy<
  ResponsibilityTransferResource,
  void
>({
  action: "loan.withdraw_responsibility_transfer",
  actor: [requireLoanStanding],
  resource: [onTransfer((resource) => [transferProposer(resource)])],
});

/**
 * A co-owner's own list of loans they may act on without being a party
 * (PS-LOAN-009, PS-LOAN-015).
 */
export const listCoOwnerLoansPolicy = definePolicy<unknown, void>({
  action: "loan.list_for_co_owner",
  actor: [requireActiveAccount],
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
  offerResponsibilityPolicy,
  takeOverResponsibilityPolicy,
  acceptResponsibilityTransferPolicy,
  declineResponsibilityTransferPolicy,
  withdrawResponsibilityTransferPolicy,
  listCoOwnerLoansPolicy,
];

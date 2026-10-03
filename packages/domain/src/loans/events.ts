import {
  loanRequestEndReasonSchema,
  loanRequestRoleSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/**
 * Loan request events carry ids, versions and codes only: never the message,
 * the desired dates or the terms. The resource is the request; the payload
 * names its object so later consumers (Phase 4 notifications) can act on it.
 * The database ends requests neutrally when access is lost (PS-LOAN-002);
 * those endings are recorded on the request itself, like WP-25's
 * publications. Endings the domain decides, such as a colliding approval
 * (PS-LOAN-007), are events, still without saying whose request won.
 */
const loanRequestEvent = <Shape extends z.ZodRawShape>(
  type: string,
  extra: Shape,
) =>
  defineEvent({
    type: `loan_request.${type}`,
    version: 1,
    kind: "domain",
    resourceType: "loan_request",
    payload: z.strictObject({ objectId: z.uuid(), ...extra }),
  });

/** PS-LOAN-001: the origin is part of the request from the start. */
export const loanRequestCreated = loanRequestEvent("created", {
  origin: z.enum(["environment", "direct"]),
  environmentId: z.uuid().nullable(),
  termsVersion: z.int().min(1),
});

export const loanRequestWithdrawn = loanRequestEvent("withdrawn", {});

export const loanRequestDeclined = loanRequestEvent("declined", {});

/** PS-LOAN-005: the borrower confirmed the terms as of this version. */
export const loanRequestTermsConfirmed = loanRequestEvent("terms_confirmed", {
  termsVersion: z.int().min(1),
});

/** PS-LOAN-003: a party accepted the responsibility declaration. */
export const loanRequestResponsibilityAccepted = loanRequestEvent(
  "responsibility_accepted",
  {
    role: loanRequestRoleSchema,
    declarationVersion: z.int().min(1),
  },
);

/** PS-LOAN-006: the request became this loan. */
export const loanRequestApproved = loanRequestEvent("approved", {
  loanId: z.uuid(),
});

/** The domain ended an open request neutrally (PS-LOAN-007). */
export const loanRequestEnded = loanRequestEvent("ended", {
  reason: loanRequestEndReasonSchema.extract(["period_unavailable"]),
});

/**
 * Loan events carry ids and versions only, like requests': never the
 * period, the terms or the agreement's content. The resource is the loan.
 */
const loanEvent = <Shape extends z.ZodRawShape>(type: string, extra: Shape) =>
  defineEvent({
    type: `loan.${type}`,
    version: 1,
    kind: "domain",
    resourceType: "loan",
    payload: z.strictObject({ objectId: z.uuid(), ...extra }),
  });

/**
 * PS-LOAN-006/008: approved and reserved, with its agreement. The actor is
 * the approver, who is the responsible lender.
 */
export const loanReserved = loanEvent("reserved", {
  requestId: z.uuid(),
  agreementVersion: z.int().min(1),
});

/**
 * PS-LOAN-011: a party cancelled the reserved loan before the handover. The
 * actor is that party; `role` says which side they were on.
 */
export const loanCancelled = loanEvent("cancelled", {
  role: loanRequestRoleSchema,
});

const amendmentId = z.uuid();

/** PS-LOAN-010: a party proposed a change on top of `baseVersion`. */
export const loanAmendmentProposed = loanEvent("amendment_proposed", {
  amendmentId,
  baseVersion: z.int().min(1),
});

/** The other party agreed: the change is `agreementVersion` now. */
export const loanAmendmentAccepted = loanEvent("amendment_accepted", {
  amendmentId,
  agreementVersion: z.int().min(2),
});

/** The other party said no; the agreement stands as it was. */
export const loanAmendmentDeclined = loanEvent("amendment_declined", {
  amendmentId,
});

/** The proposer took the proposal back. */
export const loanAmendmentWithdrawn = loanEvent("amendment_withdrawn", {
  amendmentId,
});

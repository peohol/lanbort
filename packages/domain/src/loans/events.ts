import { loanRequestRoleSchema } from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/**
 * Loan request events carry ids, versions and codes only: never the message,
 * the desired dates or the terms. The resource is the request; the payload
 * names its object so later consumers (Phase 4 notifications) can act on it.
 * The database ends requests neutrally when access is lost (PS-LOAN-002);
 * those endings are recorded on the request itself, like WP-25's
 * publications.
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

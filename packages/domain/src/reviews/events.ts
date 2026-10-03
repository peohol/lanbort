import { loanRequestRoleSchema } from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/**
 * Review events carry ids and codes only: never the scores or the text. The
 * resource is the review; the payload names its loan and the author's side,
 * so later consumers (WP-40 notifications) can tell the other party. Windows
 * open, pause and open again with the loan, whose own events say so
 * (`loan.cancelled`, `loan.not_completed`, `loan.returned`,
 * `loan.return_disputed`).
 */
const reviewEvent = <Shape extends z.ZodRawShape>(type: string, extra: Shape) =>
  defineEvent({
    type: `loan_review.${type}`,
    version: 1,
    kind: "domain",
    resourceType: "loan_review",
    payload: z.strictObject({
      loanId: z.uuid(),
      authorRole: loanRequestRoleSchema,
      ...extra,
    }),
  });

/** PS-TRUST-003: a party reviewed the other; it is hidden for now. */
export const loanReviewSubmitted = reviewEvent("submitted", {});

/** PS-TRUST-004: its author revised the hidden review to `version`. */
export const loanReviewRevised = reviewEvent("revised", {
  version: z.int().min(2),
});

/**
 * PS-TRUST-003: the review is published, because both parties had reviewed
 * (`both_submitted`, both at once) or the window was over (`deadline`).
 */
export const loanReviewPublished = reviewEvent("published", {
  basis: z.enum(["both_submitted", "deadline"]),
});

/** PS-TRUST-005: the reviewed party gave their one response. */
export const loanReviewResponded = reviewEvent("responded", {});

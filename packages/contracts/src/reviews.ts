import { z } from "zod";
import {
  loanEndReasonSchema,
  loanIdSchema,
  loanRequestRoleSchema,
} from "./loans";
import { multilineText } from "./objects";

/**
 * Reviews after a loan (WP-50, PS-TRUST-001–005). When a loan ends, its
 * borrower and responsible lender may review each other on the dimensions
 * the ending lets them assess, within a window of 14 days. A review stays
 * hidden until both have reviewed or the window is over, and is locked once
 * published; the reviewed party may give one response.
 */
export const loanReviewIdSchema = z.uuid();

/**
 * What a review scores, as a code (`pickup_on_time`, `communication`, …). The
 * dimensions are data on the server; which apply depends on the side and on
 * how the loan ended (PS-TRUST-001).
 */
export const reviewDimensionSchema = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);

/** PS-TRUST-002: 1–5 on each dimension. */
export const reviewScoreSchema = z.int().min(1).max(5);

/**
 * Free text of a review or a response. A review needs one short combined
 * explanation when any score is 1 or 2 (PS-TRUST-002); otherwise it is
 * optional.
 */
export const reviewTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .regex(multilineText);

const scoresSchema = z
  .array(
    z.strictObject({
      dimension: reviewDimensionSchema,
      score: reviewScoreSchema,
    }),
  )
  .min(1)
  .max(20)
  .refine(
    (scores) =>
      new Set(scores.map(({ dimension }) => dimension)).size === scores.length,
    { message: "Each dimension once" },
  );

/**
 * The caller reviews the other party of an ended loan, scoring every
 * dimension of the window. While it is hidden, the caller may revise it by
 * sending it again with the version they saw (`expectedVersion`).
 */
export const submitLoanReviewSchema = z.strictObject({
  loanId: loanIdSchema,
  scores: scoresSchema,
  text: reviewTextSchema.nullable().optional(),
  expectedVersion: z.int().min(1).optional(),
});

/**
 * - `hidden`: only its author sees it, until the window closes.
 * - `published`: both parties see it, and it never changes.
 */
export const loanReviewStatusSchema = z.enum(["hidden", "published"]);

export const loanReviewResultSchema = z.strictObject({
  loanId: loanIdSchema,
  reviewId: loanReviewIdSchema,
  version: z.int(),
  status: loanReviewStatusSchema,
});

/** PS-TRUST-005: the reviewed party's one response to the review about them. */
export const respondToLoanReviewSchema = z.strictObject({
  loanId: loanIdSchema,
  text: reviewTextSchema,
});

export const loanReviewResponseResultSchema = z.strictObject({
  loanId: loanIdSchema,
  reviewId: loanReviewIdSchema,
  respondedAt: z.iso.datetime(),
});

export const loanReviewsQuerySchema = z.strictObject({ loanId: loanIdSchema });

/**
 * The review window of an ended loan:
 * - `open`: the parties may review until `dueAt`.
 * - `paused`: the loan reopened before publication (PS-TRUST-008); nothing
 *   is published or reviewed until it ends again, with a new window.
 * - `closed`: the reviews that were given are published.
 * `basis` is how the loan ended, which decides the dimensions.
 */
export const loanReviewWindowSchema = z.strictObject({
  status: z.enum(["open", "paused", "closed"]),
  basis: loanEndReasonSchema,
  dueAt: z.iso.datetime().nullable(),
  /** What the caller scores, in order. */
  dimensions: z.array(reviewDimensionSchema),
});

export const loanReviewSchema = z.strictObject({
  id: loanReviewIdSchema,
  authorRole: loanRequestRoleSchema,
  status: loanReviewStatusSchema,
  version: z.int(),
  scores: z.array(
    z.strictObject({
      dimension: reviewDimensionSchema,
      score: reviewScoreSchema,
      /**
       * PS-TRUST-008: the score rests on the return, and a confirmed return
       * was contradicted after the review was published.
       */
      contested: z.boolean(),
    }),
  ),
  text: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  /** When the loan reopened after the review was published, if it did. */
  loanReopenedAt: z.iso.datetime().nullable(),
  response: z
    .strictObject({ text: z.string(), respondedAt: z.iso.datetime() })
    .nullable(),
});

/**
 * The reviews of one loan as one of its parties sees them: the window, their
 * own review (hidden or published), and the other party's review of them
 * once it is published.
 */
export const loanReviewsSchema = z.strictObject({
  loanId: loanIdSchema,
  role: loanRequestRoleSchema,
  /** Null until the loan has ended. */
  window: loanReviewWindowSchema.nullable(),
  own: loanReviewSchema.nullable(),
  received: loanReviewSchema.nullable(),
});

/**
 * A review the caller may still write: the loan's window is open and they
 * have not reviewed the other party yet (PS-TRUST-002–003). The title is
 * the object's in the loan's agreement.
 */
export const pendingLoanReviewSchema = z.strictObject({
  loanId: loanIdSchema,
  role: loanRequestRoleSchema,
  title: z.string(),
  dueAt: z.iso.datetime().nullable(),
});

export const pendingLoanReviewListSchema = z.strictObject({
  reviews: z.array(pendingLoanReviewSchema),
});

export type SubmitLoanReview = z.infer<typeof submitLoanReviewSchema>;
export type LoanReviewStatus = z.infer<typeof loanReviewStatusSchema>;
export type LoanReviewResult = z.infer<typeof loanReviewResultSchema>;
export type RespondToLoanReview = z.infer<typeof respondToLoanReviewSchema>;
export type LoanReviewResponseResult = z.infer<
  typeof loanReviewResponseResultSchema
>;
export type LoanReviewWindow = z.infer<typeof loanReviewWindowSchema>;
export type LoanReview = z.infer<typeof loanReviewSchema>;
export type LoanReviews = z.infer<typeof loanReviewsSchema>;
export type PendingLoanReview = z.infer<typeof pendingLoanReviewSchema>;
export type PendingLoanReviewList = z.infer<typeof pendingLoanReviewListSchema>;

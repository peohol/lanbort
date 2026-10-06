import { z } from "zod";
import { loanEndReasonSchema, loanRequestRoleSchema } from "./loans";
import { profileIdSchema } from "./social";
import {
  loanReviewIdSchema,
  reviewDimensionSchema,
  reviewScoreSchema,
} from "./reviews";

/**
 * Contextual trust (WP-51, PS-TRUST-006–012). A person's trust profile is
 * what others have said about them in published reviews, kept apart by the
 * role they had in the loan, and the reviews themselves as far as the reader
 * may see them. There is no overall score of the person, no ranking, and
 * nothing from reports or blocks.
 */

/** The profile lists its reviews a page at a time. */
export const trustReviewPageSize = 20;

/**
 * The trust profile of `userId`, for themselves or for someone with
 * legitimate access to their profile. `role` narrows the reviews listed to
 * those about them in that role; `cursor` is the last review of the previous
 * page.
 */
export const trustProfileQuerySchema = z.strictObject({
  userId: z.uuid(),
  role: loanRequestRoleSchema.optional(),
  cursor: loanReviewIdSchema.optional(),
});

/**
 * What the published scores on one dimension say (PS-TRUST-006/012): how
 * many there are, their plain mean and how they are spread over 1–5, so a
 * few scores never look as certain as many. `setAside` counts scores left out
 * because they rest on a return that was contradicted after publication
 * (PS-TRUST-008).
 */
export const dimensionTrustSchema = z.strictObject({
  dimension: reviewDimensionSchema,
  count: z.int().min(0),
  /** Null without scores; otherwise rounded to two decimals. */
  mean: z.number().min(1).max(5).nullable(),
  /** The number of scores of 1, 2, 3, 4 and 5. */
  distribution: z.array(z.int().min(0)).length(5),
  setAside: z.int().min(0),
});

/** The experience others had with the person in one role. */
export const roleTrustSchema = z.strictObject({
  /** Published reviews of the person in this role: one per loan. */
  reviews: z.int().min(0),
  /** The dimensions reviewers of this role score, in order. */
  dimensions: z.array(dimensionTrustSchema),
});

/**
 * A published review about the person as the reader may see it
 * (PS-TRUST-007). `author` is null when the author no longer has a profile;
 * `environment` names where the loan was made only when the reader may see
 * that environment.
 */
export const profileReviewSchema = z.strictObject({
  id: loanReviewIdSchema,
  /** The person's role in the loan: what the review is about. */
  subjectRole: loanRequestRoleSchema,
  /** How the loan ended, which decided what could be reviewed. */
  basis: loanEndReasonSchema,
  author: z
    .strictObject({
      userId: z.uuid(),
      realName: z.string(),
      profileId: profileIdSchema,
    })
    .nullable(),
  environment: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  scores: z.array(
    z.strictObject({
      dimension: reviewDimensionSchema,
      score: reviewScoreSchema,
      contested: z.boolean(),
    }),
  ),
  text: z.string().nullable(),
  publishedAt: z.iso.datetime(),
  loanReopenedAt: z.iso.datetime().nullable(),
  response: z
    .strictObject({ text: z.string(), respondedAt: z.iso.datetime() })
    .nullable(),
});

export const trustProfileSchema = z.strictObject({
  userId: z.uuid(),
  /** As a borrower: what lenders said. */
  asBorrower: roleTrustSchema,
  /** As a lender: what borrowers said. */
  asLender: roleTrustSchema,
  /** Newest first, a page at a time. */
  reviews: z.array(profileReviewSchema),
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: loanReviewIdSchema.nullable(),
});

export type TrustProfileQuery = z.infer<typeof trustProfileQuerySchema>;
export type DimensionTrust = z.infer<typeof dimensionTrustSchema>;
export type RoleTrust = z.infer<typeof roleTrustSchema>;
export type ProfileReview = z.infer<typeof profileReviewSchema>;
export type TrustProfile = z.infer<typeof trustProfileSchema>;

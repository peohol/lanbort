import { z } from "zod";
import { caseEntryBodySchema, caseIdSchema, partyStatement } from "./cases";
import { loanIdSchema } from "./loans";
import { objectIdSchema } from "./objects";
import { loanReviewIdSchema, reviewDimensionSchema } from "./reviews";

/**
 * Moderation (WP-52, PS-TRUST-013–016). A report is a case: it starts an
 * assessment and says nothing about guilt. The environment's administrators
 * moderate locally; the platform stewards handle platform rules, serious
 * abuse and global safety or legality. Whoever a report is about never
 * learns of it through the case.
 */

/**
 * An active member reports another member, or an object published in the
 * environment, to its administrators, with what happened.
 */
export const reportInEnvironmentSchema = z.strictObject({
  environmentId: z.uuid(),
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("user"), userId: z.uuid() }),
    z.strictObject({ kind: z.literal("object"), objectId: objectIdSchema }),
  ]),
  ...partyStatement,
});

/** A user reports a user, an object, a review or a response to the platform. */
export const reportToPlatformSchema = z.strictObject({
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("user"), userId: z.uuid() }),
    z.strictObject({ kind: z.literal("object"), objectId: objectIdSchema }),
    z.strictObject({
      kind: z.literal("review"),
      reviewId: loanReviewIdSchema,
    }),
    z.strictObject({
      kind: z.literal("review_response"),
      reviewId: loanReviewIdSchema,
    }),
  ]),
  ...partyStatement,
});

/**
 * The acting handler of an environment report takes it to the platform, as a
 * separate report about the same target with what they add (PS-TRUST-016:
 * a local measure has no global effect without its own basis).
 */
export const escalateReportSchema = z.strictObject({
  caseId: caseIdSchema,
  body: caseEntryBodySchema,
});

/**
 * - `publication_rejected` / `publication_blocked`: the reported object's
 *   publication in the environment only (PS-OBJ-017).
 * - `object_blocked` / `object_unblocked`: the object takes no new loans
 *   anywhere and is left out of discovery until a steward lifts it; loans
 *   already approved go on.
 * - `review_removed`: the review no longer stands anywhere (PS-TRUST-014).
 * - `review_text_removed`: its text goes, its scores stand (PS-TRUST-015).
 * - `review_score_removed`: one score (`dimension`) goes, the rest stand.
 * - `review_response_removed`: the response's text goes.
 */
export const moderationMeasureKindSchema = z.enum([
  "publication_rejected",
  "publication_blocked",
  "object_blocked",
  "object_unblocked",
  "review_removed",
  "review_text_removed",
  "review_score_removed",
  "review_response_removed",
]);

/**
 * The measures that lift an earlier one: they hit nobody, and those the
 * earlier one hit are told, as plain information, that it no longer applies
 * (PS-TRUST-018).
 */
export const liftingMeasureKinds: ReadonlySet<ModerationMeasureKind> = new Set([
  "object_unblocked",
]);

export const moderationScopeSchema = z.enum(["environment", "platform"]);

/** The reason a measure is taken on, recorded with it (PS-TRUST-016). */
export const moderationReasonSchema = z.string().trim().min(1).max(2000);

/**
 * The acting handler of an open report takes a measure on what it is about,
 * with the reason. `dimension` names the score a `review_score_removed`
 * takes out.
 */
export const takeModerationMeasureSchema = z.strictObject({
  caseId: caseIdSchema,
  measure: moderationMeasureKindSchema,
  dimension: reviewDimensionSchema.optional(),
  reason: moderationReasonSchema,
});

export const moderationMeasureIdSchema = z.uuid();

export const moderationMeasureResultSchema = z.strictObject({
  caseId: caseIdSchema,
  measureId: moderationMeasureIdSchema,
  measure: moderationMeasureKindSchema,
});

/**
 * A measure as the handlers see it: what it concerns, its scope, its reason,
 * who decided it and when, and what it removed (internal moderation
 * history, PS-TRUST-014).
 */
export const moderationMeasureSchema = z.strictObject({
  id: moderationMeasureIdSchema,
  kind: moderationMeasureKindSchema,
  scope: moderationScopeSchema,
  environmentId: z.uuid().nullable(),
  objectId: objectIdSchema.nullable(),
  reviewId: loanReviewIdSchema.nullable(),
  dimension: reviewDimensionSchema.nullable(),
  reason: z.string(),
  decidedByUserId: z.uuid(),
  decidedAt: z.iso.datetime(),
  removedText: z.string().nullable(),
  removedScore: z.int().nullable(),
});

/** The notice to whoever a measure hits (PS-TRUST-018). */
export const measureNoticeQuerySchema = z.strictObject({
  measureId: moderationMeasureIdSchema,
});

/**
 * A measure as the owner or author it hits sees it: what was done, where it
 * applies and why, with the thing or the loan it concerns. Never that there
 * was a report, who sent it, who decided, or anything else from the case.
 */
export const measureNoticeSchema = z.strictObject({
  id: moderationMeasureIdSchema,
  kind: moderationMeasureKindSchema,
  scope: moderationScopeSchema,
  environmentId: z.uuid().nullable(),
  objectId: objectIdSchema.nullable(),
  /** The thing's title, while it exists. */
  objectTitle: z.string().nullable(),
  /** The loan a reviewed measure concerns. */
  loanId: loanIdSchema.nullable(),
  dimension: reviewDimensionSchema.nullable(),
  reason: z.string(),
  decidedAt: z.iso.datetime(),
});

export type ReportInEnvironment = z.infer<typeof reportInEnvironmentSchema>;
export type ReportToPlatform = z.infer<typeof reportToPlatformSchema>;
/** The measures taken on one report, oldest first; for its handlers. */
export const caseMeasuresQuerySchema = z.strictObject({ caseId: caseIdSchema });

export const caseMeasuresSchema = z.strictObject({
  caseId: caseIdSchema,
  items: z.array(moderationMeasureSchema),
});

export type ModerationMeasureKind = z.infer<typeof moderationMeasureKindSchema>;
export type ModerationScope = z.infer<typeof moderationScopeSchema>;
export type TakeModerationMeasure = z.infer<typeof takeModerationMeasureSchema>;
export type ModerationMeasureResult = z.infer<
  typeof moderationMeasureResultSchema
>;
export type ModerationMeasure = z.infer<typeof moderationMeasureSchema>;
export type CaseMeasures = z.infer<typeof caseMeasuresSchema>;
export type MeasureNotice = z.infer<typeof measureNoticeSchema>;

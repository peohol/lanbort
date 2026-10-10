import {
  measureNoticeKindSchema,
  moderationScopeSchema,
  reviewDimensionSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/**
 * Moderation events carry ids and codes only: never the reason, what was
 * removed, or who a report is about. A report itself is a case, so opening
 * one is `case.opened`. What a handler decides is administrative and must be
 * verifiable afterwards (`audit`); the measure's full record, with its
 * reason, is `app.moderation_actions`.
 */

/**
 * PS-TRUST-016: a measure was taken on a report, or, with no case, an
 * administrator ended a membership (PS-ENV-021).
 */
export const moderationMeasureTaken = defineEvent({
  type: "moderation.measure_taken",
  version: 1,
  kind: "audit",
  resourceType: "moderation_measure",
  payload: z.strictObject({
    caseId: z.uuid().nullable(),
    measure: measureNoticeKindSchema,
    scope: moderationScopeSchema,
    environmentId: z.uuid().nullable(),
    objectId: z.uuid().nullable(),
    reviewId: z.uuid().nullable(),
    dimension: reviewDimensionSchema.nullable(),
  }),
});

/**
 * An administrator took an environment report to the platform, as a
 * separate report (PS-TRUST-016).
 */
export const moderationReportEscalated = defineEvent({
  type: "moderation.report_escalated",
  version: 1,
  kind: "audit",
  resourceType: "case",
  payload: z.strictObject({
    environmentId: z.uuid(),
    platformCaseId: z.uuid(),
  }),
});

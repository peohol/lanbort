import { z } from "zod";
import { loanIdSchema } from "./loans";
import { multilineText } from "./objects";

/**
 * Administrative cases (WP-45, PS-COM-010–015). A case is a governed process
 * with explicit access; it is neither a notification nor private chat
 * (PS-COM-001), and it belongs to a function, not to the person handling it.
 */
export const caseIdSchema = z.uuid();
export const caseEntryIdSchema = z.uuid();

/**
 * - `environment_contact`: a member contacts the environment's administrators
 *   as a function (PS-COM-010).
 * - `loan_mediation`: a party of a loan that came through an environment asks
 *   its administrators to mediate a disagreement about the handover or the
 *   return. The administrator mediates and decides nothing about who is
 *   right (vision 05).
 * - `unavailability_report`: a confidential report that a user may have died
 *   or be permanently unavailable. Only platform stewards handle it, and it
 *   changes no account, loan or access by itself (PS-COM-015).
 * - `environment_report` / `platform_report`: a report to the environment's
 *   administrators or to the platform stewards (WP-52, moderation.ts).
 */
export const caseKindSchema = z.enum([
  "environment_contact",
  "loan_mediation",
  "unavailability_report",
  "environment_report",
  "platform_report",
]);

export const caseStatusSchema = z.enum(["open", "closed"]);

/**
 * What a moderation report is about: a user, an object, a published review
 * about the reporter, or the response to a review the reporter wrote.
 */
export const reportTargetKindSchema = z.enum([
  "user",
  "object",
  "review",
  "review_response",
]);

/** Who a participant is in the case. */
export const caseParticipantRoleSchema = z.enum([
  "requester",
  "borrower",
  "lender",
  "reporter",
]);

/**
 * Who sees an entry: every participant (`parties`; in a mediation the other
 * party only once a handler has shared the statements), one participant
 * (`party`), or the handlers only (`handlers`, an internal note).
 */
export const caseAudienceSchema = z.enum(["parties", "party", "handlers"]);

/** Whether an entry was written by a participant or by a handler. */
export const caseCapacitySchema = z.enum(["party", "handler"]);

/**
 * How a participant sees the handling: a handler has taken the case
 * (`assigned`), it waits in the queue (`queued`), or nobody can handle it
 * now (`unavailable`, UX-EXC-009: there is no escalation to offer instead).
 */
export const caseHandlingSchema = z.enum(["assigned", "queued", "unavailable"]);

export const caseActionKindSchema = z.enum([
  "assigned",
  "released",
  "returned_to_queue",
  "round_opened",
  "statements_shared",
  "recused",
  "closed",
]);

/**
 * Why a case went back to the queue without its handler giving it back: their
 * account is no longer active, they became involved in it, their role ended,
 * or their membership did.
 */
export const caseQueueReturnReasonSchema = z.enum([
  "account_inactive",
  "involved",
  "role_ended",
  "membership_ended",
]);

export const caseEntryBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .regex(multilineText);

/** PS-COM-010: a member writes to the environment's administrators. */
export const openEnvironmentContactSchema = z.strictObject({
  environmentId: z.uuid(),
  body: caseEntryBodySchema,
});

/** A party asks for mediation of the loan, with their first statement. */
export const openLoanMediationSchema = z.strictObject({
  loanId: loanIdSchema,
  body: caseEntryBodySchema,
});

/** PS-COM-015: a report about `userId`, with what the reporter knows. */
export const reportUnavailabilitySchema = z.strictObject({
  userId: z.uuid(),
  body: caseEntryBodySchema,
});

/**
 * The case the caller wrote in: a new one, or their open one of the same
 * kind and context (`created: false`), so nobody has to start over.
 */
export const caseOpenedResultSchema = z.strictObject({
  caseId: caseIdSchema,
  entryId: caseEntryIdSchema,
  created: z.boolean(),
});

/**
 * Something written in a case. A participant writes to the case and gives
 * no audience. A handler names the audience, and `toUserId` with `party`.
 * `correctsEntryId` names the caller's own earlier entry this corrects; the
 * original stays as it was (PS-COM-014).
 */
export const writeCaseEntrySchema = z.strictObject({
  caseId: caseIdSchema,
  body: caseEntryBodySchema,
  audience: caseAudienceSchema.optional(),
  toUserId: z.uuid().optional(),
  correctsEntryId: caseEntryIdSchema.optional(),
});

export const caseEntryResultSchema = z.strictObject({
  caseId: caseIdSchema,
  entryId: caseEntryIdSchema,
});

export const caseReferenceSchema = z.strictObject({ caseId: caseIdSchema });

/** The responsible handler hands the case to another handler. */
export const transferCaseSchema = z.strictObject({
  caseId: caseIdSchema,
  toUserId: z.uuid(),
});

/** A new writing round for one participant, or for all without `userId`. */
export const openCaseRoundSchema = z.strictObject({
  caseId: caseIdSchema,
  userId: z.uuid().optional(),
});

/** A handler's action, with the case's state after it. */
export const caseActionResultSchema = z.strictObject({
  caseId: caseIdSchema,
  status: caseStatusSchema,
  assigneeUserId: z.uuid().nullable(),
});

export const caseEntrySchema = z.strictObject({
  id: caseEntryIdSchema,
  capacity: caseCapacitySchema,
  /** Null for a handler's entry as participants see it: it is the function's. */
  authorUserId: z.uuid().nullable(),
  audience: caseAudienceSchema,
  /** The participant a `party` entry is for. */
  toUserId: z.uuid().nullable(),
  /** Whether every participant sees it. */
  shared: z.boolean(),
  body: z.string(),
  correctsEntryId: caseEntryIdSchema.nullable(),
  createdAt: z.iso.datetime(),
});

/** What a handler did; only handlers see it. */
export const caseActionSchema = z.strictObject({
  kind: caseActionKindSchema,
  /** Null when the system returned the case to the queue. */
  actorUserId: z.uuid().nullable(),
  targetUserId: z.uuid().nullable(),
  /** Why, when the system returned the case to the queue. */
  reason: caseQueueReturnReasonSchema.nullable(),
  at: z.iso.datetime(),
});

export const caseParticipantSchema = z.strictObject({
  userId: z.uuid(),
  role: caseParticipantRoleSchema,
  mayWrite: z.boolean(),
});

/**
 * A case as the caller sees it: as a participant (`party`), only what was
 * written for them and whether it is handled; as a handler, all of it with
 * its history. The user a report is about never sees it.
 */
export const caseSchema = z.strictObject({
  id: caseIdSchema,
  kind: caseKindSchema,
  status: caseStatusSchema,
  viewer: caseCapacitySchema,
  environmentId: z.uuid().nullable(),
  loanId: loanIdSchema.nullable(),
  /**
   * The user a report is about (for a reported review or response, its
   * author), for its reporter and its handlers.
   */
  subjectUserId: z.uuid().nullable(),
  /** What a moderation report is about; null for other kinds. */
  reportTarget: reportTargetKindSchema.nullable(),
  objectId: z.uuid().nullable(),
  reviewId: z.uuid().nullable(),
  /** The environment report a platform report was escalated from. */
  escalatedFromCaseId: caseIdSchema.nullable(),
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  handling: caseHandlingSchema,
  /** The responsible handler; handlers only. */
  assigneeUserId: z.uuid().nullable(),
  /** The caller may write now. */
  mayWrite: z.boolean(),
  participants: z.array(caseParticipantSchema),
  entries: z.array(caseEntrySchema),
  history: z.array(caseActionSchema),
});

export const caseSummarySchema = z.strictObject({
  id: caseIdSchema,
  kind: caseKindSchema,
  status: caseStatusSchema,
  environmentId: z.uuid().nullable(),
  loanId: loanIdSchema.nullable(),
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  handling: caseHandlingSchema,
  /** The responsible handler; in the handlers' queue only. */
  assigneeUserId: z.uuid().nullable(),
});

export const casePageSize = 50;

const casePage = { cursor: caseIdSchema.optional() };

/** The caller's own cases, as a participant. */
export const caseListQuerySchema = z.strictObject(casePage);

/** The cases of the environment the caller may handle. */
export const environmentCaseQueueQuerySchema = z.strictObject({
  environmentId: z.uuid(),
  status: caseStatusSchema.default("open"),
  ...casePage,
});

/** The platform's cases (reports) the caller may handle as a steward. */
export const platformCaseQueueQuerySchema = z.strictObject({
  status: caseStatusSchema.default("open"),
  ...casePage,
});

export const caseListSchema = z.strictObject({
  items: z.array(caseSummarySchema),
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: caseIdSchema.nullable(),
});

export type CaseKind = z.infer<typeof caseKindSchema>;
export type CaseStatus = z.infer<typeof caseStatusSchema>;
export type ReportTargetKind = z.infer<typeof reportTargetKindSchema>;
export type CaseParticipantRole = z.infer<typeof caseParticipantRoleSchema>;
export type CaseAudience = z.infer<typeof caseAudienceSchema>;
export type CaseCapacity = z.infer<typeof caseCapacitySchema>;
export type CaseHandling = z.infer<typeof caseHandlingSchema>;
export type CaseActionKind = z.infer<typeof caseActionKindSchema>;
export type CaseQueueReturnReason = z.infer<typeof caseQueueReturnReasonSchema>;
export type WriteCaseEntry = z.infer<typeof writeCaseEntrySchema>;
export type CaseOpenedResult = z.infer<typeof caseOpenedResultSchema>;
export type CaseEntryResult = z.infer<typeof caseEntryResultSchema>;
export type CaseActionResult = z.infer<typeof caseActionResultSchema>;
export type CaseEntry = z.infer<typeof caseEntrySchema>;
export type Case = z.infer<typeof caseSchema>;
export type CaseSummary = z.infer<typeof caseSummarySchema>;
export type CaseList = z.infer<typeof caseListSchema>;

import { z } from "zod";
import { environmentTypeSchema } from "./environment";
import {
  availabilityIntervalSchema,
  calendarDateSchema,
  multilineText,
  objectCategoryIdSchema,
  objectIdSchema,
} from "./objects";

/**
 * Loan requests (WP-30, PS-LOAN-001–005). A request through an environment
 * and a direct request between friends are the same request; where it came
 * from is kept as its origin, never as a separate kind of loan.
 */
export const loanRequestIdSchema = z.uuid();

/**
 * The version of the responsibility declaration both parties of a direct
 * friend loan must accept (PS-LOAN-003, vision «Ansvarserklæring ved direkte
 * vennelån»). It is raised when the wording changes; an acceptance always
 * names the version it was given for.
 */
export const responsibilityDeclarationVersion = 1;

export const loanRequestOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("environment"), environmentId: z.uuid() }),
  z.strictObject({ kind: z.literal("direct") }),
]);

/** PS-LOAN-004: a start date, or «så snart som mulig». */
export const desiredStartSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("asap") }),
  z.strictObject({ kind: z.literal("date"), date: calendarDateSchema }),
]);

/** Technical upper bound on a duration, not a product rule. */
export const loanRequestMaxDays = 3650;

/**
 * PS-LOAN-004: the last day (inclusive), or a duration in days. Never both,
 * so the same time is not asked for twice (UX-JRN-004).
 */
export const desiredEndSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("date"), date: calendarDateSchema }),
  z.strictObject({
    kind: z.literal("duration"),
    days: z.int().min(1).max(loanRequestMaxDays),
  }),
]);

export const loanRequestMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .regex(multilineText);

/** An object version: the terms the borrower saw and confirmed (PS-LOAN-005). */
const termsVersionSchema = z.int().min(1);

/**
 * Sends a request for an object the caller found through `origin`.
 * `termsVersion` is the object version whose terms the caller saw. A direct
 * request also needs the caller's acceptance of the responsibility
 * declaration (PS-LOAN-003); a request through an environment has none.
 */
export const createLoanRequestSchema = z
  .strictObject({
    objectId: objectIdSchema,
    origin: loanRequestOriginSchema,
    start: desiredStartSchema,
    end: desiredEndSchema,
    message: loanRequestMessageSchema,
    termsVersion: termsVersionSchema,
    responsibilityDeclarationVersion: z.int().min(1).optional(),
  })
  .refine(
    ({ start, end }) =>
      start.kind !== "date" || end.kind !== "date" || end.date >= start.date,
    { path: ["end"] },
  )
  .refine(
    ({ origin, responsibilityDeclarationVersion }) =>
      (origin.kind === "direct") ===
      (responsibilityDeclarationVersion !== undefined),
    { path: ["responsibilityDeclarationVersion"] },
  );

export const loanRequestReferenceSchema = z.strictObject({
  requestId: loanRequestIdSchema,
});

/** The borrower confirms the object's terms as of `termsVersion`. */
export const confirmLoanTermsSchema = z.strictObject({
  requestId: loanRequestIdSchema,
  termsVersion: termsVersionSchema,
});

/** A party accepts the responsibility declaration for this request. */
export const acceptResponsibilitySchema = z.strictObject({
  requestId: loanRequestIdSchema,
  declarationVersion: z.int().min(1),
});

/**
 * - `requested`: waits for the owners' answer («forespurt»).
 * - `approved`: an owner approved it; it is a loan now (WP-31).
 * - `awaiting_terms_confirmation`: the terms changed after the borrower
 *   confirmed them; it cannot be approved until they confirm the new ones.
 * - `on_hold`: the environment holds it (its publication waits for approval,
 *   or the environment is winding down) («administrativt satt på vent»).
 * - `ended`: declined, withdrawn or ended neutrally; see `endReason`.
 */
export const loanRequestStatusSchema = z.enum([
  "requested",
  "awaiting_terms_confirmation",
  "on_hold",
  "approved",
  "ended",
]);

/**
 * Why a request ended. The neutral reasons never say who did what:
 * - `access_lost`: the borrower's access through the origin is gone (left the
 *   environment, the friendship ended, or a block between the parties).
 * - `publication_ended`: the object is no longer published there.
 * - `object_unavailable`: archived, frozen, deleted, or no longer someone
 *   else's.
 * - `period_unavailable`: another request was approved for a colliding
 *   period (PS-LOAN-007).
 */
export const loanRequestEndReasonSchema = z.enum([
  "withdrawn",
  "declined",
  "access_lost",
  "publication_ended",
  "object_unavailable",
  "period_unavailable",
]);

export const loanRequestResultSchema = z.strictObject({
  requestId: loanRequestIdSchema,
  status: loanRequestStatusSchema,
});

/** Whose side of the request the caller is on (UX: «låner» / «låner bort»). */
export const loanRequestRoleSchema = z.enum(["borrower", "lender"]);

/** Lists come newest first, a page at a time. */
export const loanRequestPageSize = 50;

export const loanRequestListQuerySchema = z.strictObject({
  role: loanRequestRoleSchema,
  cursor: loanRequestIdSchema.optional(),
});

export const loanRequestReadQuerySchema = loanRequestReferenceSchema;

/**
 * What the caller would request through an origin: the object's content and
 * the version of the terms to confirm. Without `environmentId` the origin is
 * direct, between friends.
 */
export const loanRequestPreviewQuerySchema = z.strictObject({
  objectId: objectIdSchema,
  environmentId: z.uuid().optional(),
});

export const loanRequestPreviewSchema = z.strictObject({
  objectId: objectIdSchema,
  title: z.string(),
  categoryId: objectCategoryIdSchema,
  description: z.string(),
  loanTerms: z.string().nullable(),
  /** Send this as `termsVersion` when requesting. */
  termsVersion: z.int(),
  effectiveAvailability: z.array(availabilityIntervalSchema),
  availableForNewLoans: z.boolean(),
  /** The declaration to accept for a direct request, null otherwise. */
  responsibilityDeclarationVersion: z.int().nullable(),
});

/** The terms of one object version. */
const termsSchema = z.strictObject({
  version: z.int(),
  loanTerms: z.string().nullable(),
});

/** A request as its borrower or a lender sees it. */
export const loanRequestSchema = z.strictObject({
  id: loanRequestIdSchema,
  /** Null once the object is deleted; the request has ended then. */
  objectId: objectIdSchema.nullable(),
  role: loanRequestRoleSchema,
  borrowerUserId: z.uuid(),
  /**
   * The environment is named only to those who can still see it, and not
   * where its history is private to them (PS-ENV-009).
   */
  origin: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("environment"),
      environment: z
        .strictObject({
          id: z.uuid(),
          type: environmentTypeSchema,
          name: z.string(),
        })
        .nullable(),
    }),
    z.strictObject({ kind: z.literal("direct") }),
  ]),
  start: desiredStartSchema,
  end: desiredEndSchema,
  message: z.string(),
  status: loanRequestStatusSchema,
  endReason: loanRequestEndReasonSchema.nullable(),
  /**
   * The object as of the terms the borrower confirmed. Null, like the
   * terms, once the object is deleted: its content goes with it.
   */
  object: z
    .strictObject({
      title: z.string(),
      categoryId: objectCategoryIdSchema,
    })
    .nullable(),
  confirmedTerms: termsSchema.nullable(),
  /** The current terms while the borrower has to confirm them. */
  pendingTerms: termsSchema.nullable(),
  /** Direct requests only (PS-LOAN-003). */
  responsibility: z
    .strictObject({
      version: z.int(),
      acceptedByBorrower: z.boolean(),
      /** At least one owner accepted it. */
      acceptedByLender: z.boolean(),
      acceptedByYou: z.boolean(),
    })
    .nullable(),
  /** The loan its approval created, once `approved`. */
  loanId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  statusChangedAt: z.iso.datetime(),
});

export const loanRequestListSchema = z.strictObject({
  requests: z.array(loanRequestSchema),
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: loanRequestIdSchema.nullable(),
});

/**
 * The period of a loan: calendar dates, both inclusive, like availability
 * intervals in the API, but always with an end.
 */
export const loanPeriodSchema = z.strictObject({
  start: calendarDateSchema,
  end: calendarDateSchema,
});

export const loanIdSchema = z.uuid();

/**
 * PS-LOAN-006: an owner who sees the request approves it. The period is the
 * one asked for; «as soon as possible» starts on the earliest day the whole
 * period fits. The approver becomes the responsible lender (PS-LOAN-008).
 */
export const approveLoanRequestSchema = loanRequestReferenceSchema;

export const loanApprovalResultSchema = z.strictObject({
  requestId: loanRequestIdSchema,
  loanId: loanIdSchema,
  status: z.literal("approved"),
  period: loanPeriodSchema,
});

/** `reserved`: approved and holding its period («reservert»). */
export const loanStatusSchema = z.enum(["reserved"]);

export const loanReadQuerySchema = z.strictObject({ loanId: loanIdSchema });

/**
 * A loan as its borrower or responsible lender sees it. The agreement is
 * what was approved, as it was then: later changes to the object never
 * change it.
 */
export const loanSchema = z.strictObject({
  id: loanIdSchema,
  requestId: loanRequestIdSchema,
  objectId: objectIdSchema,
  role: loanRequestRoleSchema,
  borrowerUserId: z.uuid(),
  responsibleLenderId: z.uuid(),
  status: loanStatusSchema,
  period: loanPeriodSchema,
  agreement: z.strictObject({
    version: z.int(),
    objectVersion: z.int(),
    title: z.string(),
    categoryId: objectCategoryIdSchema,
    description: z.string(),
    loanTerms: z.string().nullable(),
    /** The declaration both parties accepted; direct loans only. */
    responsibilityDeclarationVersion: z.int().nullable(),
  }),
  approvedAt: z.iso.datetime(),
});

export type LoanRequestOrigin = z.infer<typeof loanRequestOriginSchema>;
export type DesiredStart = z.infer<typeof desiredStartSchema>;
export type DesiredEnd = z.infer<typeof desiredEndSchema>;
export type CreateLoanRequest = z.infer<typeof createLoanRequestSchema>;
export type LoanRequestStatus = z.infer<typeof loanRequestStatusSchema>;
export type LoanRequestEndReason = z.infer<typeof loanRequestEndReasonSchema>;
export type LoanRequestRole = z.infer<typeof loanRequestRoleSchema>;
export type LoanRequestPreview = z.infer<typeof loanRequestPreviewSchema>;
export type LoanRequest = z.infer<typeof loanRequestSchema>;
export type LoanRequestList = z.infer<typeof loanRequestListSchema>;
export type LoanPeriod = z.infer<typeof loanPeriodSchema>;
export type LoanApprovalResult = z.infer<typeof loanApprovalResultSchema>;
export type LoanStatus = z.infer<typeof loanStatusSchema>;
export type Loan = z.infer<typeof loanSchema>;

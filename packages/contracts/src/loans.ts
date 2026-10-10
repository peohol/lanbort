import { z } from "zod";
import { environmentTypeSchema } from "./environment";
import { shownOwnerSchema } from "./publications";
import { personLinkShape } from "./social";
import {
  availabilityIntervalSchema,
  calendarDateSchema,
  multilineText,
  objectCategoryIdSchema,
  objectIdSchema,
  objectImageIdSchema,
  objectImageSchema,
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
    /** Optional, and never end-to-end encrypted (PS-LOAN-004, OD-0015). */
    message: loanRequestMessageSchema.optional(),
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
  /** `open`: only requests that still wait for a decision or the borrower. */
  state: z.enum(["open"]).optional(),
  /** Only the requests for this object. */
  objectId: objectIdSchema.optional(),
  cursor: loanRequestIdSchema.optional(),
});

export const loanRequestReadQuerySchema = loanRequestReferenceSchema;

/** One picture of the request's thing (PS-OBJ-021). */
export const loanRequestImageQuerySchema = z.strictObject({
  requestId: loanRequestIdSchema,
  imageId: objectImageIdSchema,
});

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
  /**
   * Its pictures. Through an environment they are read as there
   * (`environment_object.read_image`).
   */
  images: z.array(objectImageSchema),
  /**
   * The caller follows the object (PS-OBJ-014). Only an object found in an
   * environment can be followed.
   */
  following: z.boolean(),
  /**
   * Through an environment, the owners who are active members of it
   * (PS-ENV-015); empty for a direct request.
   */
  owners: z.array(shownOwnerSchema),
});

/** The terms of one object version. */
const termsSchema = z.strictObject({
  version: z.int(),
  loanTerms: z.string().nullable(),
});

/**
 * A person in a loan as its parties see them (UX-INT-004): by their real
 * name, or null once the account is deleted («Tidligere bruker»,
 * UX-PRIV-010), and their page only while the reader may open it
 * (UX-PRIV-007).
 */
export const loanPersonSchema = z.strictObject({
  realName: z.string().nullable(),
  ...personLinkShape,
});

/**
 * Where a request, and the loan it became, came from (PS-LOAN-001). The
 * environment is named only to those who can still see it, and not where
 * its history is private to them (PS-ENV-009).
 */
export const loanOriginSchema = z.discriminatedUnion("kind", [
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
]);

/** A request as its borrower or a lender sees it. */
export const loanRequestSchema = z.strictObject({
  id: loanRequestIdSchema,
  /** Null once the object is deleted; the request has ended then. */
  objectId: objectIdSchema.nullable(),
  role: loanRequestRoleSchema,
  borrowerUserId: z.uuid(),
  /** The borrower by name, for the lenders who answer (UX-JRN-005). */
  borrower: loanPersonSchema,
  origin: loanOriginSchema,
  start: desiredStartSchema,
  end: desiredEndSchema,
  /**
   * Seen only by the parties, and not end-to-end encrypted (PS-LOAN-004).
   * Null when the borrower wrote none.
   */
  message: z.string().nullable(),
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
  /**
   * The thing's pictures as they are now, not as agreed: whoever sees the
   * thing's name sees its pictures (PS-OBJ-021). Read through
   * `loan_request.read_image`; empty once the object is deleted.
   */
  images: z.array(objectImageSchema),
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
 * One request as its page shows it: for a lender, also what approving it
 * would agree to now (UX-JRN-005). `period` is the period approval would
 * reserve, «as soon as possible» from the earliest day it fits whole, or
 * null when the object is not available for it; `endsOtherRequests` counts
 * the other open requests it would end because they collide (PS-LOAN-007).
 * Null for the borrower, and while the request cannot be approved as it
 * stands.
 */
export const loanRequestDetailSchema = loanRequestSchema.extend({
  approval: z
    .strictObject({
      period: loanPeriodSchema.nullable(),
      endsOtherRequests: z.int().min(0),
    })
    .nullable(),
});

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

/**
 * - `reserved`: approved and holding its period («reservert»).
 * - `awaiting_handover`: the handover day is over and nobody has said yet
 *   whether the object was handed over, or one party says it was not and the
 *   other may still answer («avventer overleveringsavklaring», PS-LOAN-012).
 * - `active`: handed over («utlånt»).
 * - `awaiting_return`: the return day is over, or a party has said
 *   something about the return, and the responsible lender has not
 *   confirmed receiving it («avventer returavklaring», PS-LOAN-014). It
 *   never means late by itself.
 * - `late`: the borrower says they still have the object after the return
 *   day, without an agreed extension («forsinket», PS-LOAN-014).
 * - `disputed`: the parties disagree on whether it was handed over or
 *   returned, or a confirmed return was contradicted later
 *   («usikker/uenighet», PS-LOAN-013, PS-LOAN-017).
 * - `ended`: over; see `endReason` («avsluttet»).
 */
export const loanStatusSchema = z.enum([
  "reserved",
  "awaiting_handover",
  "active",
  "awaiting_return",
  "late",
  "disputed",
  "ended",
]);

/**
 * How a loan ended:
 * - `cancelled`: one of the parties ended it before the handover
 *   (PS-LOAN-011).
 * - `not_completed`: the handover time came, but the object was never
 *   handed over («ikke gjennomført», PS-LOAN-012). It says nothing about
 *   whose fault that was.
 * - `returned`: the responsible lender confirmed receiving the object back
 *   (PS-LOAN-015), possibly before the agreed return day (PS-LOAN-020).
 * - `unresolved`: ended administratively when its handover or return could
 *   not be clarified («avsluttet – administrativt uavklart», PS-LOAN-018).
 *   It says nothing about what happened or who was right.
 * - `stopped`: a platform measure (a party's suspension) stopped it before
 *   its handover day (PS-ADM-003). It is neither party's cancellation, and
 *   it says nothing about why (UX-EXC-007).
 */
export const loanEndReasonSchema = z.enum([
  "cancelled",
  "not_completed",
  "returned",
  "unresolved",
  "stopped",
]);

export const loanReadQuerySchema = z.strictObject({ loanId: loanIdSchema });

/** One picture of the loan's thing (PS-OBJ-021). */
export const loanImageQuerySchema = z.strictObject({
  loanId: loanIdSchema,
  imageId: objectImageIdSchema,
});

export const loanReferenceSchema = loanReadQuerySchema;

/**
 * PS-LOAN-011: either party ends a reserved loan before the handover, on
 * their own, and its period is free again.
 */
export const cancelLoanSchema = loanReferenceSchema;

export const loanCancellationResultSchema = z.strictObject({
  loanId: loanIdSchema,
  status: z.literal("ended"),
  endReason: z.literal("cancelled"),
  /** Which party cancelled: the caller, or the other party who was first. */
  endedBy: loanRequestRoleSchema,
});

/**
 * PS-LOAN-010: a party proposes a new period for the agreement version they
 * saw: a new handover (first day), a new return date (last day), or both.
 * Nothing changes until the other party accepts it.
 */
export const proposeLoanAmendmentSchema = z.strictObject({
  loanId: loanIdSchema,
  agreementVersion: z.int().min(1),
  period: loanPeriodSchema.refine(({ start, end }) => end >= start, {
    path: ["end"],
  }),
});

export const loanAmendmentIdSchema = z.uuid();

/** The other party accepts or declines; the proposer may withdraw. */
export const loanAmendmentReferenceSchema = z.strictObject({
  loanId: loanIdSchema,
  amendmentId: loanAmendmentIdSchema,
});

/**
 * - `proposed`: waits for the other party («venter på svar»).
 * - `accepted`: agreed; it is the agreement's next version.
 * - `declined`: the other party said no; the agreement stands.
 * - `withdrawn`: the proposer took it back.
 * - `lapsed`: the loan ended before anyone answered.
 */
export const loanAmendmentStatusSchema = z.enum([
  "proposed",
  "accepted",
  "declined",
  "withdrawn",
  "lapsed",
]);

export const loanAmendmentResultSchema = z.strictObject({
  loanId: loanIdSchema,
  amendmentId: loanAmendmentIdSchema,
  status: loanAmendmentStatusSchema,
  /** The loan's current agreement version after the command. */
  agreementVersion: z.int(),
});

/** What a party says happened at the handover (PS-LOAN-012). */
export const handoverOutcomeSchema = z.enum(["handed_over", "not_handed_over"]);

/**
 * PS-LOAN-012–013: a party says whether the object was handed over, on the
 * agreement version they saw. Saying it was handed over is possible from the
 * handover day on; saying it was not, once the handover day is over.
 */
export const reportHandoverSchema = z.strictObject({
  loanId: loanIdSchema,
  agreementVersion: z.int().min(1),
  outcome: handoverOutcomeSchema,
});

export const loanHandoverResultSchema = z.strictObject({
  loanId: loanIdSchema,
  /** The loan's status after the statement. */
  status: loanStatusSchema,
  agreementVersion: z.int(),
});

/**
 * What a party says about the return (PS-LOAN-014–015): the borrower that
 * it was `returned` or that they `still_has` it, the responsible lender that
 * it was `received` or `not_received`. Only the lender's receipt ends the
 * loan.
 */
export const returnOutcomeSchema = z.enum([
  "returned",
  "still_has",
  "received",
  "not_received",
]);

/**
 * PS-LOAN-014–017: a party says what happened at the return, on the
 * agreement version they saw. A return confirmation (`returned`,
 * `received`) waits 30 seconds, during which its party can undo it, unless
 * they ask for it `immediately` (PS-LOAN-016); sending it again with
 * `immediately` while it waits makes it at once. The other statements count
 * at once. After the loan ended as returned, a party can still contradict
 * the receipt (`not_received`, `still_has`), which reopens it. While the
 * responsible lender is established as unavailable, a co-owner who owned
 * the object when the loan was approved may confirm the receipt
 * (`received`) for the lender's side without becoming responsible
 * (PS-LOAN-015).
 */
export const reportReturnSchema = z.strictObject({
  loanId: loanIdSchema,
  agreementVersion: z.int().min(1),
  outcome: returnOutcomeSchema,
  immediately: z.boolean().optional(),
});

/** The caller's return confirmation while it can still be undone. */
const pendingReturnSchema = z
  .strictObject({
    outcome: returnOutcomeSchema.extract(["returned", "received"]),
    /** When it is made unless undone first. */
    effectiveAt: z.iso.datetime(),
  })
  .nullable();

/** PS-LOAN-016: the caller takes back their waiting return confirmation. */
export const undoReturnSchema = loanReferenceSchema;

export const loanReturnResultSchema = z.strictObject({
  loanId: loanIdSchema,
  /** The loan's status after the command. */
  status: loanStatusSchema,
  agreementVersion: z.int(),
  pending: pendingReturnSchema,
});

const handoverStatementSchema = z
  .strictObject({
    outcome: handoverOutcomeSchema,
    reportedAt: z.iso.datetime(),
  })
  .nullable();

/**
 * Who made a return statement: the party of its side, or, for the lender's
 * receipt only, a co-owner who confirmed the receipt while the responsible
 * lender was unavailable, without becoming responsible (PS-LOAN-015).
 */
export const returnReporterSchema = z.enum(["party", "co_owner"]);

const returnStatementSchema = z
  .strictObject({
    outcome: returnOutcomeSchema,
    reportedAt: z.iso.datetime(),
    reportedAs: returnReporterSchema,
  })
  .nullable();

export const responsibilityTransferIdSchema = z.uuid();

/**
 * PS-LOAN-009: how the responsible lender changes.
 * - `voluntary`: the responsible lender offered the role to a co-owner.
 * - `takeover`: a co-owner took the role over while the responsible lender
 *   was established as really unavailable.
 */
export const responsibilityTransferKindSchema = z.enum([
  "voluntary",
  "takeover",
]);

/**
 * - `proposed`: waits for the recipient to accept it (voluntary), for the
 *   borrower's consent (a later co-owner), or both.
 * - `completed`: the recipient is the responsible lender now.
 * - `declined`: the recipient or the borrower said no.
 * - `withdrawn`: whoever proposed it took it back.
 * - `lapsed`: it could no longer happen: the loan ended, the role moved, or
 *   the recipient can no longer step in.
 */
export const responsibilityTransferStatusSchema = z.enum([
  "proposed",
  "completed",
  "declined",
  "withdrawn",
  "lapsed",
]);

/**
 * A change of the responsible lender as those it concerns see it. The
 * recipient sees it before they are a party, so it says nothing about the
 * loan beyond who is involved.
 */
export const responsibilityTransferSchema = z.strictObject({
  id: responsibilityTransferIdSchema,
  kind: responsibilityTransferKindSchema,
  fromUserId: z.uuid(),
  toUserId: z.uuid(),
  /** The recipient became a co-owner after the loan was approved. */
  needsBorrowerConsent: z.boolean(),
  recipientAccepted: z.boolean(),
  borrowerConsented: z.boolean(),
  proposedAt: z.iso.datetime(),
});

/**
 * PS-LOAN-009: the responsible lender offers the role to a co-owner. It
 * moves when the co-owner accepts, and, for a co-owner who joined after the
 * loan was approved, when the borrower consents too. The agreement does not
 * change.
 */
export const offerResponsibilitySchema = z.strictObject({
  loanId: loanIdSchema,
  toUserId: z.uuid(),
});

/**
 * PS-LOAN-009: a co-owner takes the role over while the responsible lender
 * is established as really unavailable; a co-owner who joined after the
 * loan was approved also needs the borrower's consent.
 */
export const takeOverResponsibilitySchema = loanReferenceSchema;

/**
 * The recipient accepts or declines an offer, the borrower consents to or
 * declines a later co-owner, and whoever proposed it may withdraw it.
 */
export const responsibilityTransferReferenceSchema = z.strictObject({
  loanId: loanIdSchema,
  transferId: responsibilityTransferIdSchema,
});

export const responsibilityTransferResultSchema = z.strictObject({
  loanId: loanIdSchema,
  transferId: responsibilityTransferIdSchema,
  status: responsibilityTransferStatusSchema,
  /** The loan's responsible lender after the command. */
  responsibleLenderId: z.uuid(),
});

/** PS-LOAN-019: an owner's confirmation of having the object back. */
export const loanControlSchema = z.strictObject({
  confirmedAt: z.iso.datetime().nullable(),
});

/** The loan after its owner confirmed having the object back. */
export const loanControlResultSchema = z.strictObject({
  loanId: loanIdSchema,
  confirmedAt: z.iso.datetime(),
});

/** The loan after it ended as administratively unresolved (PS-LOAN-018). */
export const loanUnresolvedResultSchema = z.strictObject({
  loanId: loanIdSchema,
  endedAt: z.iso.datetime(),
});

const answerSchema = z.enum(["accept", "decline"]);

/**
 * What the caller may do about the loan now, as the domain's own rules
 * decide it (UX-INT-001): only steps that would be accepted are offered.
 * The commands still decide again when they run.
 */
export const loanActionsSchema = z.strictObject({
  /** The handover statements the caller may make (`loan.report_handover`). */
  handover: z.array(handoverOutcomeSchema),
  /** The return statements of the caller's side (`loan.report_return`). */
  return: z.array(returnOutcomeSchema),
  /** The caller's waiting return confirmation can be undone. */
  undoReturn: z.boolean(),
  /**
   * The caller's answers to the other side's proposal: an account that is
   * not active may only decline (PS-ADM-002).
   */
  amendment: z.array(answerSchema),
  /** The borrower's answers to a later co-owner taking over (PS-LOAN-009). */
  responsibility: z.array(answerSchema),
  /** The caller may confirm having the object back (PS-LOAN-019). */
  confirmControl: z.boolean(),
  /**
   * What a new period the caller may propose may change (PS-LOAN-010):
   * `period` before the handover (both days, from today on), `return_day`
   * once it is handed over (only the last day, after today). Null while
   * nothing can be proposed: one proposal waits at a time.
   */
  proposeAmendment: z.enum(["period", "return_day"]).nullable(),
  /** The caller's side made the open proposal and may take it back. */
  withdrawAmendment: z.boolean(),
  /** The caller may cancel the loan before its handover (PS-LOAN-011). */
  cancel: z.boolean(),
  /**
   * The object's other owners the responsible lender may offer the role to
   * (PS-LOAN-009). The offer itself decides whether they can take it, and
   * says no without saying why.
   */
  offerResponsibility: z.array(
    z.strictObject({ userId: z.uuid(), realName: z.string() }),
  ),
  /** The caller offered the role and may take the offer back. */
  withdrawResponsibility: z.boolean(),
  /**
   * The caller may ask the administrators of the environment the loan came
   * through to mediate (`loan.request_mediation`, PS-LOAN-018).
   */
  requestMediation: z.boolean(),
});

/**
 * A loan as its borrower or responsible lender sees it. The agreement is
 * what was approved, as it was then: later changes to the object never
 * change it.
 */
export const loanSchema = z.strictObject({
  id: loanIdSchema,
  requestId: loanRequestIdSchema,
  /**
   * Where its request came from. The environment is named only while the
   * reader can see it (PS-ENV-001), whichever side they are on.
   */
  origin: loanOriginSchema,
  /** Null once an ended loan's object is deleted. */
  objectId: objectIdSchema.nullable(),
  /**
   * The thing's pictures as they are now, not as agreed: whoever sees the
   * thing's name sees its pictures (PS-OBJ-021). Read through
   * `loan.read_image`; empty once the object is deleted.
   */
  images: z.array(objectImageSchema),
  role: loanRequestRoleSchema,
  borrowerUserId: z.uuid(),
  responsibleLenderId: z.uuid(),
  status: loanStatusSchema,
  /** How and when it ended; null while it lasts. */
  ending: z
    .strictObject({
      reason: loanEndReasonSchema,
      /**
       * The party who ended it; null when no party did: not completed, or
       * a co-owner confirmed the receipt for the lender's side.
       */
      endedBy: loanRequestRoleSchema.nullable(),
      endedAt: z.iso.datetime(),
    })
    .nullable(),
  /** The period of the current agreement. */
  period: loanPeriodSchema,
  /** The current agreement: version 1 is the approval, later ones agreed changes. */
  agreement: z.strictObject({
    version: z.int(),
    agreedAt: z.iso.datetime(),
    objectVersion: z.int(),
    title: z.string(),
    categoryId: objectCategoryIdSchema,
    description: z.string(),
    loanTerms: z.string().nullable(),
    /** The declaration both parties accepted; direct loans only. */
    responsibilityDeclarationVersion: z.int().nullable(),
  }),
  /**
   * The open proposal to change the agreement, if any. Whoever did not
   * propose it is the one who accepts or declines it (UX-JRN-005).
   */
  amendment: z
    .strictObject({
      id: loanAmendmentIdSchema,
      period: loanPeriodSchema,
      proposedBy: loanRequestRoleSchema,
      proposedAt: z.iso.datetime(),
    })
    .nullable(),
  /**
   * What each party has said about the handover of the current agreement,
   * if anything. `answerDueAt`: when one party says it was not handed over
   * and the other has not answered, the loan ends as not completed after
   * this time unless the other answers (PS-LOAN-012).
   */
  handover: z.strictObject({
    borrower: handoverStatementSchema,
    lender: handoverStatementSchema,
    answerDueAt: z.iso.datetime().nullable(),
  }),
  /**
   * What each party has said about the return of the current agreement, if
   * anything, and the caller's own confirmation while it can be undone
   * (only the caller sees it).
   */
  return: z.strictObject({
    borrower: returnStatementSchema,
    lender: returnStatementSchema,
    pending: pendingReturnSchema,
  }),
  /** The open change of the responsible lender, if any (PS-LOAN-009). */
  responsibilityTransfer: responsibilityTransferSchema.nullable(),
  /**
   * After the loan ended unresolved: whether an owner has confirmed having
   * the object back, and when (PS-LOAN-019). Until then it takes no new
   * loans. Null for every other loan.
   */
  control: loanControlSchema.nullable(),
  approvedAt: z.iso.datetime(),
  /** The borrower and the responsible lender, by name (UX-INT-004). */
  parties: z.strictObject({
    borrower: loanPersonSchema,
    lender: loanPersonSchema,
  }),
  /**
   * The latest mediation of the loan the caller takes part in, if any
   * (PS-LOAN-018): its case, and whether it is still open.
   */
  mediation: z.strictObject({ caseId: z.uuid(), open: z.boolean() }).nullable(),
  actions: loanActionsSchema,
});

/** Lists come newest first, a page at a time. */
export const loanPageSize = 50;

/**
 * The caller's own loans (UX-IA-006): those that have not ended, or those
 * that have; on one side only, or both. `awaiting_control`: those that
 * ended unresolved and whose object no owner has confirmed having back yet
 * (PS-LOAN-019), so they still ask something of the lender.
 */
export const loanListQuerySchema = z.strictObject({
  state: z.enum(["current", "ended", "awaiting_control"]),
  role: loanRequestRoleSchema.optional(),
  /** Only the loans of this object. */
  objectId: objectIdSchema.optional(),
  /** Only the loans with this person on the other side. */
  counterpartId: z
    .uuid()
    .transform((id) => id.toLowerCase())
    .optional(),
  cursor: loanIdSchema.optional(),
});

export const loanListSchema = z.strictObject({
  loans: z.array(loanSchema),
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: loanIdSchema.nullable(),
});

/** Timeline entries per page, newest first. */
export const loanHistoryPageSize = 50;

/**
 * UX-IA-008, UX-INT-008: a loan's course as its parties may see it, a page
 * at a time; `cursor` is the oldest entry of the page before.
 */
export const loanHistoryQuerySchema = z.strictObject({
  loanId: loanIdSchema,
  cursor: z.uuid().optional(),
});

/**
 * The events of a loan's course that its parties see, from its request on.
 * Administrative and technical events are never part of it.
 */
export const loanHistoryEventSchema = z.enum([
  "requested",
  "terms_confirmed",
  "responsibility_accepted",
  "reserved",
  "cancelled",
  "stopped",
  "amendment_proposed",
  "amendment_accepted",
  "amendment_declined",
  "amendment_withdrawn",
  "handover_reported",
  "handed_over",
  "handover_disputed",
  "not_completed",
  "return_reported",
  "returned",
  "return_disputed",
  "responsibility_proposed",
  "responsibility_answered",
  "responsibility_transferred",
  "responsibility_declined",
  "responsibility_withdrawn",
  "ended_unresolved",
  "control_confirmed",
  "condition_reported",
  "condition_answered",
]);

/**
 * Someone in a loan's timeline: the caller (`you`), its borrower, a
 * responsible lender it has had, or another co-owner of the object. Only the
 * borrower and lenders are named, and nobody whose account is deleted.
 */
export const loanHistoryPersonSchema = z.strictObject({
  you: z.boolean(),
  role: z.enum(["borrower", "lender", "co_owner"]),
  realName: z.string().nullable(),
});

/**
 * One thing that happened, with who did it (null: Lånbort itself, such as
 * a deadline that passed) and when. The other fields say only what the
 * event needs to be understood, never other loans or administrative work.
 */
export const loanHistoryEntrySchema = z.strictObject({
  id: z.uuid(),
  at: z.iso.datetime(),
  event: loanHistoryEventSchema,
  actor: loanHistoryPersonSchema.nullable(),
  /** The side whose statement, acceptance or cancellation it was. */
  side: loanRequestRoleSchema.optional(),
  /** What a handover or return statement said. */
  outcome: z.union([handoverOutcomeSchema, returnOutcomeSchema]).optional(),
  /** A co-owner confirmed the receipt for the lender's side (PS-LOAN-015). */
  byCoOwner: z.boolean().optional(),
  /** Not completed because both said so, or one did and the other was silent. */
  basis: z.enum(["agreed", "unanswered"]).optional(),
  /** Returned before the agreed last day (PS-LOAN-020). */
  early: z.boolean().optional(),
  /** A confirmed return was contradicted later (PS-LOAN-017). */
  reopened: z.boolean().optional(),
  /** The period proposed or agreed by an amendment (PS-LOAN-010). */
  period: loanPeriodSchema.optional(),
  /** A change of the responsible lender (PS-LOAN-009). */
  transfer: z
    .strictObject({
      kind: responsibilityTransferKindSchema,
      from: loanHistoryPersonSchema.nullable(),
      to: loanHistoryPersonSchema,
    })
    .optional(),
  /** Who answered a proposed transfer: its recipient or the borrower. */
  answeredAs: z.enum(["recipient", "borrower"]).optional(),
  /** How a party answered the other's report of damage (PS-LOAN-023). */
  answerKind: z.enum(["disagreement", "explanation"]).optional(),
});

export const loanHistorySchema = z.strictObject({
  entries: z.array(loanHistoryEntrySchema),
  /** Pass as `cursor` for older entries; null on the last page. */
  nextCursor: z.uuid().nullable(),
});

/**
 * PS-LOAN-023: a short, factual description of a concrete damage,
 * deficiency or loss, or of the other party's answer to one. Seen only by
 * the parties; never part of events, notifications or logs.
 */
export const loanConditionTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .regex(multilineText);

export const loanConditionReportIdSchema = z.uuid();

/**
 * PS-LOAN-023: either party registers damage, deficiency or loss, from the
 * handover on and at any time after, also once the loan has ended. It is a
 * traceable statement of who said what: not a status, an accusation, a
 * claim or a trust score, and it never changes or holds up the loan.
 */
export const reportLoanConditionSchema = z.strictObject({
  loanId: loanIdSchema,
  description: loanConditionTextSchema,
});

/** The other party disagrees, or adds their own explanation. */
export const loanConditionAnswerKindSchema = z.enum([
  "disagreement",
  "explanation",
]);

/**
 * PS-LOAN-023: the other party answers a report once, without changing it.
 * Answering is possible whenever the report has no answer yet.
 */
export const answerLoanConditionSchema = z.strictObject({
  loanId: loanIdSchema,
  reportId: loanConditionReportIdSchema,
  kind: loanConditionAnswerKindSchema,
  description: loanConditionTextSchema,
});

export const loanConditionResultSchema = z.strictObject({
  loanId: loanIdSchema,
  /** The report: the new one, or the one answered. */
  reportId: loanConditionReportIdSchema,
  /** The new answer; null for a report. */
  answerId: z.uuid().nullable(),
});

/**
 * One party's statement: the side it was made for, and who made it (the
 * caller, or the party by name; null once their account is deleted).
 */
const loanConditionStatementSchema = z.strictObject({
  id: z.uuid(),
  side: loanRequestRoleSchema,
  you: z.boolean(),
  realName: z.string().nullable(),
  description: z.string(),
  reportedAt: z.iso.datetime(),
});

export const loanConditionReportSchema = loanConditionStatementSchema.extend({
  /** The other party's answer, if any; it never replaces the report. */
  answer: loanConditionStatementSchema
    .extend({ kind: loanConditionAnswerKindSchema })
    .nullable(),
  /** The caller may answer it: the other side, while it has no answer. */
  answerable: z.boolean(),
});

/**
 * PS-LOAN-023: the loan's reports of damage, deficiency or loss, oldest
 * first, for its parties only.
 */
export const loanConditionReportsSchema = z.strictObject({
  reports: z.array(loanConditionReportSchema),
  /**
   * The caller may register a new one now: the object has been with the
   * borrower (handed over, or ended as returned or unresolved).
   */
  mayReport: z.boolean(),
});

export type ReportLoanCondition = z.infer<typeof reportLoanConditionSchema>;
export type AnswerLoanCondition = z.infer<typeof answerLoanConditionSchema>;
export type LoanConditionAnswerKind = z.infer<
  typeof loanConditionAnswerKindSchema
>;
export type LoanConditionResult = z.infer<typeof loanConditionResultSchema>;
export type LoanConditionReport = z.infer<typeof loanConditionReportSchema>;
export type LoanConditionReports = z.infer<typeof loanConditionReportsSchema>;

/**
 * A loan as a co-owner who is not its party sees it, only while there is
 * something for them to do (PS-LOAN-009, PS-LOAN-015): an offer of the
 * responsible lender's role, their own takeover waiting for the borrower,
 * or, while the responsible lender is established as unavailable, taking
 * over or confirming the receipt. It says only what that needs.
 */
export const coOwnerLoanSchema = z.strictObject({
  loanId: loanIdSchema,
  objectId: objectIdSchema,
  status: loanStatusSchema,
  agreementVersion: z.int(),
  title: z.string(),
  period: loanPeriodSchema,
  /** The open transfer to the caller, if any. */
  transfer: responsibilityTransferSchema.nullable(),
  mayTakeOver: z.boolean(),
  /** The caller may confirm the receipt (`loan.report_return`, `received`). */
  mayConfirmReceipt: z.boolean(),
  /**
   * The loan ended unresolved and the caller, an owner, may confirm having
   * the object back (`loan.confirm_control`, PS-LOAN-019).
   */
  mayConfirmControl: z.boolean(),
  /** The caller's own receipt while it can be undone. */
  pending: pendingReturnSchema,
});

export const coOwnerLoanListSchema = z.strictObject({
  items: z.array(coOwnerLoanSchema),
});

/**
 * UX-PRIV-013: a loan as a co-owner who is not its party sees it: one who
 * owned the object when the loan was approved and still owns it, or one
 * who has been asked to become its responsible lender. Only its status,
 * period, object, agreed terms and parties, and what the caller may do
 * themselves. Never the request's message, the private chat, the parties'
 * statements and explanations, the timeline or the reviews.
 */
export const coOwnerLoanViewSchema = z.strictObject({
  id: loanIdSchema,
  objectId: objectIdSchema,
  status: loanStatusSchema,
  /** How and when it ended; null while it lasts. */
  ending: z
    .strictObject({
      reason: loanEndReasonSchema,
      endedAt: z.iso.datetime(),
    })
    .nullable(),
  /** The period of the current agreement. */
  period: loanPeriodSchema,
  /** The object as agreed, and the agreed terms. */
  title: z.string(),
  categoryId: objectCategoryIdSchema,
  loanTerms: z.string().nullable(),
  /**
   * The thing's pictures as they are now, read as one of its owners
   * (`object.read_image`, PS-OBJ-021).
   */
  images: z.array(objectImageSchema),
  /** The borrower and the responsible lender, by name (UX-INT-004). */
  parties: z.strictObject({
    borrower: loanPersonSchema,
    lender: loanPersonSchema,
  }),
  /** The open offer of the responsible lender's role to the caller, if any. */
  responsibilityTransfer: responsibilityTransferSchema.nullable(),
  /** What the caller may do themselves; the commands decide again. */
  actions: z.strictObject({
    /**
     * The caller's answers to the offer (PS-LOAN-009): an account that is
     * not active may only decline (PS-ADM-002).
     */
    responsibility: z.array(answerSchema),
    /** The caller may confirm having the object back (PS-LOAN-019). */
    confirmControl: z.boolean(),
  }),
});

export type LoanRequestOrigin = z.infer<typeof loanRequestOriginSchema>;
export type DesiredStart = z.infer<typeof desiredStartSchema>;
export type DesiredEnd = z.infer<typeof desiredEndSchema>;
export type CreateLoanRequest = z.infer<typeof createLoanRequestSchema>;
export type LoanRequestStatus = z.infer<typeof loanRequestStatusSchema>;
export type LoanRequestEndReason = z.infer<typeof loanRequestEndReasonSchema>;
export type LoanRequestRole = z.infer<typeof loanRequestRoleSchema>;
export type LoanRequestResult = z.infer<typeof loanRequestResultSchema>;
export type LoanRequestPreview = z.infer<typeof loanRequestPreviewSchema>;
export type LoanOrigin = z.infer<typeof loanOriginSchema>;
export type LoanRequest = z.infer<typeof loanRequestSchema>;
export type LoanRequestDetail = z.infer<typeof loanRequestDetailSchema>;
export type LoanRequestList = z.infer<typeof loanRequestListSchema>;
export type LoanPeriod = z.infer<typeof loanPeriodSchema>;
export type LoanApprovalResult = z.infer<typeof loanApprovalResultSchema>;
export type LoanStatus = z.infer<typeof loanStatusSchema>;
export type LoanControl = z.infer<typeof loanControlSchema>;
export type LoanControlResult = z.infer<typeof loanControlResultSchema>;
export type LoanUnresolvedResult = z.infer<typeof loanUnresolvedResultSchema>;
export type LoanEndReason = z.infer<typeof loanEndReasonSchema>;
export type Loan = z.infer<typeof loanSchema>;
export type LoanListQuery = z.infer<typeof loanListQuerySchema>;
export type LoanList = z.infer<typeof loanListSchema>;
export type LoanPerson = z.infer<typeof loanPersonSchema>;
export type LoanActions = z.infer<typeof loanActionsSchema>;
export type LoanHistoryQuery = z.infer<typeof loanHistoryQuerySchema>;
export type LoanHistoryEvent = z.infer<typeof loanHistoryEventSchema>;
export type LoanHistoryPerson = z.infer<typeof loanHistoryPersonSchema>;
export type LoanHistoryEntry = z.infer<typeof loanHistoryEntrySchema>;
export type LoanHistory = z.infer<typeof loanHistorySchema>;
export type LoanCancellationResult = z.infer<
  typeof loanCancellationResultSchema
>;
export type ProposeLoanAmendment = z.infer<typeof proposeLoanAmendmentSchema>;
export type LoanAmendmentStatus = z.infer<typeof loanAmendmentStatusSchema>;
export type LoanAmendmentResult = z.infer<typeof loanAmendmentResultSchema>;
export type HandoverOutcome = z.infer<typeof handoverOutcomeSchema>;
export type ReportHandover = z.infer<typeof reportHandoverSchema>;
export type LoanHandoverResult = z.infer<typeof loanHandoverResultSchema>;
export type ReturnOutcome = z.infer<typeof returnOutcomeSchema>;
export type ReportReturn = z.infer<typeof reportReturnSchema>;
export type LoanReturnResult = z.infer<typeof loanReturnResultSchema>;
export type ReturnReporter = z.infer<typeof returnReporterSchema>;
export type ResponsibilityTransferKind = z.infer<
  typeof responsibilityTransferKindSchema
>;
export type ResponsibilityTransferStatus = z.infer<
  typeof responsibilityTransferStatusSchema
>;
export type ResponsibilityTransfer = z.infer<
  typeof responsibilityTransferSchema
>;
export type ResponsibilityTransferResult = z.infer<
  typeof responsibilityTransferResultSchema
>;
export type CoOwnerLoan = z.infer<typeof coOwnerLoanSchema>;
export type CoOwnerLoanList = z.infer<typeof coOwnerLoanListSchema>;
export type CoOwnerLoanView = z.infer<typeof coOwnerLoanViewSchema>;

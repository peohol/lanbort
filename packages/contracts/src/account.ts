import { z } from "zod";
import { ownProfilePictureSchema } from "./profile";

/**
 * PS-ADM-001: the account's lifecycle state.
 * - `pending_registration`: signed in, name and 18+ not yet given.
 * - `active`: an ordinary account.
 * - `dormant`: put to rest after long inactivity («dvale»).
 * - `deactivated`: the user stopped new activity themselves.
 * - `suspended`: the platform stopped the user's participation.
 * - `closing`: the platform is closing the account in a controlled way.
 * - `deleted`: permanently deleted; never returned to its user, who is
 *   signed out.
 * Only `active` takes new activity. Every other state except `deleted` keeps
 * the minimum access to existing loans and to winding ownership down.
 */
export const accountStatusSchema = z.enum([
  "pending_registration",
  "active",
  "dormant",
  "deactivated",
  "suspended",
  "closing",
  "deleted",
]);

/**
 * Why the account is in its state, kept apart from the state itself
 * (PS-ADM-001): the user's own request, inactivity, or the platform.
 */
export const accountStatusReasonSchema = z.enum([
  "user_request",
  "inactivity",
  "platform",
]);

/** Real name as typed, trimmed; no control characters (PS-USR-001). */
export const realNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\p{Cc}]*$/u);

/** Step 3 of registration: real name and 18+ confirmation (UX-JRN-001). */
export const completeRegistrationSchema = z.strictObject({
  realName: realNameSchema,
  adultConfirmed: z.literal(true),
});

export const ownAccountSchema = z.strictObject({
  userId: z.uuid(),
  status: accountStatusSchema,
  /** Null while active or pending registration. */
  statusReason: accountStatusReasonSchema.nullable(),
  realName: z.string().nullable(),
  email: z.string().nullable(),
  /** The own profile picture and who sees it (PS-USR-002). */
  picture: ownProfilePictureSchema,
});

/** The account's state after a lifecycle change. */
export const accountLifecycleResultSchema = z.strictObject({
  userId: z.uuid(),
  status: accountStatusSchema,
});

/**
 * PS-ADM-004: what still binds the account and must be handled before it
 * can be deleted:
 * - `loan`: a loan that has not ended, as borrower or as responsible
 *   lender, or one that ended unresolved and awaits an owner's control, as
 *   its responsible lender;
 * - `environment_ownership`: the owner of an environment, who hands it over
 *   or winds it down first;
 * - `case`: an open mediation, as one of its parties.
 * Pending invitations and unused rights are not bindings (PS-ADM-005).
 */
export const accountBindingKindSchema = z.enum([
  "loan",
  "environment_ownership",
  "case",
]);

export const accountBindingSchema = z.strictObject({
  kind: accountBindingKindSchema,
  /** The loan, environment or case it is about. */
  resourceId: z.uuid(),
});

export const accountDeletionCheckSchema = z.strictObject({
  /** Empty when the account can be deleted now. */
  bindings: z.array(accountBindingSchema),
});

/** Why the platform intervened, as the steward wrote it (PS-ADM-014). */
export const basisSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .regex(/^[^\p{Cc}]*$/u);

/**
 * PS-ADM-015: every intervention is taken from the platform case it rests
 * on, which the steward holds and which is about whom it is taken toward.
 */
const fromCase = { caseId: z.uuid() };

/**
 * PS-ADM-014: a platform steward's intervention on an account, always with
 * its basis. The basis is stored with the intervention only, never in
 * events or logs.
 */
export const accountInterventionSchema = z.strictObject({
  ...fromCase,
  userId: z.uuid(),
  basis: basisSchema,
});

/**
 * PS-ADM-009: a steward retires `userId` as a verified duplicate of
 * `continuedUserId`, which continues as the person's account.
 */
export const retireDuplicateAccountSchema = z
  .strictObject({
    ...fromCase,
    userId: z.uuid(),
    continuedUserId: z.uuid(),
    basis: basisSchema,
  })
  .refine((input) => input.userId !== input.continuedUserId, {
    path: ["continuedUserId"],
  });

/**
 * PS-ADM-010: a steward links two accounts of the same person, for security
 * work only (a false identity, a way around a suspension).
 */
export const linkSamePersonSchema = z
  .strictObject({
    ...fromCase,
    userId: z.uuid(),
    linkedUserId: z.uuid(),
    basis: basisSchema,
  })
  .refine((input) => input.userId !== input.linkedUserId, {
    path: ["linkedUserId"],
  });

/**
 * PS-ADM-009: a steward moves an object of a retired duplicate to the
 * account that continues, with the basis for the transfer (PS-ADM-014).
 */
export const moveDuplicateObjectSchema = z.strictObject({
  ...fromCase,
  objectId: z.uuid(),
  basis: basisSchema,
});

export const moveDuplicateObjectResultSchema = z.strictObject({
  objectId: z.uuid(),
  /**
   * Whether the retired account left the object now. It stays a co-owner
   * while it is still responsible for a loan of the object, until the loan
   * is handed over or ends.
   */
  formerOwnerLeft: z.boolean(),
});

/**
 * Internal links between accounts (PS-ADM-009–010): `duplicate` (one was
 * retired as a duplicate of the other, which continues) or `same_person`
 * (for security work only).
 */
export const accountLinkKindSchema = z.enum(["duplicate", "same_person"]);

/** PS-ADM-010: an internal security finding about an account. */
export const accountIdentityFindingSchema = z.enum(["false_identity"]);

export const accountRecordResultSchema = z.strictObject({ id: z.uuid() });

/**
 * What the platform holds internally about an account's identity, for a
 * steward only. `role` says which side of a link the account is on.
 */
export const accountIdentityRecordSchema = z.strictObject({
  userId: z.uuid(),
  findings: z.array(
    z.strictObject({
      id: z.uuid(),
      finding: accountIdentityFindingSchema,
      basis: z.string(),
      recordedByUserId: z.uuid(),
      recordedAt: z.iso.datetime(),
    }),
  ),
  links: z.array(
    z.strictObject({
      id: z.uuid(),
      kind: accountLinkKindSchema,
      role: z.enum(["retired", "continued", "same_person"]),
      otherUserId: z.uuid(),
      basis: z.string(),
      recordedByUserId: z.uuid(),
      recordedAt: z.iso.datetime(),
    }),
  ),
});

export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type AccountStatusReason = z.infer<typeof accountStatusReasonSchema>;
export type CompleteRegistration = z.infer<typeof completeRegistrationSchema>;
export type OwnAccount = z.infer<typeof ownAccountSchema>;
export type AccountLifecycleResult = z.infer<
  typeof accountLifecycleResultSchema
>;
export type AccountBindingKind = z.infer<typeof accountBindingKindSchema>;
export type AccountBinding = z.infer<typeof accountBindingSchema>;
export type AccountDeletionCheck = z.infer<typeof accountDeletionCheckSchema>;
export type AccountIntervention = z.infer<typeof accountInterventionSchema>;
export type MoveDuplicateObjectResult = z.infer<
  typeof moveDuplicateObjectResultSchema
>;
export type AccountLinkKind = z.infer<typeof accountLinkKindSchema>;
export type AccountIdentityFinding = z.infer<
  typeof accountIdentityFindingSchema
>;
export type AccountIdentityRecord = z.infer<typeof accountIdentityRecordSchema>;

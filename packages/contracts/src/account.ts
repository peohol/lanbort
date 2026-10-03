import { z } from "zod";

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
});

/** The account's state after a lifecycle change. */
export const accountLifecycleResultSchema = z.strictObject({
  userId: z.uuid(),
  status: accountStatusSchema,
});

/**
 * PS-ADM-004: what still binds the account and must be handled before it
 * can be deleted:
 * - `loan`: a reserved, active or unresolved loan as borrower or as
 *   responsible lender;
 * - `environment_ownership`: the owner of an environment, who hands it over
 *   or winds it down first.
 * Pending invitations and unused rights are not bindings (PS-ADM-005).
 */
export const accountBindingKindSchema = z.enum([
  "loan",
  "environment_ownership",
]);

export const accountBindingSchema = z.strictObject({
  kind: accountBindingKindSchema,
  /** The loan or environment it is about. */
  resourceId: z.uuid(),
});

export const accountDeletionCheckSchema = z.strictObject({
  /** Empty when the account can be deleted now. */
  bindings: z.array(accountBindingSchema),
});

/**
 * PS-ADM-014: a platform steward's intervention on an account, always with
 * its basis. The basis is stored with the change only, never in events or
 * logs.
 */
export const accountInterventionSchema = z.strictObject({
  userId: z.uuid(),
  basis: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .regex(/^[^\p{Cc}]*$/u),
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

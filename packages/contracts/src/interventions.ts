import { z } from "zod";
import {
  accountBindingSchema,
  accountStatusSchema,
  basisSchema,
} from "./account";
import { emailAddressSchema } from "./auth";
import { caseEntryIdSchema, caseIdSchema, casePersonSchema } from "./cases";
import { objectIdSchema } from "./objects";

/**
 * Platform stewards' interventions (PS-ADM-014, PS-ADM-015). Every one is
 * taken from a platform case the steward holds, toward what that case is
 * about, with a basis that is stored with it and never in events or logs.
 */

/**
 * PS-ADM-015: without a report, a steward first opens a case of their own
 * about an account or a thing, with the basis as its first entry
 * («autorisert saksgrunnlag»), and holds it at once.
 */
export const openPlatformInquirySchema = z.strictObject({
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("user"), userId: z.uuid() }),
    z.strictObject({ kind: z.literal("object"), objectId: objectIdSchema }),
  ]),
  basis: basisSchema,
});

export const platformInquiryOpenedSchema = z.strictObject({
  caseId: caseIdSchema,
  entryId: caseEntryIdSchema,
});

/**
 * OD-0055: a steward finds the account or thing an inquiry or a duplicate
 * is about only from what they already have: the full e-mail address, or
 * the link to the person's or the thing's page (which the app reads into
 * its id). Never a name search. Every lookup is recorded, found or not.
 */
export const platformLookupBySchema = z.enum(["email", "person", "object"]);

export const platformLookupSchema = z.discriminatedUnion("by", [
  z.strictObject({ by: z.literal("email"), email: emailAddressSchema }),
  z.strictObject({ by: z.literal("person"), userId: z.uuid() }),
  z.strictObject({ by: z.literal("object"), objectId: objectIdSchema }),
]);

/**
 * What a lookup found, or null. `involved` when it is the steward's own
 * account or a thing they own, which they can never act on (PS-USR-009).
 */
export const platformLookupResultSchema = z.strictObject({
  found: z
    .discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("user"),
        userId: z.uuid(),
        name: z.string().nullable(),
        status: accountStatusSchema,
        involved: z.boolean(),
      }),
      z.strictObject({
        kind: z.literal("object"),
        objectId: objectIdSchema,
        title: z.string(),
        ownerNames: z.array(z.string()),
        involved: z.boolean(),
      }),
    ])
    .nullable(),
});

/**
 * Ends the administrator and owner roles a person misuses in one
 * environment. Ownership then follows the continuity rules (PS-ENV-013):
 * the remaining administrators may take it on, or the environment winds
 * down.
 */
export const endEnvironmentRolesSchema = z.strictObject({
  caseId: caseIdSchema,
  environmentId: z.uuid(),
  userId: z.uuid(),
  basis: basisSchema,
});

export const endEnvironmentRolesResultSchema = z.strictObject({
  environmentId: z.uuid(),
  userId: z.uuid(),
  /** The roles that ended, none when the person held none. */
  ended: z.array(z.enum(["owner", "administrator"])),
});

export const platformInterventionKinds = [
  "account_suspended",
  "account_reinstated",
  "account_closure_started",
  "account_closure_completed",
  "account_retired_as_duplicate",
  "accounts_linked_as_same_person",
  "false_identity_recorded",
  "object_moved_from_duplicate",
  "environment_roles_ended",
] as const;

export const platformInterventionKindSchema = z.enum(platformInterventionKinds);

/** One intervention on a case, for its handlers. */
export const platformInterventionSchema = z.strictObject({
  id: z.uuid(),
  kind: platformInterventionKindSchema,
  userId: z.uuid().nullable(),
  otherUserId: z.uuid().nullable(),
  environmentId: z.uuid().nullable(),
  objectId: z.uuid().nullable(),
  basis: basisSchema,
  decidedByUserId: z.uuid(),
  decidedAt: z.iso.datetime(),
});

export const caseInterventionsQuerySchema = z.strictObject({
  caseId: caseIdSchema,
});

/**
 * The account a platform case is about, as its handlers decide what to do
 * with it: its status, the roles it holds in environments (PS-ADM-015),
 * what still binds it before a closure can be completed (PS-ADM-004) and,
 * once it is retired as a duplicate, the account that continues and the
 * things that have not moved to it yet (PS-ADM-009).
 */
export const caseSubjectAccountSchema = z.strictObject({
  userId: z.uuid(),
  status: accountStatusSchema,
  roles: z.array(
    z.strictObject({
      environmentId: z.uuid(),
      name: z.string(),
      owner: z.boolean(),
    }),
  ),
  bindings: z.array(accountBindingSchema),
  duplicateOf: casePersonSchema.nullable(),
  /** Empty unless the account is retired as a duplicate. */
  objects: z.array(
    z.strictObject({
      objectId: objectIdSchema,
      title: z.string(),
      /** Owners besides the duplicate; only things without any can move. */
      coOwners: z.array(casePersonSchema),
    }),
  ),
});

/**
 * The interventions on a case, with the names they need to be read: the
 * people (none once an account is deleted), environments and things. For a
 * case about an account, the account as it stands now; null otherwise.
 */
export const caseInterventionsSchema = z.strictObject({
  caseId: caseIdSchema,
  account: caseSubjectAccountSchema.nullable(),
  items: z.array(platformInterventionSchema),
  people: z.array(casePersonSchema),
  environments: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
  objects: z.array(z.strictObject({ id: z.uuid(), title: z.string() })),
});

export type OpenPlatformInquiry = z.infer<typeof openPlatformInquirySchema>;
export type PlatformInquiryOpened = z.infer<typeof platformInquiryOpenedSchema>;
export type PlatformLookup = z.infer<typeof platformLookupSchema>;
export type PlatformLookupResult = z.infer<typeof platformLookupResultSchema>;
export type EndEnvironmentRoles = z.infer<typeof endEnvironmentRolesSchema>;
export type PlatformInterventionKind = z.infer<
  typeof platformInterventionKindSchema
>;
export type PlatformIntervention = z.infer<typeof platformInterventionSchema>;
export type CaseInterventions = z.infer<typeof caseInterventionsSchema>;
export type CaseSubjectAccount = z.infer<typeof caseSubjectAccountSchema>;

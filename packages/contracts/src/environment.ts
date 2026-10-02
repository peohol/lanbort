import { z } from "zod";

/** PS-ENV-001: the three privacy types of an environment. */
export const environmentTypeSchema = z.enum(["open", "closed", "hidden"]);

export const environmentStateSchema = z.enum(["active"]);

/** PS-ENV-004: explicit membership states. */
export const membershipStateSchema = z.enum([
  "pending",
  "active",
  "passive",
  "ended",
]);

export const membershipOriginSchema = z.enum([
  "founder",
  "self_service",
  "application",
  "invitation",
]);

/** Where an application (or a passive member's reactivation) is in review. */
export const membershipReviewStageSchema = z.enum([
  "submitted",
  "information_requested",
]);

export const membershipPassiveReasonSchema = z.enum(["requirements_not_met"]);

/**
 * `information`: the member gives an answer. `acceptance`: rules or a
 * self-declaration the member explicitly accepts.
 */
export const requirementKindSchema = z.enum(["information", "acceptance"]);

export const environmentRoleSchema = z.enum(["owner", "administrator"]);

const noControlCharacters = /^[^\p{Cc}]*$/u;
// Multi-line text may keep line breaks and tabs, nothing else invisible.
const noControlCharactersExceptLineBreaks = /^(?:[^\p{Cc}]|[\t\n\r])*$/u;

const singleLine = (max: number) =>
  z.string().trim().min(1).max(max).regex(noControlCharacters);
const multiLine = (max: number) =>
  z.string().trim().min(1).max(max).regex(noControlCharactersExceptLineBreaks);

/** Optional text: omitted or null means none. */
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullable().optional();

export const maxRequirements = 20;

export const environmentDetailsSchema = z.strictObject({
  name: singleLine(100),
  description: optional(multiLine(2000)),
  audience: optional(multiLine(500)),
  objectFocus: optional(multiLine(500)),
  location: optional(singleLine(200)),
});

export const newRequirementSchema = z.strictObject({
  kind: requirementKindSchema,
  text: multiLine(2000),
});

/** An existing requirement kept unchanged, or a new one. */
export const requirementDraftSchema = z.union([
  z.strictObject({ id: z.uuid() }),
  newRequirementSchema,
]);

export const createEnvironmentSchema = z.strictObject({
  ...environmentDetailsSchema.shape,
  type: environmentTypeSchema,
  requirements: z.array(newRequirementSchema).max(maxRequirements).optional(),
});

export const updateEnvironmentDetailsSchema = z.strictObject({
  ...environmentDetailsSchema.shape,
  /** The version the change is based on (optimistic concurrency). */
  expectedVersion: z.int().positive(),
});

export const updateRequirementsSchema = z.strictObject({
  /** The full new list, in display order. Requirements left out are retired. */
  requirements: z.array(requirementDraftSchema).max(maxRequirements),
  expectedRevision: z.int().nonnegative(),
});

/** An answer to an information requirement, or acceptance of the rest. */
export const requirementAnswerSchema = z.union([
  z.strictObject({ requirementId: z.uuid(), answer: multiLine(1000) }),
  z.strictObject({ requirementId: z.uuid(), accepted: z.literal(true) }),
]);

/**
 * Answers to every current requirement. Sending answers for an outdated set
 * gives `conflict`, so nobody is bound by requirements they have not seen
 * (PS-ENV-005).
 */
export const requirementAnswersSchema = z.strictObject({
  answers: z.array(requirementAnswerSchema).max(maxRequirements),
});

export const membershipDecisionSchema = z.strictObject({
  /** Also bar the user from new membership attempts (PS-ENV-004). */
  restrict: z.boolean().optional(),
});

export const inviteMemberSchema = z.strictObject({ userId: z.uuid() });

export const requirementSchema = z.strictObject({
  id: z.uuid(),
  kind: requirementKindSchema,
  text: z.string(),
});

export const givenAnswerSchema = z.strictObject({
  requirementId: z.uuid(),
  answer: z.string().nullable(),
});

const membershipFields = {
  id: z.uuid(),
  state: membershipStateSchema,
  origin: membershipOriginSchema,
  reviewStage: membershipReviewStageSchema.nullable(),
  passiveReason: membershipPassiveReasonSchema.nullable(),
  /** PS-ENV-006: when an active member must have met new requirements. */
  transitionDeadline: z.iso.datetime().nullable(),
  /** Current requirements this membership has not answered or accepted. */
  unmetRequirementIds: z.array(z.uuid()),
  answers: z.array(givenAnswerSchema),
};

export const ownMembershipSchema = z.strictObject(membershipFields);

export const environmentSchema = z.strictObject({
  id: z.uuid(),
  type: environmentTypeSchema,
  state: environmentStateSchema,
  name: z.string(),
  description: z.string().nullable(),
  audience: z.string().nullable(),
  objectFocus: z.string().nullable(),
  location: z.string().nullable(),
  version: z.int(),
  requirementsRevision: z.int(),
  requirements: z.array(requirementSchema),
  /** The caller's own relation to the environment. */
  membership: ownMembershipSchema.nullable(),
  roles: z.array(environmentRoleSchema),
});

export const environmentSummarySchema = z.strictObject({
  id: z.uuid(),
  type: environmentTypeSchema,
  name: z.string(),
  membershipState: membershipStateSchema,
  roles: z.array(environmentRoleSchema),
});

/** What administrators see of a membership to handle it. */
export const administeredMembershipSchema = z.strictObject({
  ...membershipFields,
  userId: z.uuid(),
  realName: z.string().nullable(),
});

export const environmentMembershipsSchema = z.strictObject({
  memberships: z.array(administeredMembershipSchema),
  restrictedUserIds: z.array(z.uuid()),
});

export type EnvironmentType = z.infer<typeof environmentTypeSchema>;
export type MembershipState = z.infer<typeof membershipStateSchema>;
export type MembershipOrigin = z.infer<typeof membershipOriginSchema>;
export type MembershipReviewStage = z.infer<typeof membershipReviewStageSchema>;
export type MembershipPassiveReason = z.infer<
  typeof membershipPassiveReasonSchema
>;
export type RequirementKind = z.infer<typeof requirementKindSchema>;
export type EnvironmentRole = z.infer<typeof environmentRoleSchema>;
export type CreateEnvironment = z.infer<typeof createEnvironmentSchema>;
export type RequirementDraft = z.infer<typeof requirementDraftSchema>;
export type RequirementAnswer = z.infer<typeof requirementAnswerSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type EnvironmentSummary = z.infer<typeof environmentSummarySchema>;
export type OwnMembership = z.infer<typeof ownMembershipSchema>;
export type AdministeredMembership = z.infer<
  typeof administeredMembershipSchema
>;
export type EnvironmentMemberships = z.infer<
  typeof environmentMembershipsSchema
>;

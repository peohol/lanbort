import { z } from "zod";
import { geoAreaSchema } from "./geo";
import { personLinkShape } from "./social";

/** PS-ENV-001: the three privacy types of an environment. */
export const environmentTypeSchema = z.enum(["open", "closed", "hidden"]);

/** PS-ENV-012: an environment winds down before it is archived. */
export const environmentStateSchema = z.enum(["active", "winding_down"]);

/** Started by the owner, or because nobody took over ownership (PS-ENV-013). */
export const windDownReasonSchema = z.enum(["voluntary", "ownerless"]);

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
  /** After closed → open the applicant must confirm the wish to join. */
  "confirmation_required",
]);

/** Why a member is passive: unmet requirements, or a weaker type not accepted. */
export const membershipPassiveReasonSchema = z.enum([
  "requirements_not_met",
  "type_change_not_accepted",
]);

/**
 * PS-ENV-008: how a change to weaker privacy is decided. `consent`: every
 * active member accepts individually (closed → open). `vote`: 2/3 of all
 * active members vote for it (hidden → closed).
 */
export const typeChangeProcessSchema = z.enum(["consent", "vote"]);

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
  /** Where the environment is, approximately (WP-62, PS-NFR-008). */
  area: geoAreaSchema.nullable().optional(),
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

/**
 * An administrator changes the type (PS-ENV-007–008). A stricter type applies
 * at once; a weaker one starts the members' consent or vote. `expectedType`
 * is the type the administrator saw, so nobody decides on an outdated state.
 */
export const changeEnvironmentTypeSchema = z.strictObject({
  type: environmentTypeSchema,
  expectedType: environmentTypeSchema,
});

/** A member's consent to, or vote on, a proposed weaker type. */
export const typeChangeResponseSchema = z.strictObject({
  proposalId: z.uuid(),
  support: z.boolean(),
});

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

/**
 * PS-ENV-012–014: the environment's continuity, for the caller's own
 * membership. Shown so that waiting processes can be explained.
 */
export const environmentContinuitySchema = z.strictObject({
  /**
   * False while no administrator has an active membership. Processes that
   * need one wait; nobody else decides them (PS-ENV-014).
   */
  administrationAvailable: z.boolean(),
  /** PS-ENV-013: the owner is gone; administrators may claim ownership. */
  ownershipVacancy: z
    .strictObject({
      claimDeadline: z.iso.datetime(),
      /** The caller, an administrator, has registered interest. */
      claimedByYou: z.boolean(),
    })
    .nullable(),
  windDown: z
    .strictObject({
      reason: windDownReasonSchema,
      /** When the owner can no longer cancel it. */
      finalAt: z.iso.datetime(),
      cancellable: z.boolean(),
    })
    .nullable(),
});

/**
 * A proposed change to weaker privacy, for the environment's members. Only the
 * caller's own answer is shown, never anyone else's.
 */
export const typeChangeProposalSchema = z.strictObject({
  id: z.uuid(),
  toType: environmentTypeSchema,
  process: typeChangeProcessSchema,
  deadline: z.iso.datetime(),
  /** The caller's current answer; null without one. */
  yourResponse: z.boolean().nullable(),
});

/** A pending invitation to the caller to take on a role. */
export const ownRoleInvitationSchema = z.strictObject({
  id: z.uuid(),
  role: environmentRoleSchema,
});

export const environmentSchema = z.strictObject({
  id: z.uuid(),
  type: environmentTypeSchema,
  state: environmentStateSchema,
  name: z.string(),
  description: z.string().nullable(),
  audience: z.string().nullable(),
  objectFocus: z.string().nullable(),
  location: z.string().nullable(),
  area: geoAreaSchema.nullable(),
  version: z.int(),
  requirementsRevision: z.int(),
  /** PS-ENV-011: objects need an administrator's approval to be visible. */
  requiresObjectApproval: z.boolean(),
  requirements: z.array(requirementSchema),
  /** The caller's own relation to the environment. */
  membership: ownMembershipSchema.nullable(),
  roles: z.array(environmentRoleSchema),
  /** Null without a current membership. */
  continuity: environmentContinuitySchema.nullable(),
  roleInvitations: z.array(ownRoleInvitationSchema),
  /** Null without a current active or passive membership. */
  typeChange: typeChangeProposalSchema.nullable(),
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

/**
 * Another active member, as active members see each other (vision 03): a
 * name and any role, nothing given to the membership process (UX-PRIV-009).
 */
export const environmentMemberSchema = z.strictObject({
  userId: z.uuid(),
  realName: z.string().nullable(),
  ...personLinkShape,
  roles: z.array(environmentRoleSchema),
});

export const environmentMembersSchema = z.strictObject({
  members: z.array(environmentMemberSchema),
});

/** Who holds a role, and since when they have been administrator. */
export const roleHolderSchema = z.strictObject({
  userId: z.uuid(),
  realName: z.string().nullable(),
  roles: z.array(environmentRoleSchema),
  /** Start of the continuous administrator period (PS-ENV-013). */
  administratorSince: z.iso.datetime(),
});

export const pendingRoleInvitationSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  realName: z.string().nullable(),
  role: environmentRoleSchema,
  invitedByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
});

/** What administrators see of the environment's roles (PS-ENV-003). */
export const environmentRolesSchema = z.strictObject({
  holders: z.array(roleHolderSchema),
  invitations: z.array(pendingRoleInvitationSchema),
});

export type EnvironmentType = z.infer<typeof environmentTypeSchema>;
export type MembershipState = z.infer<typeof membershipStateSchema>;
export type MembershipOrigin = z.infer<typeof membershipOriginSchema>;
export type MembershipReviewStage = z.infer<typeof membershipReviewStageSchema>;
export type MembershipPassiveReason = z.infer<
  typeof membershipPassiveReasonSchema
>;
export type RequirementKind = z.infer<typeof requirementKindSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type EnvironmentRole = z.infer<typeof environmentRoleSchema>;
export type EnvironmentState = z.infer<typeof environmentStateSchema>;
export type WindDownReason = z.infer<typeof windDownReasonSchema>;
export type TypeChangeProcess = z.infer<typeof typeChangeProcessSchema>;
export type TypeChangeProposal = z.infer<typeof typeChangeProposalSchema>;
export type EnvironmentContinuity = z.infer<typeof environmentContinuitySchema>;
export type EnvironmentRoles = z.infer<typeof environmentRolesSchema>;
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
export type EnvironmentMember = z.infer<typeof environmentMemberSchema>;
export type EnvironmentMembers = z.infer<typeof environmentMembersSchema>;

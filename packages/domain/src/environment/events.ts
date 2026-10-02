import {
  environmentRoleSchema,
  environmentTypeSchema,
  membershipPassiveReasonSchema,
  windDownReasonSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/**
 * Environment events carry ids and codes only: never names, descriptions,
 * requirement texts or answers (docs/implementation/server-boundary.md).
 */
export const environmentCreated = defineEvent({
  type: "environment.created",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({ type: environmentTypeSchema }),
});

export const environmentDetailsUpdated = defineEvent({
  type: "environment.details_updated",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({ version: z.int().positive() }),
});

/** Membership requirements changed; `added` counts new requirements. */
export const environmentRequirementsChanged = defineEvent({
  type: "environment.requirements_changed",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({
    revision: z.int().positive(),
    added: z.int().nonnegative(),
    retired: z.int().nonnegative(),
  }),
});

export const environmentRoleGranted = defineEvent({
  type: "environment.role_granted",
  version: 1,
  kind: "audit",
  resourceType: "environment",
  payload: z.strictObject({ userId: z.uuid(), role: environmentRoleSchema }),
});

export const roleRevokeReasonSchema = z.enum([
  "resigned",
  "removed",
  "transferred",
  "account_departed",
]);

export const environmentRoleRevoked = defineEvent({
  type: "environment.role_revoked",
  version: 1,
  kind: "audit",
  resourceType: "environment",
  payload: z.strictObject({
    userId: z.uuid(),
    role: environmentRoleSchema,
    reason: roleRevokeReasonSchema,
  }),
});

const roleInvitationPayload = {
  invitationId: z.uuid(),
  userId: z.uuid(),
  role: environmentRoleSchema,
};

export const environmentRoleInvited = defineEvent({
  type: "environment.role_invited",
  version: 1,
  kind: "audit",
  resourceType: "environment",
  payload: z.strictObject(roleInvitationPayload),
});

export const roleInvitationOutcomeSchema = z.enum([
  "accepted",
  "declined",
  "withdrawn",
  "lapsed",
]);

export const environmentRoleInvitationClosed = defineEvent({
  type: "environment.role_invitation_closed",
  version: 1,
  kind: "audit",
  resourceType: "environment",
  payload: z.strictObject({
    ...roleInvitationPayload,
    outcome: roleInvitationOutcomeSchema,
  }),
});

/** PS-ENV-013: the owner disappeared; administrators may claim until then. */
export const environmentOwnershipVacated = defineEvent({
  type: "environment.ownership_vacated",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({
    formerOwnerUserId: z.uuid(),
    claimDeadline: z.iso.datetime(),
  }),
});

export const environmentOwnershipClaimed = defineEvent({
  type: "environment.ownership_claimed",
  version: 1,
  kind: "audit",
  resourceType: "environment",
  payload: z.strictObject({ userId: z.uuid() }),
});

export const environmentOwnershipClaimWithdrawn = defineEvent({
  type: "environment.ownership_claim_withdrawn",
  version: 1,
  kind: "audit",
  resourceType: "environment",
  payload: z.strictObject({ userId: z.uuid() }),
});

export const environmentOwnershipVacancyClosed = defineEvent({
  type: "environment.ownership_vacancy_closed",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({
    outcome: z.enum(["claimed", "wound_down"]),
    newOwnerUserId: z.uuid().nullable(),
  }),
});

/**
 * PS-ENV-012: the environment takes nothing new from now on. Publishing
 * (WP-25) ends its publications in reaction to this event.
 */
export const environmentWindDownStarted = defineEvent({
  type: "environment.wind_down_started",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({
    reason: windDownReasonSchema,
    finalAt: z.iso.datetime(),
  }),
});

export const environmentWindDownCancelled = defineEvent({
  type: "environment.wind_down_cancelled",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({}),
});

/** The winding down can no longer be cancelled; waiting processes closed. */
export const environmentWindDownFinalized = defineEvent({
  type: "environment.wind_down_finalized",
  version: 1,
  kind: "domain",
  resourceType: "environment",
  payload: z.strictObject({}),
});

export const environmentRestrictionImposed = defineEvent({
  type: "environment.restriction_imposed",
  version: 1,
  kind: "audit",
  resourceType: "environment",
  payload: z.strictObject({ userId: z.uuid() }),
});

export const environmentRestrictionLifted = defineEvent({
  type: "environment.restriction_lifted",
  version: 1,
  kind: "audit",
  resourceType: "environment",
  payload: z.strictObject({ userId: z.uuid() }),
});

const membershipPayload = {
  environmentId: z.uuid(),
  userId: z.uuid(),
};

function membershipEvent<Shape extends z.ZodRawShape>(
  name: string,
  kind: "domain" | "audit",
  extra: Shape,
) {
  return defineEvent({
    type: `environment_membership.${name}`,
    version: 1,
    kind,
    resourceType: "environment_membership",
    payload: z.strictObject({ ...membershipPayload, ...extra }),
  });
}

/** The membership became active, and how. */
export const membershipActivated = membershipEvent("activated", "domain", {
  via: z.enum([
    "founder",
    "self_service",
    "invitation",
    "approval",
    "reactivation",
  ]),
});

/** An application, or a passive member's reactivation, awaits review. */
export const membershipReviewRequested = membershipEvent(
  "review_requested",
  "domain",
  { reactivation: z.boolean() },
);

export const membershipInvited = membershipEvent("invited", "audit", {});

export const membershipInformationRequested = membershipEvent(
  "information_requested",
  "audit",
  {},
);

export const membershipAnswersSubmitted = membershipEvent(
  "answers_submitted",
  "domain",
  {},
);

export const membershipRejected = membershipEvent("rejected", "audit", {
  reactivation: z.boolean(),
  restricted: z.boolean(),
});

export const membershipEnded = membershipEvent("ended", "domain", {
  reason: z.enum([
    "left",
    "application_withdrawn",
    "invitation_declined",
    "invitation_withdrawn",
    "environment_wound_down",
  ]),
});

/** A passive member's reactivation request closed without a decision. */
export const membershipReviewClosed = membershipEvent(
  "review_closed",
  "domain",
  {
    reason: z.enum(["environment_wound_down"]),
  },
);

/** PS-ENV-006: new requirements need action by `deadline`. */
export const membershipTransitionStarted = membershipEvent(
  "transition_started",
  "domain",
  { deadline: z.iso.datetime() },
);

export const membershipTransitionCompleted = membershipEvent(
  "transition_completed",
  "domain",
  {},
);

export const membershipPassivated = membershipEvent("passivated", "domain", {
  reason: membershipPassiveReasonSchema,
});

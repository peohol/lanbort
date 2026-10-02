import {
  environmentRoleSchema,
  environmentTypeSchema,
  membershipPassiveReasonSchema,
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
  ]),
});

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

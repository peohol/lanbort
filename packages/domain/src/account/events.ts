import { accountStatusSchema } from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/** A verified identity was linked to a new internal account. */
export const accountCreated = defineEvent({
  type: "account.created",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({}),
});

/** Name and 18+ confirmation were given; the account is now active. */
export const registrationCompleted = defineEvent({
  type: "account.registration_completed",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({}),
});

/**
 * Lifecycle changes (PS-ADM-001). The resource is the account; the payload
 * says only from which state, never the basis of a platform intervention,
 * which stays on the recorded change (PS-ADM-014). The actor is the user,
 * the steward or the inactivity process.
 */
const lifecycleEvent = (type: string) =>
  defineEvent({
    type: `account.${type}`,
    version: 1,
    kind: "audit",
    resourceType: "user",
    payload: z.strictObject({ from: accountStatusSchema }),
  });

/** The user stopped new activity themselves. */
export const accountDeactivated = lifecycleEvent("deactivated");

/** The account was put to rest after long inactivity. */
export const accountMadeDormant = lifecycleEvent("made_dormant");

/** The user, or a steward ending an intervention, made it active again. */
export const accountReactivated = lifecycleEvent("reactivated");

/** PS-ADM-003: a steward suspended the account. */
export const accountSuspended = lifecycleEvent("suspended");

/** A steward started the account's controlled closure. */
export const accountClosureStarted = lifecycleEvent("closure_started");

/**
 * PS-ADM-006: the account is deleted. Its sign-in identity is removed at the
 * auth provider after commit (outbox), and only then is the link to it.
 */
export const accountDeleted = lifecycleEvent("deleted");

/**
 * PS-ADM-009: a steward retired the account as a verified duplicate of the
 * account that continues. Ids only; the basis stays on the link.
 */
export const accountRetiredAsDuplicate = defineEvent({
  type: "account.retired_as_duplicate",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({ continuedUserId: z.uuid() }),
});

/** PS-ADM-010: a steward linked two accounts of the same person. */
export const accountsLinkedAsSamePerson = defineEvent({
  type: "account.linked_as_same_person",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({ linkedUserId: z.uuid() }),
});

/** PS-ADM-010: a steward recorded that the account's identity is false. */
export const accountFalseIdentityRecorded = defineEvent({
  type: "account.false_identity_recorded",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({}),
});

/**
 * PS-ADM-009: a steward moved the object from a retired duplicate to the
 * account that continues.
 */
export const objectMovedFromDuplicate = defineEvent({
  type: "object.moved_from_duplicate",
  version: 1,
  kind: "audit",
  resourceType: "object",
  payload: z.strictObject({ fromUserId: z.uuid(), toUserId: z.uuid() }),
});

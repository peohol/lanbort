import { platformLookupBySchema, platformRoleSchema } from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/** A global role was granted. The reason stays on the grant row only. */
export const platformRoleGranted = defineEvent({
  type: "platform_role.granted",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({ role: platformRoleSchema }),
});

export const platformRoleRevoked = defineEvent({
  type: "platform_role.revoked",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({ role: platformRoleSchema }),
});

/**
 * A steward's passkey was added (ADR-0011, OD-0023): with an enrollment code
 * from the operational command, or from a session already confirmed with
 * another passkey. Recorded before the passkey counts; never key material.
 */
export const stewardPasskeyAdded = defineEvent({
  type: "steward_passkey.added",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({
    passkeyId: z.uuid(),
    enrolledWith: z.enum(["enrollment_code", "passkey"]),
  }),
});

/** The steward confirmed a session with a passkey. */
export const stewardPasskeyConfirmed = defineEvent({
  type: "steward_passkey.confirmed",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({ passkeyId: z.uuid() }),
});

/** A passkey stopped counting: removed by the steward, or by a reset. */
export const stewardPasskeyRemoved = defineEvent({
  type: "steward_passkey.removed",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({ passkeyId: z.uuid() }),
});

/**
 * The operational command issued a one-time enrollment code, voiding any
 * earlier one; the code itself is never recorded. A reset removed the
 * steward's passkeys first, each with its own removal.
 */
export const stewardEnrollmentCodeIssued = defineEvent({
  type: "steward_passkey.enrollment_code_issued",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({
    codeId: z.uuid(),
    removedPasskeys: z.number().int().min(0),
  }),
});

/**
 * A steward looked up an account or a thing (OD-0055), found or not: how,
 * and whether it was found. The resource is what was found, or `none`;
 * never the address or anything typed.
 */
export const platformSubjectLookedUp = defineEvent({
  type: "platform.subject_looked_up",
  version: 1,
  kind: "audit",
  resourceType: "platform_lookup",
  payload: z.strictObject({
    by: platformLookupBySchema,
    found: z.boolean(),
  }),
});

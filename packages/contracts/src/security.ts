import { z } from "zod";
import { emailCodeSchema } from "./auth";

/** Global product roles (PS-USR-008). */
export const platformRoleSchema = z.enum(["platform_steward"]);

/** Confirms a sensitive action with a new code sent to the own address. */
export const reauthenticateSchema = z.strictObject({
  code: emailCodeSchema,
});

export type PlatformRole = z.infer<typeof platformRoleSchema>;

/**
 * A platform steward's own name for a passkey (ADR-0011), such as «Nøkkel i
 * skuffen».
 */
export const passkeyNameSchema = z.string().trim().min(1).max(60);

/**
 * What the browser's WebAuthn call returned, as JSON. The server's WebAuthn
 * verification checks every field; this only bounds the size.
 */
export const passkeyResponseSchema = z.looseObject({
  id: z.string().min(1).max(1400),
  rawId: z.string().min(1).max(1400),
  type: z.literal("public-key"),
  response: z.record(z.string(), z.unknown()),
});

export type PasskeyResponse = z.infer<typeof passkeyResponseSchema>;

/** Starts adding a passkey; the first one needs the enrollment code. */
export const beginPasskeyRegistrationSchema = z.strictObject({
  enrollmentCode: z.string().trim().min(1).max(40).optional(),
});

export const finishPasskeyRegistrationSchema = z.strictObject({
  challengeId: z.uuid(),
  name: passkeyNameSchema,
  response: passkeyResponseSchema,
});

export const finishPasskeyConfirmationSchema = z.strictObject({
  challengeId: z.uuid(),
  response: passkeyResponseSchema,
});

/** A ceremony the browser runs: its id and the WebAuthn options. */
export const passkeyCeremonySchema = z.strictObject({
  challengeId: z.uuid(),
  options: z.record(z.string(), z.unknown()),
});

export const stewardPasskeySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  enrolledWith: z.enum(["enrollment_code", "passkey"]),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});

/**
 * The steward's passkeys and the session's standing: when it was last
 * confirmed, and whether it has stronger access now (at least `minimum`
 * passkeys and a fresh confirmation).
 */
export const stewardPasskeysSchema = z.strictObject({
  passkeys: z.array(stewardPasskeySchema),
  minimum: z.number().int(),
  confirmedAt: z.iso.datetime().nullable(),
  strong: z.boolean(),
});

export type StewardPasskeys = z.infer<typeof stewardPasskeysSchema>;

import { z } from "zod";
import { emailCodeSchema } from "./auth";

/** Global product roles (PS-USR-008). */
export const platformRoleSchema = z.enum(["platform_steward"]);

/** State of the user's authenticator app (TOTP) factor. */
export const totpStatusSchema = z.enum(["none", "pending", "verified"]);

export const securityStatusSchema = z.strictObject({
  totp: totpStatusSchema,
  /** `aal2` once the authenticator app has been confirmed in this session. */
  sessionAssurance: z.enum(["aal1", "aal2"]),
  platformRoles: z.array(platformRoleSchema),
});

/** What the user needs to add Lånbort to an authenticator app. */
export const totpEnrollmentSchema = z.strictObject({
  /** SVG image as a data URL. */
  qrCode: z.string(),
  /** The shared secret for manual entry. */
  secret: z.string(),
});

export const verifyTotpSchema = z.strictObject({
  code: z.string().regex(/^\d{6}$/),
});

/** Confirms a sensitive action with a new code sent to the own address. */
export const reauthenticateSchema = z.strictObject({
  code: emailCodeSchema,
});

export type PlatformRole = z.infer<typeof platformRoleSchema>;
export type TotpStatus = z.infer<typeof totpStatusSchema>;
export type SecurityStatus = z.infer<typeof securityStatusSchema>;
export type TotpEnrollment = z.infer<typeof totpEnrollmentSchema>;

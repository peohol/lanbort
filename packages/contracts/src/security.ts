import { z } from "zod";
import { emailCodeSchema } from "./auth";

/** Global product roles (PS-USR-008). */
export const platformRoleSchema = z.enum(["platform_steward"]);

/** Confirms a sensitive action with a new code sent to the own address. */
export const reauthenticateSchema = z.strictObject({
  code: emailCodeSchema,
});

export type PlatformRole = z.infer<typeof platformRoleSchema>;

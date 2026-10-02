import { z } from "zod";

export const accountStatusSchema = z.enum(["pending_registration", "active"]);

/** Real name as typed, trimmed; no control characters (PS-USR-001). */
export const realNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[^\p{Cc}]*$/u);

/** Step 3 of registration: real name and 18+ confirmation (UX-JRN-001). */
export const completeRegistrationSchema = z.strictObject({
  realName: realNameSchema,
  adultConfirmed: z.literal(true),
});

export const ownAccountSchema = z.strictObject({
  userId: z.uuid(),
  status: accountStatusSchema,
  realName: z.string().nullable(),
  email: z.string().nullable(),
});

export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type CompleteRegistration = z.infer<typeof completeRegistrationSchema>;
export type OwnAccount = z.infer<typeof ownAccountSchema>;

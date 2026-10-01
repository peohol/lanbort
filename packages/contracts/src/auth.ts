import { z } from "zod";
import { accountStatusSchema } from "./account";

export const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .pipe(z.email());

/** Step 1 of sign-in and registration: send a one-time code (UX-JRN-001). */
export const requestEmailCodeSchema = z.strictObject({
  email: emailAddressSchema,
});

/** Step 2: prove control of the address with the code from the e-mail. */
export const verifyEmailCodeSchema = z.strictObject({
  email: emailAddressSchema,
  code: z.string().regex(/^\d{6,10}$/),
});

export const signedInResponseSchema = z.strictObject({
  accountStatus: accountStatusSchema,
});

export type RequestEmailCode = z.infer<typeof requestEmailCodeSchema>;
export type VerifyEmailCode = z.infer<typeof verifyEmailCodeSchema>;
export type SignedInResponse = z.infer<typeof signedInResponseSchema>;

import { z } from "zod";

/**
 * Every error code the API can return. Clients map these to user-facing text;
 * the server never sends messages, values or internal details.
 */
export const apiErrorCodes = [
  "unauthenticated",
  "registration_required",
  "account_inactive",
  "forbidden",
  "not_found",
  "reauthentication_required",
  "stronger_authentication_required",
  "conflict_of_interest",
  "invalid_input",
  "invalid_code",
  "idempotency_key_required",
  "idempotency_key_reused",
  "conflict",
  "cross_site_request",
  "rate_limited",
  "unavailable",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(apiErrorCodes),
    /** Names of invalid input fields, never their values. */
    fields: z.array(z.string()).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Header carrying the client-generated key for retry-safe commands. */
export const idempotencyKeyHeader = "Idempotency-Key";
/** Set on responses that replay the stored result of an earlier request. */
export const idempotentReplayHeader = "Idempotent-Replayed";

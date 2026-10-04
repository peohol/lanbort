/**
 * Reasons an authorization check can fail. `not_found` is used whenever the
 * caller must not learn whether the resource exists (PS-NFR-002); it is
 * indistinguishable from a resource that really does not exist.
 */
export const denialReasons = [
  "unauthenticated",
  // Signed in, but the account registration (name, 18+) is not completed.
  "registration_required",
  // Signed in, but the account is not active (deactivated, dormant,
  // suspended or closing): it keeps only its minimum access (PS-ADM-002).
  "account_inactive",
  "forbidden",
  "not_found",
  "reauthentication_required",
  "stronger_authentication_required",
  "conflict_of_interest",
] as const;

export type DenialReason = (typeof denialReasons)[number];

export type DomainErrorCode =
  | DenialReason
  | "invalid_input"
  | "idempotency_key_required"
  | "idempotency_key_reused"
  | "conflict";

/**
 * Expected, user-facing failure of a domain operation. The message is for
 * developers; clients only ever see the code and the optional field names.
 */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    /** Names of offending input fields. Never the values. */
    readonly fields: readonly string[] = [],
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class AuthorizationError extends DomainError {
  constructor(
    readonly action: string,
    readonly reason: DenialReason,
  ) {
    super(reason, `Denied ${action}: ${reason}`);
    this.name = "AuthorizationError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

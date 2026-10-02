export type AuthErrorCode = "invalid_code" | "rate_limited" | "unavailable";

export class AuthProviderError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(`Auth provider error: ${code}`);
    this.name = "AuthProviderError";
  }
}

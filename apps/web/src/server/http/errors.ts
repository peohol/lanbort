import { AuthProviderError } from "@lanbort/auth";
import type { ApiError, ApiErrorCode } from "@lanbort/contracts";
import { type DomainErrorCode, isDomainError } from "@lanbort/domain";

/** One status per error code, for every route. */
const statusByCode = {
  unauthenticated: 401,
  registration_required: 403,
  forbidden: 403,
  // Concealed and missing resources are the same response (PS-NFR-002).
  not_found: 404,
  reauthentication_required: 403,
  mfa_required: 403,
  conflict_of_interest: 403,
  invalid_input: 400,
  invalid_code: 400,
  idempotency_key_required: 400,
  idempotency_key_reused: 422,
  conflict: 409,
  cross_site_request: 403,
  rate_limited: 429,
  unavailable: 503,
  internal_error: 500,
} satisfies Record<ApiErrorCode, number>;

// Every domain error code must be a public API error code.
const domainCodesArePublic: readonly ApiErrorCode[] = [] as DomainErrorCode[];
void domainCodesArePublic;

const noStore = { "cache-control": "no-store" };

export function errorResponse(
  code: ApiErrorCode,
  fields: readonly string[] = [],
): Response {
  const body: ApiError = {
    error: fields.length > 0 ? { code, fields: [...fields] } : { code },
  };

  return Response.json(body, { status: statusByCode[code], headers: noStore });
}

/** Maps expected failures to their public code; anything else is a 500. */
export function toErrorResponse(error: unknown): Response | undefined {
  if (isDomainError(error)) {
    return errorResponse(error.code, error.fields);
  }

  if (error instanceof AuthProviderError) {
    return errorResponse(error.code);
  }

  return undefined;
}

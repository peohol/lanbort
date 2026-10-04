import {
  type ApiErrorCode,
  apiErrorSchema,
  idempotencyKeyHeader,
} from "@lanbort/contracts";

function nonJsonErrorCode(status: number): ApiErrorCode {
  if (status === 429) return "rate_limited";
  return status >= 500 ? "unavailable" : "internal_error";
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: ApiErrorCode | "network" };

/**
 * Same-origin JSON calls to Lånbort's API. Session cookies are HttpOnly and
 * travel automatically; the browser never handles tokens.
 */
export async function postJson<T = unknown>(
  path: string,
  body: unknown,
  options: { idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  return request<T>(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.idempotencyKey
        ? { [idempotencyKeyHeader]: options.idempotencyKey }
        : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

/** A same-origin read from Lånbort's API. */
export function getJson<T = unknown>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: "GET" });
}

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(path, init);
  } catch {
    return { ok: false, code: "network" };
  }

  let json: unknown;

  try {
    const text = await response.text();
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not our API's JSON, e.g. an error page from a proxy or the platform.
    return { ok: false, code: nonJsonErrorCode(response.status) };
  }

  if (response.ok) {
    return { ok: true, data: json as T };
  }

  const parsed = apiErrorSchema.safeParse(json);

  return {
    ok: false,
    code: parsed.success ? parsed.data.error.code : "internal_error",
  };
}

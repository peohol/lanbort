import {
  type ApiErrorCode,
  apiErrorSchema,
  idempotencyKeyHeader,
} from "@lanbort/contracts";

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
  let response: Response;

  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.idempotencyKey
          ? { [idempotencyKeyHeader]: options.idempotencyKey }
          : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, code: "network" };
  }

  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : null;

  if (response.ok) {
    return { ok: true, data: json as T };
  }

  const parsed = apiErrorSchema.safeParse(json);

  return {
    ok: false,
    code: parsed.success ? parsed.data.error.code : "internal_error",
  };
}

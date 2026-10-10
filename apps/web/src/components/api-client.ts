import {
  type ApiErrorCode,
  apiErrorSchema,
  idempotencyKeyHeader,
} from "@lanbort/contracts";

function nonJsonErrorCode(status: number): ApiErrorCode {
  if (status === 429) return "rate_limited";
  return status >= 500 ? "unavailable" : "internal_error";
}

/** Why a call failed: the API's own code, or no answer at all. */
export type ApiFailureCode = ApiErrorCode | "network";

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: ApiFailureCode };

/** How a command is sent; the API's commands take one key per attempt. */
export interface SendOptions {
  readonly idempotencyKey?: string;
  readonly method?: "POST" | "PATCH" | "DELETE";
}

/**
 * How long an answer may take before the call counts as unanswered, so a
 * dead connection does not leave a button waiting for as long as the
 * browser would. Enough for a chat archive part, and longer for a file,
 * on a slow mobile connection.
 */
const answerWithinMs = 60_000;
const fileAnswerWithinMs = 120_000;

const keyHeader = (options: SendOptions) =>
  options.idempotencyKey
    ? { [idempotencyKeyHeader]: options.idempotencyKey }
    : {};

/**
 * Same-origin JSON calls to Lånbort's API. Session cookies are HttpOnly and
 * travel automatically; the browser never handles tokens.
 */
export async function postJson<T = unknown>(
  path: string,
  body: unknown,
  options: SendOptions = {},
): Promise<ApiResult<T>> {
  return request<T>(path, {
    method: options.method ?? "POST",
    headers: { "content-type": "application/json", ...keyHeader(options) },
    body: JSON.stringify(body ?? {}),
  });
}

/** A file as the whole body, such as a photo of a thing. */
export async function postFile<T = unknown>(
  path: string,
  file: Blob,
  options: Pick<SendOptions, "idempotencyKey"> = {},
): Promise<ApiResult<T>> {
  return request<T>(path, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      ...keyHeader(options),
    },
    body: file,
    signal: AbortSignal.timeout(fileAnswerWithinMs),
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
    response = await fetch(path, {
      signal: AbortSignal.timeout(answerWithinMs),
      ...init,
    });
  } catch {
    return { ok: false, code: "network" };
  }

  let text: string;

  try {
    text = await response.text();
  } catch {
    // The connection broke, or the time ran out, while the answer came.
    return { ok: false, code: "network" };
  }

  let json: unknown;

  try {
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

import {
  idempotencyKeyHeader,
  idempotentReplayHeader,
} from "@lanbort/contracts";
import { type CommandResult, DomainError } from "@lanbort/domain";
import type { NextRequest } from "next/server";

/** The JSON body, or an `invalid_input` error for anything unparsable. */
export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainError("invalid_input", "Request body is not JSON", ["$"]);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The JSON body together with the route's path parameters. The path always
 * wins, so a body cannot point the command at another resource.
 */
export async function readJsonWithParams(
  request: NextRequest,
  params: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const body = await readJson(request);

  return isPlainObject(body) ? { ...body, ...params } : body;
}

/**
 * The raw body, refused as `invalid_input` on `field` once it exceeds
 * `maxBytes`. Reading stops there, so an oversized upload is never buffered.
 */
export async function readBytes(
  request: NextRequest,
  maxBytes: number,
  field: string,
): Promise<Uint8Array> {
  const tooLarge = () =>
    new DomainError("invalid_input", "Request body is too large", [field]);

  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    throw tooLarge();
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  if (request.body) {
    const reader = request.body.getReader();

    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      size += chunk.value.byteLength;

      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }

      chunks.push(chunk.value);
    }
  }

  if (size === 0) {
    throw new DomainError("invalid_input", "Request body is empty", [field]);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export function idempotencyKeyOf(request: NextRequest): string | undefined {
  return request.headers.get(idempotencyKeyHeader) ?? undefined;
}

/** A command's result; replays of an earlier request are marked. */
export function commandResponse<O>(result: CommandResult<O>): Response {
  return Response.json(result.output, {
    headers: result.replayed ? { [idempotentReplayHeader]: "true" } : {},
  });
}

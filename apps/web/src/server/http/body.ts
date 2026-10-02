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

export function idempotencyKeyOf(request: NextRequest): string | undefined {
  return request.headers.get(idempotencyKeyHeader) ?? undefined;
}

/** A command's result; replays of an earlier request are marked. */
export function commandResponse<O>(result: CommandResult<O>): Response {
  return Response.json(result.output, {
    headers: result.replayed ? { [idempotentReplayHeader]: "true" } : {},
  });
}

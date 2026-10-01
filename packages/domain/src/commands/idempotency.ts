import { createHash } from "node:crypto";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { DomainError } from "../errors";

/** Client-generated, e.g. a UUID. Long enough to be unguessable in practice. */
export const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,128}$/;

type Canonical =
  null | boolean | number | string | Canonical[] | { [key: string]: Canonical };

/** Same logical input, same JSON: object keys are sorted recursively. */
function canonicalize(value: unknown): Canonical {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  return value as Canonical;
}

export function requestHash(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input ?? null)))
    .digest("hex");
}

export interface IdempotencyClaim {
  readonly scope: string;
  readonly command: string;
  readonly key: string;
  readonly hash: string;
}

/**
 * Serializes every execution of the same (actor scope, command, key) for the
 * rest of the transaction, then returns the stored result if the command
 * already completed. Concurrent duplicates wait here and replay the first
 * result instead of executing again.
 */
export async function findCompleted(
  tx: Kysely<Database>,
  claim: IdempotencyClaim,
): Promise<unknown> {
  const lockKey = JSON.stringify([claim.scope, claim.command, claim.key]);

  await sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(
    tx,
  );

  const existing = await tx
    .selectFrom("app.idempotency_records")
    .select(["request_hash", "response"])
    .where("scope", "=", claim.scope)
    .where("command", "=", claim.command)
    .where("idempotency_key", "=", claim.key)
    .executeTakeFirst();

  if (!existing) {
    return undefined;
  }

  if (existing.request_hash !== claim.hash) {
    throw new DomainError(
      "idempotency_key_reused",
      `Idempotency key reused with different input for ${claim.command}`,
    );
  }

  return existing.response;
}

/**
 * Stores the result in the command's own transaction. The primary key is a
 * second line of defence: a duplicate insert aborts the whole transaction.
 */
export async function storeCompleted(
  tx: Kysely<Database>,
  claim: IdempotencyClaim,
  response: unknown,
): Promise<void> {
  await tx
    .insertInto("app.idempotency_records")
    .values({
      scope: claim.scope,
      command: claim.command,
      idempotency_key: claim.key,
      request_hash: claim.hash,
      response: JSON.stringify(response ?? null),
    })
    .execute();
}

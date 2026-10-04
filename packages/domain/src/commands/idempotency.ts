import { createHash } from "node:crypto";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { DomainError } from "../errors";

/** Client-generated, e.g. a UUID. Long enough to be unguessable in practice. */
export const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,128}$/;

type Canonical =
  null | boolean | number | string | Canonical[] | { [key: string]: Canonical };

/**
 * Same logical input, same JSON: object keys are sorted recursively. Values
 * with their own JSON form, such as dates, are represented by it, exactly as
 * `JSON.stringify` would.
 */
function canonicalize(value: unknown): Canonical {
  if (hasToJSON(value)) {
    return canonicalize(value.toJSON());
  }

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

function hasToJSON(value: unknown): value is { toJSON(): unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  );
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
 * Whether the same request already completed, without waiting for one in
 * progress: a cheap look before the command, which still replays under lock.
 */
export async function isCompleted(
  db: Kysely<Database>,
  claim: IdempotencyClaim,
): Promise<boolean> {
  const existing = await db
    .selectFrom("app.idempotency_records")
    .select("request_hash")
    .where("scope", "=", claim.scope)
    .where("command", "=", claim.command)
    .where("idempotency_key", "=", claim.key)
    .executeTakeFirst();

  return existing?.request_hash === claim.hash;
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

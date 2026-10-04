import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { loanCommitments } from "../loans/reservations";

/**
 * An obligation on the object that ordinary ownership changes must not break:
 * a reserved, active or unresolved loan (PS-OBJ-010, PS-OBJ-011). Each one
 * has the co-owner who is its responsible lender.
 */
export interface ObjectCommitment {
  readonly responsibleOwnerId: string;
}

/**
 * Where commitments come from. Loans arrive in Phase 3 (WP-31–WP-34), which
 * adds its source here instead of a parallel check, so leaving and deleting
 * see every commitment. A source that fails makes the command fail: nothing
 * proceeds on an unknown answer.
 */
export interface ObjectCommitmentSource {
  readonly name: string;
  load(
    db: Kysely<Database>,
    objectId: string,
  ): Promise<readonly ObjectCommitment[]>;
}

/** Loans that hold the object, or ended unresolved and await control. */
export const objectCommitmentSources: readonly ObjectCommitmentSource[] = [
  loanCommitments,
];

/** Every commitment on the object, from every source. */
export async function loadCommitments(
  db: Kysely<Database>,
  objectId: string,
  sources: readonly ObjectCommitmentSource[],
): Promise<ObjectCommitment[]> {
  const loaded = [];

  // One transaction serves every source, so they run one after another.
  for (const source of sources) {
    loaded.push(...(await source.load(db, objectId)));
  }

  return loaded;
}

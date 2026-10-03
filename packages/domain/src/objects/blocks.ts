import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import {
  loanPossessionBlocks,
  loanReservationBlocks,
} from "../loans/reservations";
import type { AvailabilityBlock } from "./availability";
import {
  coOwnerFreezeBlocks,
  coOwnerRestrictionBlocks,
} from "./co-owner-blocks";

/**
 * Where blocks on actual availability come from. Each later domain that can
 * make an object unavailable for new loans (approved loans, unresolved
 * possession, co-owner restrictions) adds one source here, and every read and
 * every loan decision sees it through {@link loadAvailabilityBlocks}.
 */
export interface AvailabilityBlockSource {
  readonly name: string;
  load(
    db: Kysely<Database>,
    objectIds: readonly string[],
  ): Promise<readonly (AvailabilityBlock & { readonly objectId: string })[]>;
}

export const availabilityBlockSources: readonly AvailabilityBlockSource[] = [
  coOwnerRestrictionBlocks,
  coOwnerFreezeBlocks,
  loanReservationBlocks,
  loanPossessionBlocks,
];

/** All blocks per object, from every source. */
export async function loadAvailabilityBlocks(
  db: Kysely<Database>,
  objectIds: readonly string[],
  sources: readonly AvailabilityBlockSource[] = availabilityBlockSources,
): Promise<Map<string, AvailabilityBlock[]>> {
  const blocks = new Map<string, AvailabilityBlock[]>(
    objectIds.map((id) => [id, []]),
  );

  if (objectIds.length === 0) {
    return blocks;
  }

  const loaded = await Promise.all(
    sources.map((source) => source.load(db, objectIds)),
  );

  for (const { objectId, ...block } of loaded.flat()) {
    blocks.get(objectId)?.push(block);
  }

  return blocks;
}

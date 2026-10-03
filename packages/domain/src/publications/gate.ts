import type { PublicationStatus } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { findEnvironment } from "../environment/store";
import { type PublicationGate, publicationGate } from "./model";
import { findCurrentPublication, hasOwnerAccess } from "./store";

/**
 * The integration boundary for Phase 3 loan requests through an environment
 * (PS-OBJ-006, PS-ENV-011): whether a request may be made or approved now,
 * must wait, or must end neutrally. Phase 3 calls it in the transaction that
 * decides, with `lock`, after locking the object and before the environment
 * row is needed elsewhere (lock order in store.ts), so the publication cannot
 * change until the decision commits. It never looks at approved loans. It
 * does not decide whether the requester may find the object at all (blocks,
 * historical privacy under PS-ENV-009); discovery does that.
 */
export async function loadPublicationGate(
  db: Kysely<Database>,
  target: { objectId: string; environmentId: string },
  now: Date,
  options: { lock?: boolean } = {},
): Promise<{
  publicationId: string | null;
  status: PublicationStatus | null;
  gate: PublicationGate;
}> {
  const environment = await findEnvironment(db, target.environmentId);
  const publication =
    environment &&
    (await findCurrentPublication(
      db,
      target.objectId,
      target.environmentId,
      options,
    ));

  if (!environment || !publication) {
    return { publicationId: null, status: null, gate: "closed" };
  }

  return {
    publicationId: publication.id,
    status: publication.status,
    gate: publicationGate({
      environment,
      status: publication.status,
      ownerHasAccess: await hasOwnerAccess(
        db,
        target.objectId,
        target.environmentId,
        now,
      ),
    }),
  };
}

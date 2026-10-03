import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { acceptsNewActivity, effectiveState } from "../environment/model";
import { findCurrentMembership, findEnvironment } from "../environment/store";
import { loadFreezes } from "../objects/co-owner-blocks";
import type { ObjectState } from "../objects/state";
import { loadPublicationGate } from "../publications/gate";
import { isLive } from "../publications/model";
import { hasOwnerAccess } from "../publications/store";
import { blockedWithAny, friendsWithAny, lockPairsWith } from "../social/pair";
import { endedStanding, type LoanRequestStanding, openStanding } from "./model";

type Db = Kysely<Database>;

/** Where a request comes from, and the publication it builds on if any. */
export type RequestOrigin =
  | { readonly kind: "direct" }
  | {
      readonly kind: "environment";
      readonly environmentId: string;
      /** The request's publication; null when a new request is being made. */
      readonly publicationId: string | null;
    };

export interface OriginAssessment {
  readonly standing: LoanRequestStanding;
  /** The publication the request builds on now, for an environment origin. */
  readonly publicationId: string | null;
}

/**
 * PS-LOAN-002: whether the access a request needs still holds now. The one
 * check for making a request, showing it and (WP-31) approving it:
 * - the object takes new loans (active, not frozen by its co-owners) and the
 *   borrower is not one of its owners;
 * - no block either way between the borrower and any owner (PS-USR-006);
 * - direct: an active friendship with at least one owner (PS-USR-004);
 * - environment: the borrower's membership is active now, the same
 *   publication is still there, and its gate (WP-25) is open. A publication
 *   waiting for approval, or an environment that is winding down but may
 *   still cancel (PS-ENV-012), holds the request instead of ending it.
 *
 * Commands call it with `lock` after locking the object: it then locks the
 * environment, the membership and the publication (in that order) and the
 * social pairs, so nothing it looked at can change before the decision
 * commits. Whatever ends the access later ends open requests in the
 * database (the WP-30 migration).
 */
export async function assessOrigin(
  db: Db,
  object: ObjectState,
  borrowerId: string,
  origin: RequestOrigin,
  now: Date,
  options: { lock?: boolean } = {},
): Promise<OriginAssessment> {
  const publication =
    origin.kind === "environment"
      ? await assessEnvironment(db, object, borrowerId, origin, now, options)
      : null;

  if (options.lock) {
    await lockPairsWith(db, borrowerId, object.ownerIds);
  }

  const assessed = (standing: LoanRequestStanding): OriginAssessment => ({
    standing,
    publicationId: publication?.publicationId ?? null,
  });

  if (
    object.status !== "active" ||
    object.ownerIds.includes(borrowerId) ||
    (await loadFreezes(db, [object.objectId])).size > 0
  ) {
    return assessed(endedStanding("object_unavailable"));
  }

  if (await blockedWithAny(db, borrowerId, object.ownerIds)) {
    return assessed(endedStanding("access_lost"));
  }

  if (publication) {
    return assessed(publication.standing);
  }

  return assessed(
    (await friendsWithAny(db, borrowerId, object.ownerIds))
      ? openStanding
      : endedStanding("access_lost"),
  );
}

async function assessEnvironment(
  db: Db,
  object: ObjectState,
  borrowerId: string,
  origin: Extract<RequestOrigin, { kind: "environment" }>,
  now: Date,
  options: { lock?: boolean },
): Promise<OriginAssessment> {
  // Lock order: environment, membership, publication (publications/store.ts).
  const environment = await findEnvironment(db, origin.environmentId, options);
  const membership =
    environment &&
    (await findCurrentMembership(db, environment.id, borrowerId, options));
  const gate = await loadPublicationGate(
    db,
    { objectId: object.objectId, environmentId: origin.environmentId },
    now,
    options,
  );
  const assessed = (standing: LoanRequestStanding): OriginAssessment => ({
    standing,
    publicationId: gate.publicationId,
  });

  if (
    !environment ||
    !membership ||
    effectiveState(membership, now) !== "active"
  ) {
    return assessed(endedStanding("access_lost"));
  }

  if (
    gate.publicationId === null ||
    (origin.publicationId !== null &&
      gate.publicationId !== origin.publicationId)
  ) {
    return assessed(endedStanding("publication_ended"));
  }

  switch (gate.gate) {
    case "open":
      return assessed(openStanding);
    case "on_hold":
      return assessed({ kind: "on_hold" });
    case "closed":
      // A winding-down environment holds what is waiting until it is final
      // (PS-ENV-012); then its publications end, and their requests with them.
      return assessed(
        !acceptsNewActivity(environment) &&
          gate.status !== null &&
          isLive(gate.status) &&
          (await hasOwnerAccess(db, object.objectId, environment.id, now))
          ? { kind: "on_hold" }
          : endedStanding("publication_ended"),
      );
  }
}

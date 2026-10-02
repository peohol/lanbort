import type {
  PublicationEndReason,
  PublicationStatus,
} from "@lanbort/contracts";
import {
  acceptsNewActivity,
  type EnvironmentRecord,
} from "../environment/model";

/**
 * Pure rules of environment publication (WP-25, PS-OBJ-006, PS-ENV-011,
 * PS-OBJ-017). A publication is the object's relation to one environment;
 * nothing here changes the object itself.
 */
export interface PublicationRecord {
  readonly id: string;
  readonly objectId: string;
  readonly environmentId: string;
  readonly publishedByUserId: string;
  readonly status: PublicationStatus;
  readonly endReason: PublicationEndReason | null;
  readonly createdAt: Date;
  readonly statusChangedAt: Date;
}

/** Pending and active publications need an owner with active access. */
export const livePublicationStatuses = ["pending", "active"] as const;

export type LivePublicationStatus = (typeof livePublicationStatuses)[number];

export function isLive(status: PublicationStatus): boolean {
  return (livePublicationStatuses as readonly string[]).includes(status);
}

/**
 * Where a publication starts, or returns to when a measure ends: waiting for
 * approval while the environment requires it (PS-ENV-011), active otherwise.
 */
export function liveStatusIn(
  environment: Pick<EnvironmentRecord, "requiresObjectApproval">,
): LivePublicationStatus {
  return environment.requiresObjectApproval ? "pending" : "active";
}

/**
 * What a publication means for future loan requests through it (the Phase 3
 * integration boundary, PS-ENV-011):
 * - `open`: new requests may be made and approved.
 * - `on_hold`: the publication waits for approval. No new requests; requests
 *   already made wait and cannot be approved until it is approved.
 * - `closed`: no publication, or it was withdrawn, lost its access, rejected,
 *   blocked or wound down. Requests that are not yet approved end neutrally.
 * Loans already approved are never affected by any of these.
 */
export type PublicationGate = "open" | "on_hold" | "closed";

export function publicationGate(input: {
  readonly environment: Pick<EnvironmentRecord, "state">;
  readonly status: PublicationStatus | null;
  /** An owner has active access now (PS-OBJ-006). */
  readonly ownerHasAccess: boolean;
}): PublicationGate {
  if (
    !acceptsNewActivity(input.environment) ||
    !input.ownerHasAccess ||
    input.status === null
  ) {
    return "closed";
  }

  switch (input.status) {
    case "active":
      return "open";
    case "pending":
      return "on_hold";
    default:
      return "closed";
  }
}

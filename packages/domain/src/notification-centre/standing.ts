import type {
  LoanRequest,
  NotificationKind,
  NotificationStanding,
} from "@lanbort/contracts";
import type { SocialPair } from "../social/pair";

/**
 * Whether a notification that asks for an answer still does (UX-IA-019),
 * from what it asked about as it stands now. Each answer reads only the
 * reader's own side: their request, their invitation, their friendship.
 */

/** A loan request, for the owner it was sent to or the borrower asked to confirm new terms. */
export function requestStanding(
  kind: NotificationKind,
  request: Pick<LoanRequest, "status" | "endReason">,
): NotificationStanding | null {
  if (request.status === "approved") return "accepted";
  if (request.status === "ended") {
    return request.endReason === "declined" ? "declined" : "lapsed";
  }

  switch (kind) {
    case "loan_request.received":
      return request.status === "requested" ? "open" : null;
    case "loan_request.terms_changed":
      return request.status === "awaiting_terms_confirmation"
        ? "open"
        : "accepted";
    default:
      return null;
  }
}

/** A friend request from the person, as the pair stands now. */
export function friendRequestStanding(
  pair: SocialPair | null,
): NotificationStanding {
  const friendship = pair?.openFriendship;

  if (friendship?.status === "active") return "accepted";

  return friendship?.status === "pending" &&
    friendship.requesterId === pair?.otherUserId
    ? "open"
    : "lapsed";
}

/** An invitation to become a member, by the membership it made. */
export function membershipInvitationStanding(
  membership: {
    readonly state: string;
    readonly origin: string;
    readonly endReason: string | null;
  } | null,
): NotificationStanding {
  if (membership === null || membership.origin !== "invitation") {
    return "lapsed";
  }

  switch (membership.state) {
    case "pending":
      return "open";
    case "active":
    case "passive":
      return "accepted";
    default:
      // Ended: declined, withdrawn, or left after it was accepted.
      return membership.endReason === "invitation_declined"
        ? "declined"
        : membership.endReason === "left"
          ? "accepted"
          : "lapsed";
  }
}

/**
 * The reader's requests for more information in one environment and their
 * answers to them, oldest first, and the membership that waits on them now.
 */
export interface InformationRequestHistory {
  readonly steps: readonly {
    readonly membershipId: string;
    readonly kind: "requested" | "answered";
    readonly occurredAt: Date;
  }[];
  readonly waitingMembershipId: string | null;
}

/**
 * A request for more information (PS-ENV-019), by the request it told of,
 * the last one made by the time it occurred: answered once the applicant
 * sent their answers after it, open while that request still waits on them,
 * and otherwise no longer waiting. Each request keeps its own outcome when
 * the administrators ask again or decide.
 */
export function informationRequestStanding(
  history: InformationRequestHistory,
  occurredAt: string,
): NotificationStanding {
  const at = Date.parse(occurredAt);
  const index = history.steps.reduce(
    (last, step, i) =>
      step.kind === "requested" && step.occurredAt.getTime() <= at ? i : last,
    -1,
  );
  const request = history.steps[index];

  if (!request) return "lapsed";

  const next = history.steps
    .slice(index + 1)
    .find((step) => step.membershipId === request.membershipId);

  if (next) return next.kind === "answered" ? "accepted" : "lapsed";

  return history.waitingMembershipId === request.membershipId
    ? "open"
    : "lapsed";
}

/** An invitation to a role, or to co-own an object, by how it was closed. */
export function invitationStanding(
  outcome: string | null,
): NotificationStanding {
  switch (outcome) {
    case null:
    case "pending":
      return "open";
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    default:
      return "lapsed";
  }
}

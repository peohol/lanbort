import {
  accountCreated,
  accountFalseIdentityRecorded,
  accountReactivated,
  accountRetiredAsDuplicate,
  accountsLinkedAsSamePerson,
  objectMovedFromDuplicate,
  registrationCompleted,
} from "../account/events";
import * as caseEvents from "../cases/events";
import {
  chatAccountKeyCreated,
  chatConversationStarted,
  chatDeviceLinked,
} from "../chat/events";
import {
  environmentCreated,
  environmentDetailsUpdated,
  environmentOwnershipClaimed,
  environmentOwnershipClaimWithdrawn,
  environmentOwnershipVacancyClosed,
  environmentRequirementsChanged,
  environmentRestrictionLifted,
  environmentRoleGranted,
  environmentRoleInvitationClosed,
  environmentRoleInvited,
  environmentTypeChangeClosed,
  environmentTypeChangeProposed,
  environmentWindDownCancelled,
  membershipActivated,
  membershipAnswersSubmitted,
  membershipConfirmationRequested,
  membershipInformationRequested,
  membershipInvited,
  membershipReviewClosed,
  membershipReviewRequested,
  membershipTransitionCompleted,
  membershipTransitionStarted,
  membershipTypeChangeResponded,
} from "../environment/events";
import type { EventDefinition } from "../events/catalog";
import * as loanEvents from "../loans/events";
import { moderationReportEscalated } from "../moderation/events";
import {
  coOwnerInvitationDeclined,
  coOwnerInvitationWithdrawn,
  coOwnerInvited,
  coOwnerJoined,
  objectCreated,
  objectDeletionConsented,
  objectDeletionConsentWithdrawn,
  objectFreezeEnded,
  objectImageAdded,
  objectRestored,
  objectRestrictionLifted,
  objectReverted,
  objectUpdated,
} from "../objects/events";
import { platformRoleGranted } from "../platform/events";
import {
  environmentObjectApprovalChanged,
  publicationApproved,
  publicationCreated,
  publicationReleasedFromApproval,
  publicationUnblocked,
} from "../publications/events";
import * as questionEvents from "../questions/events";
import * as reviewEvents from "../reviews/events";
import {
  friendshipAccepted,
  friendshipClosedByBlock,
  friendshipDeclined,
  friendshipEndedByAccountDeletion,
  friendshipRequested,
  friendshipWithdrawn,
  userBlockLifted,
} from "../social/events";

/** The event definitions a module exports. */
export function eventDefinitionsIn(
  module: Record<string, unknown>,
): EventDefinition<unknown>[] {
  return Object.values(module).filter(
    (value): value is EventDefinition<unknown> =>
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      "payload" in value &&
      "resourceType" in value,
  );
}

/**
 * What a restore may lose with the window after its backup (RPO,
 * docs/architecture/09) without anything deleted or restricted becoming
 * visible again (PS-NFR-014): new things and their course, grants and
 * lifts, and steps whose effect is another event's replay (noted below).
 * The people involved are told which period was lost.
 *
 * Every event type is either replayed (`restoreReplays`) or listed here, so
 * a new event type has to be classified before a restore can be trusted.
 */
export const restoreLosses: readonly EventDefinition<unknown>[] = [
  // Accounts: registration and reactivation. A duplicate or false identity
  // is an internal record; stopping the account is its own lifecycle event.
  accountCreated,
  registrationCompleted,
  accountReactivated,
  accountRetiredAsDuplicate,
  accountsLinkedAsSamePerson,
  accountFalseIdentityRecorded,
  objectMovedFromDuplicate,
  // Environments: what they say, who joins and how, roles given, proposals
  // and votes, lifted bars. Requirement changes passivate through their own
  // events.
  environmentCreated,
  environmentDetailsUpdated,
  environmentRequirementsChanged,
  environmentRoleGranted,
  environmentRoleInvited,
  environmentRoleInvitationClosed,
  environmentOwnershipClaimed,
  environmentOwnershipClaimWithdrawn,
  environmentOwnershipVacancyClosed,
  environmentWindDownCancelled,
  environmentTypeChangeProposed,
  environmentTypeChangeClosed,
  environmentRestrictionLifted,
  membershipActivated,
  membershipReviewRequested,
  membershipInvited,
  membershipInformationRequested,
  membershipAnswersSubmitted,
  membershipReviewClosed,
  membershipConfirmationRequested,
  membershipTypeChangeResponded,
  membershipTransitionStarted,
  membershipTransitionCompleted,
  // Objects: new objects, edits and images, co-ownership offers, a
  // co-owner's withdrawn veto, deletion consents.
  objectCreated,
  objectUpdated,
  objectRestored,
  objectImageAdded,
  objectReverted,
  coOwnerInvited,
  coOwnerInvitationWithdrawn,
  coOwnerInvitationDeclined,
  coOwnerJoined,
  objectRestrictionLifted,
  objectFreezeEnded,
  objectDeletionConsented,
  objectDeletionConsentWithdrawn,
  // Publications: new ones and the decisions that let them be found.
  publicationCreated,
  publicationApproved,
  publicationUnblocked,
  publicationReleasedFromApproval,
  environmentObjectApprovalChanged,
  // Friendship requests and acceptances, lifted blocks. A block's and an
  // account deletion's end of a friendship are those replays.
  friendshipRequested,
  friendshipAccepted,
  friendshipDeclined,
  friendshipWithdrawn,
  friendshipClosedByBlock,
  friendshipEndedByAccountDeletion,
  userBlockLifted,
  platformRoleGranted,
  moderationReportEscalated,
  // Loans, cases, reviews and questions are the parties' own course; a
  // review right that lapsed with a deleted account lapses again with it.
  ...eventDefinitionsIn(loanEvents),
  ...eventDefinitionsIn(caseEvents),
  ...eventDefinitionsIn(reviewEvents),
  ...eventDefinitionsIn(questionEvents),
  // Chat identities, linked devices and conversations started after the
  // backup: every group starts anew after a restore (ADR-0010 §9), so a
  // lost device or conversation is set up again by the people themselves.
  chatAccountKeyCreated,
  chatDeviceLinked,
  chatConversationStarted,
];

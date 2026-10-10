import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireMinimumAccess,
  requireRecentAuthentication,
  requireSystemProcess,
} from "../authorization/rules";
import { restoreProcess } from "../restore/policies";

/**
 * Private chat (ADR-0010 §9): the server authorizes delivery, never content.
 * A device acts only through its own sign-in session; a conversation exists
 * only for its participants; messages and commits are accepted only while
 * the conversation is open.
 */

/** The caller's chat device: the live device of this sign-in session. */
export interface ChatSessionResource {
  readonly hasDevice: boolean;
}

/** One of the caller's account's devices, or a link request for it. */
export interface OwnChatResource extends ChatSessionResource {
  /** It belongs to the caller's account and is still live or pending. */
  readonly own: boolean;
}

/** A conversation as the caller relates to it. */
export interface ChatConversationResource extends ChatSessionResource {
  readonly participant: boolean;
  /** Messages are accepted: no block, every participant active. */
  readonly open: boolean;
}

/** The person a new conversation is with (PS-COM-006). */
export interface ChatStartResource {
  /** Registered, active, and no block in either direction. */
  readonly reachable: boolean;
  readonly friends: boolean;
  /** The caller received the structured contact from them. */
  readonly invitedByContext: boolean;
}

/** A loan logistics channel's conversation, as the caller relates to it. */
export interface LoanLogisticsChatResource {
  /** One of the two people the channel joins. */
  readonly party: boolean;
  /** The channel is open, or it has a conversation already. */
  readonly startable: boolean;
}

/**
 * Chat runs through the session's device. Without one the caller first
 * registers or links this device; the answer says nothing about any
 * conversation or other account.
 */
const sessionDevice: ResourceRule<ChatSessionResource, void> = ({
  resource,
}) => (resource.hasDevice ? allow : deny("forbidden"));

const ownResource: ResourceRule<OwnChatResource, void> = ({ resource }) =>
  resource.own ? allow : deny("not_found");

/** Anyone but the participants gets the same answer as for nothing. */
const participant: ResourceRule<ChatConversationResource, void> = ({
  resource,
}) => (resource.participant ? allow : deny("not_found"));

/** A block or an inactive participant closes ordinary chat (PS-USR-006). */
const openConversation: ResourceRule<ChatConversationResource, void> = ({
  resource,
}) => (resource.open ? allow : deny("forbidden"));

/**
 * A blocked, missing or inactive person looks like no one (PS-USR-006).
 * Friends may start a conversation; anyone else only from a structured
 * contact the caller received from them (PS-COM-006, PS-USR-005).
 */
const reachablePerson: ResourceRule<ChatStartResource, void> = ({
  resource,
}) => (resource.reachable ? allow : deny("not_found"));

const legitimateContact: ResourceRule<ChatStartResource, void> = ({
  resource,
}) =>
  resource.friends || resource.invitedByContext ? allow : deny("forbidden");

/** Registering the account's first device: a new account key. */
export const registerChatAccountPolicy = definePolicy<void, void>({
  action: "chat.register_account",
  actor: [requireActiveAccount],
});

/**
 * A reset replaces the account key and shuts out every device (ADR-0010
 * §8), so it needs a recent sign-in as well.
 */
export const resetChatAccountPolicy = definePolicy<void, void>({
  action: "chat.reset_account",
  actor: [requireActiveAccount, requireRecentAuthentication()],
});

/** A new device in this session asks to be linked. */
export const requestChatLinkPolicy = definePolicy<void, void>({
  action: "chat.request_link",
  actor: [requireActiveAccount],
});

/** The new device follows its own request. */
export const readChatLinkStatusPolicy = definePolicy<OwnChatResource, void>({
  action: "chat.read_link_status",
  actor: [requireActiveAccount],
  resource: [ownResource],
});

export const finishChatLinkPolicy = definePolicy<OwnChatResource, void>({
  action: "chat.finish_link",
  actor: [requireActiveAccount],
  resource: [ownResource],
});

/** An existing device sees and approves the account's pending requests. */
export const listChatLinkRequestsPolicy = definePolicy<
  ChatSessionResource,
  void
>({
  action: "chat.list_link_requests",
  actor: [requireActiveAccount],
  resource: [sessionDevice],
});

export const approveChatLinkPolicy = definePolicy<OwnChatResource, void>({
  action: "chat.approve_link",
  actor: [requireActiveAccount],
  resource: [sessionDevice, ownResource],
});

/**
 * History archives (ADR-0010 §5): the approving device stores its history
 * for the new one; only the account's own devices see an archive.
 */
export const createChatArchivePolicy = definePolicy<ChatSessionResource, void>({
  action: "chat.create_archive",
  actor: [requireActiveAccount],
  resource: [sessionDevice],
});

const archivePolicy = (action: string) =>
  definePolicy<OwnChatResource, void>({
    action,
    actor: [requireActiveAccount],
    resource: [sessionDevice, ownResource],
  });

export const putChatArchivePartPolicy = archivePolicy("chat.put_archive_part");
export const readChatArchivePartPolicy = archivePolicy(
  "chat.read_archive_part",
);

/** Giving up an archive is kept for an account no longer active. */
export const deleteChatArchivePolicy = definePolicy<OwnChatResource, void>({
  action: "chat.delete_archive",
  actor: [requireMinimumAccess],
  resource: [sessionDevice, ownResource],
});

/**
 * The recovery key (ADR-0010 §8, PS-COM-019). A device makes it and keeps
 * the backup up to date; a session without chat reads the backup and
 * restores with it. Only the key opens the backup, and only the account
 * key in it can sign the restore, so the server holds nothing to guess.
 */
export const createChatRecoveryKeyPolicy = definePolicy<
  ChatSessionResource,
  void
>({
  action: "chat.create_recovery_key",
  actor: [requireActiveAccount],
  resource: [sessionDevice],
});

export const backUpChatHistoryPolicy = definePolicy<OwnChatResource, void>({
  action: "chat.back_up_history",
  actor: [requireActiveAccount],
  resource: [sessionDevice, ownResource],
});

/** The account's recovery key, if it has one. */
export interface ChatRecoveryResource {
  readonly exists: boolean;
}

const recoveryKeyExists: ResourceRule<ChatRecoveryResource, void> = ({
  resource,
}) => (resource.exists ? allow : deny("not_found"));

export const readChatRecoveryBackupPolicy = definePolicy<
  ChatRecoveryResource,
  void
>({
  action: "chat.read_recovery_backup",
  actor: [requireActiveAccount],
  resource: [recoveryKeyExists],
});

export const restoreChatAccountPolicy = definePolicy<
  ChatRecoveryResource,
  void
>({
  action: "chat.restore_account",
  actor: [requireActiveAccount],
  resource: [recoveryKeyExists],
});

/** «Ikke nå» and the one reminder: about the caller's own account. */
export const answerChatRecoveryPromptPolicy = definePolicy<void, void>({
  action: "chat.answer_recovery_prompt",
  actor: [requireActiveAccount],
});

/**
 * Revoking one of the account's devices, also this one at sign-out. Kept
 * for an account that is no longer active, so a lost device can always be
 * shut out (PS-ADM-002).
 */
export const revokeChatDevicePolicy = definePolicy<OwnChatResource, void>({
  action: "chat.revoke_device",
  actor: [requireMinimumAccess],
  resource: [sessionDevice, ownResource],
});

/** «Mine enheter». The account's own devices; nothing to decide on them. */
export const readOwnChatDevicesPolicy = definePolicy<unknown, void>({
  action: "chat.read_own_devices",
  actor: [requireMinimumAccess],
});

export const publishChatKeyPackagesPolicy = definePolicy<
  ChatSessionResource,
  void
>({
  action: "chat.publish_key_packages",
  actor: [requireActiveAccount],
  resource: [sessionDevice],
});

export const startChatConversationPolicy = definePolicy<
  ChatStartResource,
  void
>({
  action: "chat.start_conversation",
  actor: [requireActiveAccount],
  resource: [reachablePerson, legitimateContact],
});

/**
 * WP-44 (PS-COM-007): either of a loan logistics channel's two people starts
 * its conversation while the channel is open; anyone else gets the same
 * answer as for no channel. Once started, asking again gives it back, also
 * after the channel closed. A block is what the channel is for, so it does
 * not count here.
 */
export const startLoanLogisticsChatPolicy = definePolicy<
  LoanLogisticsChatResource,
  void
>({
  action: "chat.start_loan_logistics",
  actor: [requireActiveAccount],
  resource: [
    ({ resource }) => (resource.party ? allow : deny("not_found")),
    ({ resource }) => (resource.startable ? allow : deny("forbidden")),
  ],
});

/** Seeing one's conversations and their keys, also after deactivation. */
const conversationReadPolicy = <
  R extends ChatConversationResource = ChatConversationResource,
>(
  action: string,
) =>
  definePolicy<R, void>({
    action,
    actor: [requireMinimumAccess],
    resource: [participant],
  });

export const readChatConversationPolicy = conversationReadPolicy(
  "chat.read_conversation",
);
export const readChatDirectoryPolicy = conversationReadPolicy<
  ChatConversationResource & { readonly directory: unknown }
>("chat.read_directory");
export const hideChatConversationPolicy = conversationReadPolicy(
  "chat.hide_conversation",
);
export const muteChatConversationPolicy = conversationReadPolicy(
  "chat.mute_conversation",
);
export const readChatMessageNotificationsPolicy = conversationReadPolicy(
  "chat.read_message_notifications",
);

/** Whether the caller can write to someone: about their own conversations. */
export const readChatContactPolicy = definePolicy<unknown, void>({
  action: "chat.read_contact",
  actor: [requireMinimumAccess],
});

/** The caller's own list; each entry is theirs by construction. */
export const listChatConversationsPolicy = definePolicy<unknown, void>({
  action: "chat.list_conversations",
  actor: [requireMinimumAccess],
});

/** Changing the group or writing in it: an open conversation, by a device. */
const conversationWritePolicy = (action: string) =>
  definePolicy<ChatConversationResource, void>({
    action,
    actor: [requireActiveAccount],
    resource: [participant, sessionDevice, openConversation],
  });

export const claimChatKeyPackagesPolicy = conversationWritePolicy(
  "chat.claim_key_packages",
);
export const submitChatCommitPolicy =
  conversationWritePolicy("chat.submit_commit");
export const sendChatMessagePolicy =
  conversationWritePolicy("chat.send_message");

/** The device's own inbox: what is waiting for it, and what it has fetched. */
const inboxPolicy = (action: string) =>
  definePolicy<ChatSessionResource, void>({
    action,
    actor: [requireMinimumAccess],
    resource: [sessionDevice],
  });

export const readChatInboxPolicy = inboxPolicy("chat.read_inbox");
export const acknowledgeChatInboxPolicy = inboxPolicy("chat.acknowledge");

/** Deletes what the delivery service may no longer keep (ADR-0010 §8). */
export const chatRetentionProcess = "chat.retention";

export const purgeChatDeliveryPolicy = definePolicy<void, void>({
  action: "chat.purge_expired",
  actor: [requireSystemProcess(chatRetentionProcess)],
});

/** After a restore, every conversation starts a new group (ADR-0010 §9). */
export const restartChatGroupsPolicy = definePolicy<void, void>({
  action: "chat.restart_groups",
  actor: [requireSystemProcess(restoreProcess)],
});

export const chatPolicies = [
  registerChatAccountPolicy,
  resetChatAccountPolicy,
  requestChatLinkPolicy,
  readChatLinkStatusPolicy,
  finishChatLinkPolicy,
  listChatLinkRequestsPolicy,
  approveChatLinkPolicy,
  createChatArchivePolicy,
  putChatArchivePartPolicy,
  readChatArchivePartPolicy,
  deleteChatArchivePolicy,
  createChatRecoveryKeyPolicy,
  backUpChatHistoryPolicy,
  readChatRecoveryBackupPolicy,
  restoreChatAccountPolicy,
  answerChatRecoveryPromptPolicy,
  revokeChatDevicePolicy,
  readOwnChatDevicesPolicy,
  publishChatKeyPackagesPolicy,
  startChatConversationPolicy,
  readChatContactPolicy,
  startLoanLogisticsChatPolicy,
  readChatConversationPolicy,
  readChatDirectoryPolicy,
  hideChatConversationPolicy,
  muteChatConversationPolicy,
  readChatMessageNotificationsPolicy,
  listChatConversationsPolicy,
  claimChatKeyPackagesPolicy,
  submitChatCommitPolicy,
  sendChatMessagePolicy,
  readChatInboxPolicy,
  acknowledgeChatInboxPolicy,
  purgeChatDeliveryPolicy,
  restartChatGroupsPolicy,
];

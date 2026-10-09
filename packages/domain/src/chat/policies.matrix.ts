import { type Actor, anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { restoreProcess } from "../restore/policies";
import { testUserActor } from "../testing/actors";
import {
  acknowledgeChatInboxPolicy,
  approveChatLinkPolicy,
  type ChatConversationResource,
  type ChatSessionResource,
  type ChatStartResource,
  type LoanLogisticsChatResource,
  chatRetentionProcess,
  claimChatKeyPackagesPolicy,
  finishChatLinkPolicy,
  hideChatConversationPolicy,
  muteChatConversationPolicy,
  readChatMessageNotificationsPolicy,
  listChatConversationsPolicy,
  listChatLinkRequestsPolicy,
  type OwnChatResource,
  publishChatKeyPackagesPolicy,
  purgeChatDeliveryPolicy,
  readChatConversationPolicy,
  readChatDirectoryPolicy,
  readChatInboxPolicy,
  readChatLinkStatusPolicy,
  readOwnChatDevicesPolicy,
  registerChatAccountPolicy,
  requestChatLinkPolicy,
  resetChatAccountPolicy,
  restartChatGroupsPolicy,
  revokeChatDevicePolicy,
  sendChatMessagePolicy,
  startChatConversationPolicy,
  startLoanLogisticsChatPolicy,
  submitChatCommitPolicy,
} from "./policies";

const user = testUserActor();
const deactivated = testUserActor({ accountStatus: "deactivated" });
const pending = testUserActor({ accountStatus: "pending_registration" });
const longAgo = new Date(Date.now() - 60 * 60 * 1000);
const staleSession = testUserActor({
  authentication: {
    sessionId: "stale",
    assurance: "aal1",
    methods: [{ method: "otp", at: longAgo }],
  },
});

function cases<R>(
  policy: Policy<R, void>,
  list: [string, Actor, R, "allow" | DenialReason][],
) {
  return policyMatrix(
    policy,
    list.map(([name, actor, resource, expected]): PolicyCase<R, void> => ({
      name,
      actor,
      resource,
      context: undefined,
      expected,
    })),
  );
}

const session = (hasDevice: boolean): ChatSessionResource => ({ hasDevice });
const own = (hasDevice: boolean, mine: boolean): OwnChatResource => ({
  hasDevice,
  own: mine,
});
const conversation = (
  overrides: Partial<ChatConversationResource> = {},
): ChatConversationResource => ({
  participant: true,
  hasDevice: true,
  open: true,
  ...overrides,
});
const person = (overrides: Partial<ChatStartResource> = {}) => ({
  reachable: true,
  friends: false,
  invitedByContext: false,
  ...overrides,
});

/** Account-level actions with no resource of their own. */
const accountAction = <R>(policy: Policy<R, void>, minimum: boolean) =>
  cases<R>(policy, [
    ["an active account", user, undefined as R, "allow"],
    [
      "a deactivated account",
      deactivated,
      undefined as R,
      minimum ? "allow" : "account_inactive",
    ],
    [
      "an unfinished registration",
      pending,
      undefined as R,
      "registration_required",
    ],
    ["anonymous caller", anonymousActor, undefined as R, "unauthenticated"],
  ]);

const ownAction = (
  policy: Policy<OwnChatResource, void>,
  needsDevice: boolean,
  minimum = false,
) =>
  cases(policy, [
    ["its own, from a device", user, own(true, true), "allow"],
    [
      "its own, from a session without a device",
      user,
      own(false, true),
      needsDevice ? "forbidden" : "allow",
    ],
    ["someone else's or expired", user, own(true, false), "not_found"],
    [
      "a deactivated account",
      deactivated,
      own(true, true),
      minimum ? "allow" : "account_inactive",
    ],
    ["anonymous caller", anonymousActor, own(true, true), "unauthenticated"],
  ]);

const sessionAction = (
  policy: Policy<ChatSessionResource, void>,
  minimum: boolean,
) =>
  cases(policy, [
    ["a session with a device", user, session(true), "allow"],
    ["a session without a device", user, session(false), "forbidden"],
    [
      "a deactivated account",
      deactivated,
      session(true),
      minimum ? "allow" : "account_inactive",
    ],
    ["anonymous caller", anonymousActor, session(true), "unauthenticated"],
  ]);

/** The rules look only at the conversation fields, whatever else is loaded. */
const readConversation = <R extends ChatConversationResource>(
  policy: Policy<R, void>,
) => {
  const as = (overrides: Partial<ChatConversationResource> = {}) =>
    conversation(overrides) as R;

  return cases<R>(policy, [
    ["a participant", user, as(), "allow"],
    ["a participant without a device", user, as({ hasDevice: false }), "allow"],
    ["a closed one", user, as({ open: false }), "allow"],
    ["anyone else", user, as({ participant: false }), "not_found"],
    ["a deactivated participant", deactivated, as(), "allow"],
    ["anonymous caller", anonymousActor, as(), "unauthenticated"],
  ]);
};

const writeConversation = (policy: Policy<ChatConversationResource, void>) =>
  cases(policy, [
    ["a participant's device", user, conversation(), "allow"],
    [
      "anyone else",
      user,
      conversation({ participant: false, open: false, hasDevice: false }),
      "not_found",
    ],
    [
      "a session without a device",
      user,
      conversation({ hasDevice: false }),
      "forbidden",
    ],
    ["a closed conversation", user, conversation({ open: false }), "forbidden"],
    [
      "a deactivated participant",
      deactivated,
      conversation(),
      "account_inactive",
    ],
    ["anonymous caller", anonymousActor, conversation(), "unauthenticated"],
  ]);

const systemOnly = (policy: Policy<void, void>, process: string) =>
  cases(policy, [
    ["its process", systemActor(process), undefined, "allow"],
    [
      "another process",
      systemActor("notifications.deadlines"),
      undefined,
      "forbidden",
    ],
    ["a user", user, undefined, "forbidden"],
  ]);

export const chatMatrices = [
  accountAction(registerChatAccountPolicy, false),
  cases(resetChatAccountPolicy, [
    ["right after signing in", user, undefined, "allow"],
    [
      "a session from long ago",
      staleSession,
      undefined,
      "reauthentication_required",
    ],
    ["a deactivated account", deactivated, undefined, "account_inactive"],
    ["anonymous caller", anonymousActor, undefined, "unauthenticated"],
  ]),
  accountAction(requestChatLinkPolicy, false),
  ownAction(readChatLinkStatusPolicy, false),
  ownAction(finishChatLinkPolicy, false),
  sessionAction(listChatLinkRequestsPolicy, false),
  ownAction(approveChatLinkPolicy, true),
  ownAction(revokeChatDevicePolicy, true, true),
  accountAction(readOwnChatDevicesPolicy, true),
  sessionAction(publishChatKeyPackagesPolicy, false),
  cases(startChatConversationPolicy, [
    ["a friend", user, person({ friends: true }), "allow"],
    [
      "someone whose request or question the caller received",
      user,
      person({ invitedByContext: true }),
      "allow",
    ],
    ["a stranger without a context", user, person(), "forbidden"],
    [
      "someone blocked either way, gone or missing",
      user,
      person({ reachable: false, friends: true }),
      "not_found",
    ],
    [
      "a deactivated account",
      deactivated,
      person({ friends: true }),
      "account_inactive",
    ],
    [
      "anonymous caller",
      anonymousActor,
      person({ friends: true }),
      "unauthenticated",
    ],
  ]),
  cases<LoanLogisticsChatResource>(startLoanLogisticsChatPolicy, [
    [
      "a party of an open channel",
      user,
      { party: true, startable: true },
      "allow",
    ],
    [
      "a party of a closed channel without a conversation",
      user,
      { party: true, startable: false },
      "forbidden",
    ],
    [
      "someone else, or no channel",
      user,
      { party: false, startable: true },
      "not_found",
    ],
    [
      "a deactivated party",
      deactivated,
      { party: true, startable: true },
      "account_inactive",
    ],
    [
      "anonymous caller",
      anonymousActor,
      { party: true, startable: true },
      "unauthenticated",
    ],
  ]),
  readConversation(readChatConversationPolicy),
  readConversation(readChatDirectoryPolicy),
  readConversation(hideChatConversationPolicy),
  readConversation(muteChatConversationPolicy),
  readConversation(readChatMessageNotificationsPolicy),
  accountAction(listChatConversationsPolicy, true),
  writeConversation(claimChatKeyPackagesPolicy),
  writeConversation(submitChatCommitPolicy),
  writeConversation(sendChatMessagePolicy),
  sessionAction(readChatInboxPolicy, true),
  sessionAction(acknowledgeChatInboxPolicy, true),
  systemOnly(purgeChatDeliveryPolicy, chatRetentionProcess),
  systemOnly(restartChatGroupsPolicy, restoreProcess),
];

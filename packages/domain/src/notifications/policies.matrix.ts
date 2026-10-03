import { type Actor, anonymousActor, systemActor } from "../actor";
import type { Policy } from "../authorization/policy";
import { type PolicyCase, policyMatrix } from "../authorization/policy-matrix";
import type { DenialReason } from "../errors";
import { testUserActor } from "../testing/actors";
import {
  listNotificationsPolicy,
  markAllNotificationsReadPolicy,
  markNotificationsReadPolicy,
  type NotificationsResource,
  notificationDeadlineProcess,
  notifyLoanDeadlinesPolicy,
  readNotificationPreferencesPolicy,
  setNotificationPreferencePolicy,
} from "./policies";

const me = testUserActor();
const someoneElse = testUserActor();
const pendingAccount = testUserActor({ accountStatus: "pending_registration" });

const expectCase = <R>(
  name: string,
  actor: Actor,
  resource: R,
  expected: "allow" | DenialReason,
): PolicyCase<R, void> => ({
  name,
  actor,
  resource,
  context: undefined,
  expected,
});

const ownMatrix = (policy: Policy<unknown, void>) =>
  policyMatrix(policy, [
    expectCase("a registered user", me, undefined, "allow"),
    expectCase(
      "an unfinished registration",
      pendingAccount,
      undefined,
      "registration_required",
    ),
    expectCase(
      "anonymous caller",
      anonymousActor,
      undefined,
      "unauthenticated",
    ),
    expectCase(
      "a system process",
      systemActor(notificationDeadlineProcess),
      undefined,
      "unauthenticated",
    ),
  ]);

const mine = (...recipientIds: string[]): NotificationsResource => ({
  recipientIds,
});

const notificationsMatrix = (policy: Policy<NotificationsResource, void>) =>
  policyMatrix(policy, [
    expectCase("the recipient", me, mine(me.userId, me.userId), "allow"),
    expectCase(
      "someone else's notification",
      me,
      mine(someoneElse.userId),
      "not_found",
    ),
    expectCase(
      "one of them someone else's",
      me,
      mine(me.userId, someoneElse.userId),
      "not_found",
    ),
    expectCase("no notification", me, mine(), "not_found"),
    expectCase(
      "an unfinished registration",
      pendingAccount,
      mine(pendingAccount.userId),
      "registration_required",
    ),
    expectCase(
      "anonymous caller",
      anonymousActor,
      mine(me.userId),
      "unauthenticated",
    ),
  ]);

export const notificationMatrices = [
  ownMatrix(listNotificationsPolicy),
  ownMatrix(readNotificationPreferencesPolicy),
  ownMatrix(setNotificationPreferencePolicy),
  notificationsMatrix(markNotificationsReadPolicy),
  notificationsMatrix(markAllNotificationsReadPolicy),
  policyMatrix(notifyLoanDeadlinesPolicy, [
    expectCase(
      "the deadline job",
      systemActor(notificationDeadlineProcess),
      undefined,
      "allow",
    ),
    expectCase(
      "another system process",
      systemActor("loan.returns"),
      undefined,
      "forbidden",
    ),
    expectCase("a signed-in user", me, undefined, "forbidden"),
    expectCase("anonymous caller", anonymousActor, undefined, "forbidden"),
  ]),
];

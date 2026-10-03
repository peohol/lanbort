import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireSystemProcess,
} from "../authorization/rules";

/** The notifications a command acts on, by whose they are. */
export interface NotificationsResource {
  readonly recipientIds: readonly string[];
}

/**
 * A user acts only on their own notifications. Someone else's look exactly
 * like ones that do not exist (PS-NFR-002), so ids reveal nothing.
 */
const ownNotifications: ResourceRule<NotificationsResource, void> = ({
  actor,
  resource,
}) =>
  actor.kind === "user" &&
  resource.recipientIds.length > 0 &&
  resource.recipientIds.every((id) => id === actor.userId)
    ? allow
    : deny("not_found");

/** The caller's own notification centre and preferences. */
const ownPolicy = (action: string) =>
  definePolicy<unknown, void>({ action, actor: [requireActiveAccount] });

export const listNotificationsPolicy = ownPolicy("notification.list");

export const readNotificationPreferencesPolicy = ownPolicy(
  "notification.read_preferences",
);

export const setNotificationPreferencePolicy = ownPolicy(
  "notification.set_preference",
);

const notificationsPolicy = (action: string) =>
  definePolicy<NotificationsResource, void>({
    action,
    actor: [requireActiveAccount],
    resource: [ownNotifications],
  });

export const markNotificationsReadPolicy = notificationsPolicy(
  "notification.mark_read",
);

export const markAllNotificationsReadPolicy = notificationsPolicy(
  "notification.mark_all_read",
);

/** Name of the scheduled job that tells parties about loan deadlines. */
export const notificationDeadlineProcess = "notifications.deadlines";

export const notifyLoanDeadlinesPolicy = definePolicy({
  action: "notification.notify_loan_deadlines",
  actor: [requireSystemProcess(notificationDeadlineProcess)],
});

export const notificationPolicies = [
  listNotificationsPolicy,
  readNotificationPreferencesPolicy,
  setNotificationPreferencePolicy,
  markNotificationsReadPolicy,
  markAllNotificationsReadPolicy,
  notifyLoanDeadlinesPolicy,
];

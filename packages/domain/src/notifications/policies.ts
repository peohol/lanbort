import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireMinimumAccess,
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

/**
 * The caller's own notification centre and preferences, also with minimum
 * access: they lead to the loans and cases an account that is not active
 * still finishes (PS-ADM-002).
 */
const ownPolicy = (action: string) =>
  definePolicy<unknown, void>({ action, actor: [requireMinimumAccess] });

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
    actor: [requireMinimumAccess],
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

/** Name of the scheduled job that sends notification e-mails (WP-41). */
export const notificationEmailProcess = "notifications.email";

export const deliverNotificationEmailsPolicy = definePolicy({
  action: "notification.deliver_emails",
  actor: [requireSystemProcess(notificationEmailProcess)],
});

/**
 * Name of the scheduled job that tells handlers about cases the database
 * returned to the queue by itself (WP-45).
 */
export const notificationCaseQueueProcess = "notifications.case_queue";

export const notifyCaseQueueReturnsPolicy = definePolicy({
  action: "notification.notify_case_queue_returns",
  actor: [requireSystemProcess(notificationCaseQueueProcess)],
});

export const notificationPolicies = [
  listNotificationsPolicy,
  readNotificationPreferencesPolicy,
  setNotificationPreferencePolicy,
  markNotificationsReadPolicy,
  markAllNotificationsReadPolicy,
  notifyLoanDeadlinesPolicy,
  deliverNotificationEmailsPolicy,
  notifyCaseQueueReturnsPolicy,
];

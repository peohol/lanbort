import { z } from "zod";

/**
 * Notifications (PS-COM-001–003). A notification only draws attention to
 * something that happened elsewhere: it is neither a chat message nor a
 * case, it carries no content of what happened, and it leads to the loan,
 * request, environment or person it is about (UX-INT-010).
 */

/** PS-COM-003: how much a notification matters. */
export const notificationLevels = [
  "required",
  "action",
  "information",
] as const;
export const notificationLevelSchema = z.enum(notificationLevels);

/**
 * Where a user can be told. In-app is the notification centre; e-mail is the
 * pilot's external reserve channel. Web push is not decided (OD-0004).
 */
export const notificationChannels = ["in_app", "email"] as const;
export const notificationChannelSchema = z.enum(notificationChannels);

export type NotificationLevel = z.infer<typeof notificationLevelSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/**
 * Every kind of notification and its level. The level follows from the
 * kind, never from the recipient's choice: events in an approved loan are
 * required (vision 06, «Påkrevde varsler»), events that invite an action
 * are action notifications, and the rest are information.
 */
export const notificationKinds = {
  "loan_request.received": "action",
  "loan_request.terms_confirmed": "action",
  "loan_request.terms_changed": "action",
  "loan_request.declined": "action",
  "loan_request.ended": "action",
  "loan.approved": "required",
  "loan.cancelled": "required",
  "loan.amendment_proposed": "required",
  "loan.amendment_accepted": "required",
  "loan.amendment_declined": "required",
  "loan.amendment_withdrawn": "required",
  "loan.handover_day_passed": "required",
  "loan.handover_reported": "required",
  "loan.not_completed": "required",
  "loan.return_due": "required",
  "loan.return_day_passed": "required",
  "loan.return_reported": "required",
  "loan.possession_uncertain": "required",
  "loan.ended_unresolved": "required",
  "loan.responsibility_offered": "action",
  "loan.responsibility_consent_requested": "required",
  "loan.responsibility_transferred": "required",
  "loan.responsibility_declined": "action",
  "loan.responsibility_withdrawn": "action",
  "social.friend_request": "action",
  "social.friend_request_accepted": "information",
  "environment.membership_invited": "action",
  "environment.membership_review_requested": "action",
  "environment.role_invited": "action",
  "environment.type_change_proposed": "action",
  "environment.requirements_changed": "action",
  "object.co_owner_invited": "action",
  "case.opened": "action",
  "case.waiting": "action",
  "case.assigned": "information",
  "case.assigned_to_you": "action",
  "case.your_turn": "action",
  "case.entry_added": "action",
  "case.statements_shared": "information",
  "case.closed": "information",
  "object.question_asked": "action",
  "object.question_replied": "information",
  "object.available": "information",
  "object.changed": "information",
} as const satisfies Record<string, NotificationLevel>;

export type NotificationKind = keyof typeof notificationKinds;

/**
 * The kinds that always go out by verified e-mail as the pilot's reserve
 * channel («Kanalstandard for pilot»): time-critical events in an approved
 * loan, each one of the examples vision 06 gives under «Påkrevde varsler».
 * Kansellering and forslag til endring; kommende and passert returtid; behov
 * for returavklaring (and its handover counterpart, with the 72-hour
 * deadline); konflikthendelser og vesentlige avvik. This is a rule per kind,
 * not a channel choice. Other required kinds stay in the app only, until
 * OD-0004 settles the channels per kind and level.
 */
export const emailReserveKinds = [
  "loan.cancelled",
  "loan.amendment_proposed",
  "loan.handover_day_passed",
  "loan.handover_reported",
  "loan.return_due",
  "loan.return_day_passed",
  "loan.return_reported",
  "loan.possession_uncertain",
] as const satisfies readonly NotificationKind[];

export const notificationKindSchema = z.enum(
  Object.keys(notificationKinds) as [NotificationKind, ...NotificationKind[]],
);

/**
 * What a notification leads to. A `user` target is the other person; a
 * `case` is an administrative case (WP-45), which only its participants and
 * handlers can open. An `object_subscription` target is the recipient's own
 * subscription, so opening it checks again that they still find the object.
 */
export const notificationTargetTypes = [
  "loan",
  "loan_request",
  "user",
  "environment",
  "object_invitation",
  "case",
  "object_question",
  "object_subscription",
] as const;
export const notificationTargetTypeSchema = z.enum(notificationTargetTypes);

export const notificationTargetSchema = z.strictObject({
  type: notificationTargetTypeSchema,
  id: z.uuid(),
});

/**
 * A short code that refines the kind, such as what the other party said
 * (`handed_over`) or which role an invitation is for. Never free text.
 */
export const notificationDetailSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,31}$/);

export const notificationIdSchema = z.uuid();

export const notificationSchema = z.strictObject({
  id: notificationIdSchema,
  kind: notificationKindSchema,
  level: notificationLevelSchema,
  detail: notificationDetailSchema.nullable(),
  target: notificationTargetSchema,
  occurredAt: z.iso.datetime(),
  /** Only the recipient ever sees this; it is never a read receipt. */
  readAt: z.iso.datetime().nullable(),
});

/** Lists come newest first, a page at a time. */
export const notificationPageSize = 50;

export const notificationListQuerySchema = z.strictObject({
  cursor: notificationIdSchema.optional(),
});

export const notificationListSchema = z.strictObject({
  notifications: z.array(notificationSchema),
  /** For the badge: all of the caller's unread notifications. */
  unreadCount: z.int().nonnegative(),
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: notificationIdSchema.nullable(),
});

export const markNotificationsReadSchema = z.strictObject({
  notificationIds: z
    .array(notificationIdSchema)
    .min(1)
    .max(notificationPageSize),
});

/** Everything up to and including the newest notification the caller saw. */
export const markAllNotificationsReadSchema = z.strictObject({
  through: notificationIdSchema,
});

export const notificationReadResultSchema = z.strictObject({
  unreadCount: z.int().nonnegative(),
});

interface ChannelRule {
  /** Whether the user may turn the channel on or off for the level. */
  readonly configurable: boolean;
  /** The pilot standard («Kanalstandard for pilot», 05-kommunikasjon). */
  readonly default: boolean;
}

/**
 * PS-COM-003 and the pilot's channel standard: required and action
 * notifications are always in the app, information can be turned off
 * entirely, and the external channel can be chosen for action and
 * information and starts off. The level is about the app only: whether a
 * required notification goes out by e-mail follows from its kind
 * ({@link emailReserveKinds}), not from a channel choice. Final defaults per
 * channel are OD-0004.
 */
export const notificationChannelRules = {
  required: { in_app: { configurable: false, default: true } },
  action: {
    in_app: { configurable: false, default: true },
    email: { configurable: true, default: false },
  },
  information: {
    in_app: { configurable: true, default: true },
    email: { configurable: true, default: false },
  },
} as const satisfies Record<
  NotificationLevel,
  Partial<Record<NotificationChannel, ChannelRule>>
>;

export function channelRule(
  level: NotificationLevel,
  channel: NotificationChannel,
): ChannelRule | undefined {
  return (
    notificationChannelRules[level] as Partial<
      Record<NotificationChannel, ChannelRule>
    >
  )[channel];
}

export const notificationPreferencesSchema = z.strictObject({
  levels: z.array(
    z.strictObject({
      level: notificationLevelSchema,
      channels: z.array(
        z.strictObject({
          channel: notificationChannelSchema,
          enabled: z.boolean(),
          configurable: z.boolean(),
        }),
      ),
    }),
  ),
});

/** Turns one configurable channel of one level on or off. */
export const setNotificationPreferenceSchema = z
  .strictObject({
    level: notificationLevelSchema,
    channel: notificationChannelSchema,
    enabled: z.boolean(),
  })
  .refine((input) => channelRule(input.level, input.channel)?.configurable, {
    path: ["channel"],
  });

export type NotificationTargetType = z.infer<
  typeof notificationTargetTypeSchema
>;
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationList = z.infer<typeof notificationListSchema>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export type SetNotificationPreference = z.infer<
  typeof setNotificationPreferenceSchema
>;

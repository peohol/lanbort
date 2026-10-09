import {
  channelRule,
  channelRules,
  emailReserveKinds,
  type NotificationChannel,
  type NotificationKind,
  type NotificationLevel,
  notificationKinds,
  notificationLevels,
  type NotificationPreferences,
  type NotificationSubject,
  type NotificationTarget,
  notificationTopics,
  subjectOf,
} from "@lanbort/contracts";

/**
 * A notification to make: who is told, what about, and where it leads. The
 * level follows from the kind ({@link levelOf}).
 */
export interface NotificationDraft {
  readonly recipientId: string;
  readonly kind: NotificationKind;
  readonly target: NotificationTarget;
  readonly detail?: string | null;
}

export function levelOf(kind: NotificationKind): NotificationLevel {
  return notificationKinds[kind];
}

/**
 * A user's stored choice for one configurable channel of one level, or of
 * one kind with choices of its own.
 */
export interface PreferenceChoice {
  /** The level, or the kind ({@link subjectOf}); stored as the level. */
  readonly level: NotificationSubject;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
}

/** Whether each channel is on, per subject: the choices over the pilot standard. */
export type EffectivePreferences = Readonly<
  Record<
    NotificationSubject,
    Readonly<Partial<Record<NotificationChannel, boolean>>>
  >
>;

const subjects: readonly NotificationSubject[] = [
  ...notificationLevels,
  ...notificationTopics,
];

export function effectivePreferences(
  choices: readonly PreferenceChoice[],
): EffectivePreferences {
  return Object.fromEntries(
    subjects.map((subject) => [
      subject,
      Object.fromEntries(
        Object.entries(channelRules(subject)).map(([channel, rule]) => {
          const choice = rule.configurable
            ? choices.find(
                (candidate) =>
                  candidate.level === subject && candidate.channel === channel,
              )
            : undefined;

          return [channel, choice?.enabled ?? rule.default];
        }),
      ),
    ]),
  ) as unknown as EffectivePreferences;
}

/**
 * PS-COM-003: whether a notification of `subject` ({@link subjectOf}) is
 * put in the app at all. Required and action notifications always are; only
 * information can be turned off, by its level or, for a kind with choices
 * of its own, by those. The choice only decides whether the user is told:
 * the domain never reads it (PS-COM-002).
 */
export function shownInApp(
  subject: NotificationSubject,
  preferences: EffectivePreferences,
): boolean {
  return (
    !channelRule(subject, "in_app")?.configurable ||
    preferences[subject].in_app === true
  );
}

const reserveKinds: ReadonlySet<NotificationKind> = new Set(emailReserveKinds);

/**
 * Whether a notification of `kind` also goes out by e-mail, the pilot's
 * external reserve channel: always for the time-critical kinds
 * ({@link emailReserveKinds}), which are required and so always in the app,
 * and otherwise only when the user chose e-mail for the level (or for the
 * kind, when it has its own choices). Only notifications that are in the app
 * go out, since the e-mail leads back to them.
 */
export function sendsEmail(
  kind: NotificationKind,
  preferences: EffectivePreferences,
): boolean {
  if (reserveKinds.has(kind)) {
    return true;
  }

  const subject = subjectOf(kind);
  return (
    shownInApp(subject, preferences) && preferences[subject].email === true
  );
}

function presentChannels(
  subject: NotificationSubject,
  preferences: EffectivePreferences,
) {
  return Object.entries(channelRules(subject)).map(([channel, rule]) => ({
    channel: channel as NotificationChannel,
    enabled: preferences[subject][channel as NotificationChannel] ?? false,
    configurable: rule.configurable,
  }));
}

export function presentPreferences(
  preferences: EffectivePreferences,
): NotificationPreferences {
  return {
    levels: notificationLevels.map((level) => ({
      level,
      channels: presentChannels(level, preferences),
    })),
    kinds: notificationTopics.map((kind) => ({
      kind,
      channels: presentChannels(kind, preferences),
    })),
  };
}

/**
 * One notification per recipient, kind and target for each source: the same
 * person can be reached by more than one rule (a party of two loans of the
 * same object), but is told once.
 */
export function distinctDrafts(
  drafts: readonly NotificationDraft[],
): NotificationDraft[] {
  const seen = new Set<string>();

  return drafts.filter((draft) => {
    const key = `${draft.recipientId}/${draft.kind}/${draft.target.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

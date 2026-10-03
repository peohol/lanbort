import {
  channelRule,
  emailReserveKinds,
  type NotificationChannel,
  type NotificationKind,
  type NotificationLevel,
  notificationChannelRules,
  notificationKinds,
  notificationLevels,
  type NotificationPreferences,
  type NotificationTarget,
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

/** A user's stored choice for one configurable channel of one level. */
export interface PreferenceChoice {
  readonly level: NotificationLevel;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
}

/** Whether each channel is on, per level: the choices over the pilot standard. */
export type EffectivePreferences = Readonly<
  Record<
    NotificationLevel,
    Readonly<Partial<Record<NotificationChannel, boolean>>>
  >
>;

export function effectivePreferences(
  choices: readonly PreferenceChoice[],
): EffectivePreferences {
  return Object.fromEntries(
    notificationLevels.map((level) => [
      level,
      Object.fromEntries(
        Object.entries(notificationChannelRules[level]).map(
          ([channel, rule]) => {
            const choice = rule.configurable
              ? choices.find(
                  (candidate) =>
                    candidate.level === level && candidate.channel === channel,
                )
              : undefined;

            return [channel, choice?.enabled ?? rule.default];
          },
        ),
      ),
    ]),
  ) as unknown as EffectivePreferences;
}

/**
 * PS-COM-003: whether a notification of `level` is put in the app at all.
 * Required and action notifications always are; only information can be
 * turned off. The choice only decides whether the user is told: the domain
 * never reads it (PS-COM-002).
 */
export function shownInApp(
  level: NotificationLevel,
  preferences: EffectivePreferences,
): boolean {
  return (
    !channelRule(level, "in_app")?.configurable ||
    preferences[level].in_app === true
  );
}

const reserveKinds: ReadonlySet<NotificationKind> = new Set(emailReserveKinds);

/**
 * Whether a notification of `kind` also goes out by e-mail, the pilot's
 * external reserve channel: required notifications only for the
 * time-critical kinds ({@link emailReserveKinds}), and the other levels only
 * when the user chose it. Only notifications that are in the app go out,
 * since the e-mail leads back to them.
 */
export function sendsEmail(
  kind: NotificationKind,
  preferences: EffectivePreferences,
): boolean {
  const level = levelOf(kind);

  return (
    shownInApp(level, preferences) &&
    preferences[level].email === true &&
    (level !== "required" || reserveKinds.has(kind))
  );
}

export function presentPreferences(
  preferences: EffectivePreferences,
): NotificationPreferences {
  return {
    levels: notificationLevels.map((level) => ({
      level,
      channels: Object.entries(notificationChannelRules[level]).map(
        ([channel, rule]) => ({
          channel: channel as NotificationChannel,
          enabled: preferences[level][channel as NotificationChannel] ?? false,
          configurable: rule.configurable,
        }),
      ),
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

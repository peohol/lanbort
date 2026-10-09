import {
  type DescribedNotification,
  type Notification,
  type NotificationKind,
  type NotificationLevel,
  type NotificationTargetType,
  productTimeZone,
} from "@lanbort/contracts";
import { notificationEmailSubjects } from "@lanbort/domain";
import type { IconName } from "@/components/icon";
import { calendarDay } from "./dates";

/** What a notification says: one line, and more where there is more. */
export interface NotificationWords {
  readonly title: string;
  readonly detail: string | null;
}

type About = DescribedNotification["about"];

/**
 * The sentence that names what happened, where the reader may see what it
 * is about (`about`). Without a name it needs, it gives way to the general
 * sentence below, so a deleted person or a hidden environment simply goes
 * unnamed (UX-PRIV-010).
 */
const named: Partial<
  Record<
    NotificationKind,
    (about: About, detail: string | null) => string | null
  >
> = {
  "loan_request.received": ({ thing, person }) =>
    thing && `${person ?? "Noen"} vil låne ${thing}`,
  "loan_request.terms_changed": ({ thing }) =>
    thing && `Vilkårene for ${thing} er endret og venter på deg`,
  "loan_request.declined": ({ thing }) =>
    thing && `Forespørselen om å låne ${thing} er avslått`,
  "loan_request.ended": ({ thing }) =>
    thing && `Forespørselen om å låne ${thing} er avsluttet`,
  "loan.approved": ({ thing }) => thing && `Lånet av ${thing} er godkjent`,
  "loan.cancelled": ({ thing }) => thing && `Lånet av ${thing} er kansellert`,
  "loan.amendment_proposed": ({ thing }) =>
    thing && `Det er foreslått en endring i lånet av ${thing}`,
  "loan.amendment_accepted": ({ thing }) =>
    thing && `Endringen i lånet av ${thing} er godtatt`,
  "loan.amendment_declined": ({ thing }) =>
    thing && `Den foreslåtte endringen i lånet av ${thing} er avslått`,
  "loan.amendment_withdrawn": ({ thing }) =>
    thing && `Den foreslåtte endringen i lånet av ${thing} er trukket tilbake`,
  "loan.handover_day_passed": ({ thing }) =>
    thing && `Overleveringsdagen for ${thing} er passert`,
  "loan.handover_reported": ({ thing, person }, detail) =>
    thing &&
    person &&
    (detail === "not_handed_over"
      ? `${person} sier at overleveringen av ${thing} ikke skjedde`
      : `${person} sier at ${thing} er overlevert`),
  "loan.not_completed": ({ thing }) =>
    thing && `Lånet av ${thing} er registrert som ikke gjennomført`,
  "loan.return_due": ({ thing }) => thing && `Siste dag for ${thing} er i dag`,
  "loan.return_day_passed": ({ thing }) =>
    thing && `Siste dag for ${thing} er passert uten avklart retur`,
  "loan.return_reported": ({ thing, person }, detail) =>
    thing && person
      ? (namedReturns[detail ?? ""]?.(person, thing) ?? null)
      : null,
  "loan.possession_uncertain": ({ thing }) =>
    thing && `Det er uklart hvem som har ${thing}`,
  "social.friend_request": ({ person }) =>
    person && `${person} vil bli venn med deg`,
  "social.friend_request_accepted": ({ person }) =>
    person && `${person} godtok venneforespørselen din`,
  "environment.membership_invited": ({ place }) =>
    place && `Du er invitert til ${place}`,
  "environment.role_invited": ({ place }, detail) =>
    place &&
    `Du er spurt om å bli ${detail === "owner" ? "eier" : "administrator"} i ${place}`,
  "environment.membership_review_requested": ({ place }) =>
    place && `En søknad om medlemskap i ${place} venter på behandling`,
  "environment.requirements_changed": ({ place }) =>
    place && `Kravene i ${place} er endret`,
  "environment.type_change_proposed": ({ place }) =>
    place && `Det er foreslått å endre typen til ${place}`,
  "object.co_owner_invited": ({ thing }) =>
    thing && `Du er invitert til å bli medeier av ${thing}`,
};

const namedReturns: Record<string, (person: string, thing: string) => string> =
  {
    returned: (person, thing) => `${person} har meldt ${thing} returnert`,
    still_has: (person, thing) => `${person} sier at de fortsatt har ${thing}`,
    received: (person, thing) =>
      `${person} har bekreftet at ${thing} er levert tilbake`,
    not_received: (person, thing) =>
      `${person} sier at ${thing} ikke er levert tilbake`,
  };

/**
 * The general sentence: the same as the notification's e-mail, which names
 * only the kind of thing that happened (PS-COM-001), so a new kind needs one
 * sentence, in one place. Where the notification's `detail` says more (what
 * the other party said, which role is offered), the app says it.
 */
const refinements: Partial<
  Record<
    NotificationKind,
    (detail: string | null) => string | NotificationWords | undefined
  >
> = {
  "chat.device_linked": () => ({
    title: notificationEmailSubjects["chat.device_linked"],
    detail:
      "Enheten kan motta nye meldinger fra nå av. Den får ikke tidligere meldinger automatisk. Var det ikke deg, fjern den i Mine enheter.",
  }),
  "loan.handover_reported": (detail) =>
    detail === "not_handed_over"
      ? "Den andre parten sier at overleveringen ikke skjedde"
      : "Den andre parten sier at overleveringen skjedde",
  "loan.return_reported": (detail) => returnTexts[detail ?? ""],
  "environment.role_invited": (detail) =>
    detail === "owner"
      ? "Du er spurt om å bli eier av et miljø"
      : "Du er spurt om å bli administrator i et miljø",
};

const returnTexts: Record<string, string> = {
  returned: "Låntakeren sier at objektet er levert tilbake",
  still_has: "Låntakeren sier at de fortsatt har objektet",
  received: "Utlåneren har bekreftet at objektet er levert tilbake",
  not_received: "Utlåneren sier at objektet ikke er levert tilbake",
};

const invitationAnswers = {
  accepted: "Du takket ja.",
  declined: "Du takket nei.",
  lapsed: "Invitasjonen gjelder ikke lenger.",
};

const requestAnswers = {
  accepted: "Forespørselen er godtatt.",
  declined: "Forespørselen er avslått.",
  lapsed: "Forespørselen gjelder ikke lenger.",
};

/**
 * What became of a notification that asked for an answer (UX-IA-019): the
 * answer once given anywhere, so it never asks again, or that it no longer
 * applies, without a reason (PS-USR-011).
 */
const answers: Partial<
  Record<NotificationKind, Record<"accepted" | "declined" | "lapsed", string>>
> = {
  "loan_request.received": requestAnswers,
  "loan_request.terms_changed": {
    ...requestAnswers,
    accepted: "Du har bekreftet vilkårene.",
  },
  "social.friend_request": {
    accepted: "Dere er venner.",
    declined: requestAnswers.lapsed,
    lapsed: requestAnswers.lapsed,
  },
  "environment.membership_invited": invitationAnswers,
  "environment.role_invited": invitationAnswers,
  "object.co_owner_invited": invitationAnswers,
};

/** Read, but not done: the task waits on Home (UX-IA-019). */
const stillWaits = "Lest. Du har ikke svart ennå; oppgaven står på Hjem.";

export function notificationWords(
  notification: Pick<Notification, "kind" | "detail"> &
    Partial<Pick<DescribedNotification, "readAt" | "about" | "standing">>,
): NotificationWords {
  const { kind, detail, about, standing } = notification;
  const general =
    refinements[kind]?.(detail) ?? notificationEmailSubjects[kind];
  const words =
    typeof general === "string" ? { title: general, detail: null } : general;
  const title = (about && named[kind]?.(about, detail)) || words.title;
  const outcome =
    standing === "open"
      ? notification.readAt
        ? stillWaits
        : null
      : standing
        ? (answers[kind]?.[standing] ?? null)
        : null;

  return { title, detail: outcome ?? words.detail };
}

/** UX-A11Y-005: how much it matters, in words and not only by colour. */
export const notificationLevelLabels: Record<NotificationLevel, string> = {
  required: "Påkrevd",
  action: "Handling",
  information: "Til orientering",
};

/** Where a notification belongs, by what it leads to («Hjem og varsler v3»). */
const contexts: Record<
  NotificationTargetType,
  { readonly label: string; readonly icon: IconName }
> = {
  loan: { label: "Lån", icon: "loans" },
  loan_request: { label: "Lån", icon: "loans" },
  user: { label: "Personer", icon: "person" },
  environment: { label: "Miljø", icon: "environment" },
  object_invitation: { label: "Ting", icon: "things" },
  object_question: { label: "Ting", icon: "things" },
  object_subscription: { label: "Ting", icon: "things" },
  case: { label: "Sak", icon: "flag" },
  chat_device: { label: "Konto", icon: "lock" },
};

/** The context a notification belongs to: an environment by its name. */
export function notificationContext(
  notification: Pick<Notification, "target"> &
    Partial<Pick<DescribedNotification, "about">>,
): { readonly label: string; readonly icon: IconName } {
  const context = contexts[notification.target.type];
  const place = notification.about?.place;

  return notification.target.type === "environment" && place
    ? { ...context, label: place }
    : context;
}

const clock = new Intl.DateTimeFormat("nb-NO", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: productTimeZone,
});

const shortDay = new Intl.DateTimeFormat("nb-NO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: productTimeZone,
});

const shortDate = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: productTimeZone,
});

/**
 * When it happened, as short as is clear: the time today, «i går» and the
 * time yesterday, the day this year, and the date with its year before.
 */
export function notificationWhen(at: string, now: Date = new Date()): string {
  const moment = new Date(at);
  const day = calendarDay(moment);
  const today = calendarDay(now);
  const yesterday = calendarDay(new Date(now.getTime() - 86_400_000));

  if (day === today) return clock.format(moment);
  if (day === yesterday) return `i går ${clock.format(moment)}`;

  return (day.slice(0, 4) === today.slice(0, 4) ? shortDay : shortDate).format(
    moment,
  );
}

/** A notification, and how many older, read ones about the same it stands for. */
export interface NotificationEntry<N extends Notification = Notification> {
  readonly notification: N;
  readonly older: number;
}

/** The courses whose older notifications are gathered in one row. */
const gathered: ReadonlySet<NotificationTargetType> = new Set([
  "loan",
  "loan_request",
]);

/**
 * The notification centre's order (UX-IA-018–019): every unread
 * notification on its own, newest first, then the read ones, where older
 * notifications about the same loan or request stand behind the newest of
 * them. Everything stays unchanged in the loan's own timeline.
 */
export function arrangeNotifications<N extends Notification>(
  notifications: readonly N[],
): {
  unread: N[];
  earlier: NotificationEntry<N>[];
} {
  const unread = notifications.filter(({ readAt }) => readAt === null);
  const earlier: { notification: N; older: number }[] = [];
  const newest = new Map<string, (typeof earlier)[number]>();

  for (const notification of notifications) {
    if (notification.readAt === null) continue;

    const { type, id } = notification.target;
    const key = `${type}/${id}`;
    const entry = gathered.has(type) ? newest.get(key) : undefined;

    if (entry) {
      entry.older += 1;
    } else {
      const added = { notification, older: 0 };
      earlier.push(added);
      if (gathered.has(type)) newest.set(key, added);
    }
  }

  return { unread, earlier };
}

/** The line under a gathered row. */
export function olderText(entry: NotificationEntry): string | null {
  if (entry.older === 0) return null;

  const about =
    entry.notification.target.type === "loan" ? "dette lånet" : "forespørselen";

  return entry.older === 1
    ? `Og 1 eldre varsel om ${about}`
    : `Og ${entry.older} eldre varsler om ${about}`;
}

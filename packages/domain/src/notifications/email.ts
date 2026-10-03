import type { NotificationKind, NotificationLevel } from "@lanbort/contracts";

/**
 * What an e-mail says about each kind of notification. Deliberately only the
 * kind: no names, objects, environments, places, times or messages, since
 * the e-mail passes through the provider and the recipient's mailbox and may
 * be read by others (ADR-0008, «minst mulig privat kontekst»). The details
 * are in the app, behind its policies. A new kind needs a sentence here.
 */
export const notificationEmailSubjects = {
  "loan_request.received": "Du har fått en låneforespørsel",
  "loan_request.terms_confirmed": "Vilkårene i en låneforespørsel er bekreftet",
  "loan_request.terms_changed":
    "Vilkårene i en låneforespørsel er endret og venter på deg",
  "loan_request.declined": "En låneforespørsel er avslått",
  "loan_request.ended": "En låneforespørsel er avsluttet",
  "loan.approved": "Et lån er godkjent",
  "loan.cancelled": "Et lån er kansellert",
  "loan.amendment_proposed": "Det er foreslått en endring i et lån",
  "loan.amendment_accepted": "En endring i et lån er godtatt",
  "loan.amendment_declined": "En foreslått endring i et lån er avslått",
  "loan.amendment_withdrawn":
    "En foreslått endring i et lån er trukket tilbake",
  "loan.handover_day_passed":
    "Overleveringsdagen for et lån er passert uten registrert overlevering",
  "loan.handover_reported": "Den andre parten har svart om en overlevering",
  "loan.not_completed": "Et lån er registrert som ikke gjennomført",
  "loan.return_due": "Et lån har siste dag i dag",
  "loan.return_day_passed":
    "Siste dag for et lån er passert uten avklart retur",
  "loan.return_reported": "Den andre parten har svart om en retur",
  "loan.possession_uncertain": "Det er uklart hvem som har et utlånt objekt",
  "loan.responsibility_offered":
    "Du er spurt om å bli ansvarlig utlåner for et lån",
  "loan.responsibility_consent_requested":
    "Et lån venter på ditt samtykke til ny ansvarlig utlåner",
  "loan.responsibility_transferred": "Et lån har fått ny ansvarlig utlåner",
  "loan.responsibility_declined":
    "En forespørsel om å bli ansvarlig utlåner er avslått",
  "loan.responsibility_withdrawn":
    "En forespørsel om å bli ansvarlig utlåner er trukket tilbake",
  "social.friend_request": "Du har fått en venneforespørsel",
  "social.friend_request_accepted": "En venneforespørsel er godtatt",
  "environment.membership_invited": "Du er invitert til et miljø",
  "environment.membership_review_requested":
    "En søknad om medlemskap venter på behandling",
  "environment.role_invited": "Du er invitert til en rolle i et miljø",
  "environment.type_change_proposed":
    "Det er foreslått å endre typen til et miljø",
  "environment.requirements_changed":
    "Kravene i et miljø du er med i er endret",
  "object.co_owner_invited": "Du er invitert til å bli medeier av et objekt",
} as const satisfies Record<NotificationKind, string>;

/** Why the recipient gets the e-mail at all (PS-COM-003). */
const reasons = {
  required:
    "Du får denne e-posten fordi viktige varsler om lån du er part i alltid sendes på e-post.",
  action:
    "Du får denne e-posten fordi du har valgt e-post for handlingsvarsler. Du kan slå det av i varslingsvalgene i Lånbort.",
  information:
    "Du får denne e-posten fordi du har valgt e-post for informasjonsvarsler. Du kan slå det av i varslingsvalgene i Lånbort.",
} as const satisfies Record<NotificationLevel, string>;

export interface NotificationEmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * The link back to the app. It names only the notification, which only its
 * recipient can open, so the app can lead on to what it is about
 * (UX-INT-010) after the recipient has signed in.
 */
export function notificationEmailLink(
  appUrl: string,
  notificationId: string,
): string {
  const url = new URL("/", appUrl);
  url.searchParams.set("varsel", notificationId);
  return url.toString();
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string,
  );

export function composeNotificationEmail(input: {
  readonly kind: NotificationKind;
  readonly level: NotificationLevel;
  readonly notificationId: string;
  readonly appUrl: string;
}): NotificationEmailContent {
  const subject = notificationEmailSubjects[input.kind];
  const link = notificationEmailLink(input.appUrl, input.notificationId);
  const open = "Åpne Lånbort for å se hva det gjelder";
  const reason = reasons[input.level];

  return {
    subject,
    text: `${subject}.\n\n${open}:\n${link}\n\n${reason}\n`,
    html: [
      '<!doctype html><html lang="nb"><body>',
      `<p>${escapeHtml(subject)}.</p>`,
      `<p><a href="${escapeHtml(link)}">${escapeHtml(open)}</a></p>`,
      `<p style="color:#555;font-size:13px">${escapeHtml(reason)}</p>`,
      "</body></html>",
    ].join(""),
  };
}

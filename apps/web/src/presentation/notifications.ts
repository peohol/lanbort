import type {
  Notification,
  NotificationKind,
  NotificationLevel,
} from "@lanbort/contracts";

/**
 * What each notification says. A notification carries no content of what
 * happened (PS-COM-001), only where it leads, so the text says what kind of
 * thing happened and the context shows the rest. `detail` refines a few:
 * what the other party said, or why a request ended.
 */
const texts: Record<NotificationKind, (detail: string | null) => string> = {
  "loan_request.received": () => "Noen vil låne noe av deg",
  "loan_request.terms_confirmed": () =>
    "En låntaker har bekreftet de nye vilkårene",
  "loan_request.terms_changed": () =>
    "Vilkårene er endret for noe du har spurt om å låne. Bekreft dem for å holde forespørselen åpen",
  "loan_request.declined": () => "Forespørselen din ble avslått",
  "loan_request.ended": () => "Forespørselen din er ikke lenger åpen",
  "loan.approved": () => "Forespørselen din er godkjent, og lånet er avtalt",
  "loan.cancelled": () => "Et avtalt lån er avlyst",
  "loan.amendment_proposed": () =>
    "Den andre parten foreslår ny periode for et lån",
  "loan.amendment_accepted": () => "Den nye perioden for lånet er avtalt",
  "loan.amendment_declined": () => "Forslaget om ny periode ble avslått",
  "loan.amendment_withdrawn": () =>
    "Forslaget om ny periode ble trukket tilbake",
  "loan.handover_day_passed": () =>
    "Overleveringsdagen er over. Fortell om overleveringen skjedde",
  "loan.handover_reported": (detail) =>
    detail === "not_handed_over"
      ? "Den andre parten sier at overleveringen ikke skjedde"
      : "Den andre parten sier at overleveringen skjedde",
  "loan.not_completed": () => "Et lån ble ikke gjennomført",
  "loan.return_due": () => "Et lån skal leveres tilbake i morgen",
  "loan.return_day_passed": () =>
    "Returdagen er over. Fortell hvordan returen gikk",
  "loan.return_reported": (detail) =>
    returnTexts[detail ?? ""] ?? "Den andre parten har sagt noe om returen",
  "loan.possession_uncertain": () =>
    "Det er uklart hvem som har et utlånt objekt. Avklar det med den andre parten",
  "loan.responsibility_offered": () =>
    "Du er spurt om å bli ansvarlig utlåner for et lån",
  "loan.responsibility_consent_requested": () =>
    "En ny ansvarlig utlåner trenger samtykket ditt",
  "loan.responsibility_transferred": () =>
    "Et lån har fått ny ansvarlig utlåner",
  "loan.responsibility_declined": () =>
    "Forslaget om ny ansvarlig utlåner ble avslått",
  "loan.responsibility_withdrawn": () =>
    "Forslaget om ny ansvarlig utlåner ble trukket tilbake",
  "social.friend_request": () => "Noen vil bli venn med deg",
  "social.friend_request_accepted": () => "En venneforespørsel er godtatt",
  "environment.membership_invited": () => "Du er invitert til et miljø",
  "environment.membership_review_requested": () =>
    "En innmelding venter på behandling",
  "environment.role_invited": (detail) =>
    detail === "owner"
      ? "Du er spurt om å bli eier av et miljø"
      : "Du er spurt om å bli administrator i et miljø",
  "environment.type_change_proposed": () =>
    "Det er foreslått nytt personvern for et miljø du er med i",
  "environment.requirements_changed": () =>
    "Kravene til medlemskap er endret i et miljø du er med i",
  "object.co_owner_invited": () => "Du er invitert til å bli medeier av noe",
};

const returnTexts: Record<string, string> = {
  returned: "Låntakeren sier at objektet er levert tilbake",
  still_has: "Låntakeren sier at de fortsatt har objektet",
  received: "Utlåneren har bekreftet at objektet er levert tilbake",
  not_received: "Utlåneren sier at objektet ikke er levert tilbake",
};

export function notificationText(
  notification: Pick<Notification, "kind" | "detail">,
): string {
  return texts[notification.kind](notification.detail);
}

/** UX-A11Y-005: how much it matters, in words and not only by colour. */
export const notificationLevelLabels: Record<NotificationLevel, string> = {
  required: "Viktig",
  action: "Handling",
  information: "Til orientering",
};

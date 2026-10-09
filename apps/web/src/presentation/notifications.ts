import type {
  Notification,
  NotificationKind,
  NotificationLevel,
} from "@lanbort/contracts";
import { notificationEmailSubjects } from "@lanbort/domain";

/**
 * What each notification says: the same sentence as its e-mail, which names
 * only the kind of thing that happened (PS-COM-001), so a new kind needs one
 * sentence, in one place. The context shows the rest. Where the
 * notification's `detail` says more (what the other party said, which role
 * is offered), the app says it.
 */
const refinements: Partial<
  Record<NotificationKind, (detail: string | null) => string | undefined>
> = {
  "chat.device_linked": () =>
    "En ny enhet er koblet til privat chat. Enheten kan motta nye meldinger fra nå av. Den får ikke tidligere meldinger automatisk. Var det ikke deg, fjern den i Mine enheter.",
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

export function notificationText(
  notification: Pick<Notification, "kind" | "detail">,
): string {
  return (
    refinements[notification.kind]?.(notification.detail) ??
    notificationEmailSubjects[notification.kind]
  );
}

/** UX-A11Y-005: how much it matters, in words and not only by colour. */
export const notificationLevelLabels: Record<NotificationLevel, string> = {
  required: "Viktig",
  action: "Handling",
  information: "Til orientering",
};

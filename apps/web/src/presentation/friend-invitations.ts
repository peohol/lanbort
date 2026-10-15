import { type FriendInvitation, friendCodeSchema } from "@lanbort/contracts";
import { friendScanHref } from "@/navigation/routes";
import { formatShortDate, formatTime } from "./dates";

/**
 * How the user adds friends from Konto › Venner (PS-USR-013–015): by e-mail
 * address and by friend code. What the sender is told never depends on
 * whether the address has an account, on the recipient's notification
 * choices or on their answer (PS-USR-012, PS-USR-013).
 */

/** The step by e-mail: an invitation for those who may invite new people. */
export const inviteTitle = (mayInvite: boolean) =>
  mayInvite ? "Inviter en person" : "Venneforespørsel på e-post";

export const inviteLead = (mayInvite: boolean) =>
  mayInvite
    ? "Personen får en e-post med navnet ditt og en lenke for å registrere seg. Er adressen allerede i Lånbort, sendes ingen invitasjon."
    : "Kjenner du e-postadressen til noen som er i Lånbort, kan du spørre om å bli venner. Forespørselen kommer i appen. Du får ikke vite om adressen har en konto.";

/** What an open invitation is, in its row. */
export const invitationKind = ({
  befriend,
}: Pick<FriendInvitation, "befriend">) =>
  befriend ? "Venneforespørsel" : "Invitasjon til Lånbort";

export const invitationDetail = (invitation: FriendInvitation) =>
  `${invitationKind(invitation)} · gjelder til ${formatShortDate(invitation.expiresAt)}`;

/**
 * The confirmation once sent: the same whatever happened behind it, so it
 * says what may happen, not what did.
 */
export function invitationSentText(
  invitation: Pick<FriendInvitation, "email" | "befriend" | "expiresAt">,
  mayInvite: boolean,
): string {
  const until = `Den gjelder til ${formatTime(invitation.expiresAt)}.`;
  const request =
    "Har personen en konto med denne adressen, kan de godta eller avslå forespørselen i appen.";

  return [
    `Sendt til ${invitation.email}.`,
    mayInvite
      ? "Er adressen ikke i Lånbort fra før, får personen en invitasjon på e-post."
      : request,
    mayInvite && invitation.befriend
      ? "Venneforespørselen venter på dem i appen når de er med."
      : null,
    until,
  ]
    .filter(Boolean)
    .join(" ");
}

/** How long a friend code is shown for, in words (PS-USR-014). */
export function timeLeft(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

/**
 * What a friend code's QR code holds: the scanning page on this site, with
 * the code after `#`, so a phone's own camera can open it too and the code
 * is never sent to a server as part of an address.
 */
export const friendCodeLink = (origin: string, code: string) =>
  `${origin}${friendScanHref}#${code}`;

/** The code in a scanned or opened friend code link from this site, if any. */
export function readFriendCodeLink(
  content: string,
  origin: string,
): string | undefined {
  let url: URL;
  try {
    url = new URL(content);
  } catch {
    return undefined;
  }
  if (url.origin !== origin || url.pathname !== friendScanHref) {
    return undefined;
  }
  const code = friendCodeSchema.safeParse(url.hash.slice(1));
  return code.success ? code.data : undefined;
}

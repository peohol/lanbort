import type { ThingPicture } from "@lanbort/contracts";
import { samePlace } from "@/navigation/stack";

/**
 * A loan or an open request between the reader and someone they chat
 * with (PS-COM-017): the conversation links to it, and every agreement is
 * made there, never in the chat.
 */
export interface ChatLoan {
  kind: "loan" | "request";
  /** The loan's or the request's id. */
  id: string;
  href: string;
  title: string;
  /** Its state in a few words, such as «Utlånt». */
  status: string;
  /** The thing's first picture, read as a party (PS-OBJ-021). */
  picture: ThingPicture | null;
}

/** The pending loans and requests per person, by their user id. */
export type ChatLoans = Readonly<Record<string, readonly ChatLoan[]>>;

/** «2 lån: Høytrykksspyler, sag», or null with none (Samtaler, 01). */
export function loansLine(loans: readonly ChatLoan[] | undefined) {
  if (!loans?.length) return null;
  const titles = loans.map((loan) => loan.title);
  return loans.length === 1
    ? `Lån: ${titles[0]}`
    : `${loans.length} lån: ${titles.join(", ")}`;
}

/**
 * The loans with the one the user came from first (UX-IA-014): a
 * conversation opened from a loan shows that loan before the others. It is
 * the latest of them in the way back (`trail`), so it stays first in
 * «Om samtalen» too.
 */
export function cameFromFirst(
  loans: readonly ChatLoan[],
  trail: readonly { href: string }[],
): readonly ChatLoan[] {
  const from = trail.findLast(({ href }) =>
    loans.some((loan) => samePlace(loan.href, href)),
  );
  if (!from) return loans;
  const first = (loan: ChatLoan) => samePlace(loan.href, from.href);
  return [...loans.filter(first), ...loans.filter((loan) => !first(loan))];
}

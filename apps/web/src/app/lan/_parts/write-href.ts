import { chatHref } from "@/navigation/chat";
import { chatEnabled } from "@/server/env";

/**
 * Where «Skriv til» leads (KF7, PS-COM-006): the lender may start a private
 * conversation with the borrower from the request they received; the
 * borrower finds it among their conversations once it exists. Private chat
 * is off for real users until Port C.
 */
export function writeHref(
  role: "borrower" | "lender",
  borrowerUserId: string,
  requestId: string,
): string | null {
  if (!chatEnabled() || role !== "lender") {
    return null;
  }

  const query = new URLSearchParams({
    med: borrowerUserId,
    foresporsel: requestId,
  });

  return `${chatHref}?${query.toString()}`;
}

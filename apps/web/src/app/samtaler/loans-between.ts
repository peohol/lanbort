import {
  collectPages,
  listLoanRequests,
  listLoans,
  loanPicture,
  loanRequestPicture,
} from "@lanbort/domain";
import type { ChatLoan, ChatLoans } from "@/chat/loans";
import { loanHref, loanRequestHref } from "@/navigation/routes";
import { loanStatusLabels } from "@/presentation/loans";
import { pageQuery } from "@/server/session";

/**
 * The reader's pending loans and the open requests they have received,
 * by the other person (PS-COM-017), so each conversation can link to
 * them. A request the reader sent names no lender, so it is not listed.
 */
export async function loansBetween(): Promise<ChatLoans> {
  const [loans, requests] = await Promise.all([
    collectPages(
      (cursor) => pageQuery(listLoans, { state: "current", cursor }),
      (page) => page.loans,
    ),
    collectPages(
      (cursor) =>
        pageQuery(listLoanRequests, { role: "lender", state: "open", cursor }),
      (page) => page.requests,
    ),
  ]);

  const byPerson: Record<string, ChatLoan[]> = {};
  const add = (userId: string, loan: ChatLoan) => {
    (byPerson[userId] ??= []).push(loan);
  };

  for (const loan of loans.items) {
    add(
      loan.role === "borrower" ? loan.responsibleLenderId : loan.borrowerUserId,
      {
        kind: "loan",
        id: loan.id,
        href: loanHref(loan.id),
        title: loan.agreement.title,
        status: loanStatusLabels[loan.status],
        picture: loanPicture(loan),
      },
    );
  }
  for (const request of requests.items) {
    add(request.borrowerUserId, {
      kind: "request",
      id: request.id,
      href: loanRequestHref(request.id),
      title: request.object?.title ?? "Forespørsel",
      status: "Forespørsel",
      picture: loanRequestPicture(request),
    });
  }

  return byPerson;
}

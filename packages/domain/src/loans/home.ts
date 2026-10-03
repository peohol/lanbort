import type {
  CoOwnerLoan,
  HomeItem,
  Loan,
  LoanRequest,
} from "@lanbort/contracts";
import { type HomeSource, homeItem } from "../home/source";
import { listLoanRequests, listLoans } from "./queries";
import { listCoOwnerLoans } from "./responsibility";

/**
 * What a loan asks of one of its parties now (UX-IA-005, UX-P04), or null
 * once it has ended. An open proposal the other side made comes first,
 * then the handover or return statement only this party can give; a loan
 * that waits for the other side or is disputed is unresolved, and one that
 * is simply under way shows its next day.
 */
export function loanHomeItem(loan: Loan): HomeItem | null {
  const target = { type: "loan", id: loan.id } as const;
  const details = { title: loan.agreement.title, role: loan.role };
  const transfer = loan.responsibilityTransfer;
  const own = loan.role;

  if (loan.status === "ended") {
    return null;
  }

  if (loan.amendment && loan.amendment.proposedBy !== own) {
    return homeItem("loan.answer_amendment", target, details);
  }

  if (
    own === "borrower" &&
    transfer?.needsBorrowerConsent &&
    !transfer.borrowerConsented
  ) {
    return homeItem("loan.answer_responsibility", target, details);
  }

  switch (loan.status) {
    case "reserved":
      return homeItem("loan.handover", target, {
        ...details,
        day: loan.period.start,
      });
    case "awaiting_handover":
      return homeItem(
        loan.handover[own] === null
          ? "loan.report_handover"
          : "loan.awaiting_handover",
        target,
        {
          ...details,
          day: loan.period.start,
          dueAt: loan.handover.answerDueAt,
        },
      );
    case "active":
      return homeItem("loan.return", target, {
        ...details,
        day: loan.period.end,
      });
    case "awaiting_return": {
      const spoken = loan.return[own] !== null || loan.return.pending !== null;
      const kind =
        own === "borrower" ? "loan.report_return" : "loan.confirm_return";

      return homeItem(spoken ? "loan.awaiting_return" : kind, target, {
        ...details,
        day: loan.period.end,
      });
    }
    case "late":
      return homeItem("loan.late", target, {
        ...details,
        day: loan.period.end,
      });
    case "disputed":
      return homeItem("loan.disputed", target, details);
  }
}

/**
 * What an open request asks of the caller: the lender decides one that
 * waits for the owners, the borrower confirms changed terms, and either
 * accepts a responsibility declaration they have not accepted yet
 * (PS-LOAN-003–005). A request on hold or waiting for the other side asks
 * nothing.
 */
export function loanRequestHomeItem(request: LoanRequest): HomeItem | null {
  const target = { type: "loan_request", id: request.id } as const;
  const details = { title: request.object?.title ?? null, role: request.role };

  if (request.role === "lender" && request.status === "requested") {
    return homeItem("loan_request.answer", target, details);
  }

  if (
    request.role === "borrower" &&
    request.status === "awaiting_terms_confirmation"
  ) {
    return homeItem("loan_request.confirm_terms", target, details);
  }

  const open =
    request.status === "requested" ||
    request.status === "awaiting_terms_confirmation";

  return open && request.responsibility?.acceptedByYou === false
    ? homeItem("loan_request.accept_responsibility", target, details)
    : null;
}

/**
 * What a loan asks of a co-owner who is not its party (PS-LOAN-009,
 * PS-LOAN-015): the list only has loans where they may act, and this says
 * which act. Their own takeover waiting for the borrower asks nothing more.
 */
export function coOwnerLoanHomeItem(loan: CoOwnerLoan): HomeItem | null {
  const target = { type: "loan", id: loan.loanId } as const;
  const details = { title: loan.title, role: "lender" as const };

  if (loan.transfer?.kind === "voluntary" && !loan.transfer.recipientAccepted) {
    return homeItem("loan.answer_responsibility", target, details);
  }

  if (loan.mayTakeOver) {
    return homeItem("loan.take_over_responsibility", target, details);
  }

  return loan.mayConfirmReceipt && loan.pending === null
    ? homeItem("loan.confirm_return", target, {
        ...details,
        day: loan.period.end,
      })
    : null;
}

const present = <T>(items: readonly T[], item: (from: T) => HomeItem | null) =>
  items.flatMap((from) => item(from) ?? []);

/**
 * The caller's current loans. Only the first page: Home is about what
 * needs attention, and Lån has the rest.
 */
export const loanHomeSource: HomeSource = {
  name: "loans",
  async items({ query }) {
    const { loans } = await query(listLoans, { state: "current" });

    return present(loans, loanHomeItem);
  },
};

export const loanRequestHomeSource: HomeSource = {
  name: "loan_requests",
  async items({ query }) {
    const lists = await Promise.all(
      (["lender", "borrower"] as const).map((role) =>
        query(listLoanRequests, { role, state: "open" }),
      ),
    );

    return lists.flatMap(({ requests }) =>
      present(requests, loanRequestHomeItem),
    );
  },
};

export const coOwnerLoanHomeSource: HomeSource = {
  name: "co_owner_loans",
  async items({ query }) {
    const { items } = await query(listCoOwnerLoans, {});

    return present(items, coOwnerLoanHomeItem);
  },
};

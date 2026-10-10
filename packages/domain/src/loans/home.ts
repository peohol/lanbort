import {
  type CoOwnerLoan,
  type HomeItem,
  homeItemKinds,
  type Loan,
  type LoanOrigin,
  type LoanRequest,
} from "@lanbort/contracts";
import { collectPages } from "../commands/pages";
import { addDays } from "../objects/availability";
import { type HomeSource, homeItem } from "../home/source";
import {
  coOwnerLoanPicture,
  loanPicture,
  loanRequestPicture,
} from "./pictures";
import { listLoanRequests, listLoans } from "./queries";
import { listCoOwnerLoans } from "./responsibility";

/** The environment as its context, while the reader may see it. */
const via = (origin: LoanOrigin) =>
  origin.kind === "environment" ? (origin.environment?.name ?? null) : null;

/**
 * The days a request asks for, once both are known: a start «as soon as
 * possible» has none yet.
 */
function requestedPeriod({ start, end }: LoanRequest): HomeItem["period"] {
  if (start.kind !== "date") return null;

  return {
    start: start.date,
    end: end.kind === "date" ? end.date : addDays(start.date, end.days - 1),
  };
}

/**
 * What a loan asks of one of its parties now (UX-IA-005, UX-P04). An ended
 * loan asks only that its lender confirms having the object back after it
 * ended unresolved, since the object takes no new loans until then
 * (PS-LOAN-019). An open proposal the other side made comes first,
 * then the handover or return statement only this party can give; a loan
 * that waits for the other side or is disputed is unresolved, and one that
 * is simply under way shows its next day.
 */
export function loanHomeItem(loan: Loan): HomeItem | null {
  const item = loanTask(loan);

  // While the environment mediates (PS-LOAN-018), an unsettled loan waits
  // for its administrators rather than for the other party.
  return item &&
    loan.mediation?.open &&
    homeItemKinds[item.kind] === "unresolved"
    ? { ...item, kind: "loan.mediation" }
    : item;
}

function loanTask(loan: Loan): HomeItem | null {
  const target = { type: "loan", id: loan.id } as const;
  const own = loan.role;
  const details = {
    title: loan.agreement.title,
    role: own,
    person: loan.parties[own === "borrower" ? "lender" : "borrower"].realName,
    via: via(loan.origin),
    picture: loanPicture(loan),
    period: loan.period,
  };
  const transfer = loan.responsibilityTransfer;

  if (loan.status === "ended") {
    return loan.actions.confirmControl
      ? homeItem("loan.confirm_control", target, details)
      : null;
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
  const details = {
    title: request.object?.title ?? null,
    role: request.role,
    person: request.role === "lender" ? request.borrower.realName : null,
    via: via(request.origin),
    picture: loanRequestPicture(request),
    period: requestedPeriod(request),
  };

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
  const details = {
    title: loan.title,
    role: "lender" as const,
    picture: coOwnerLoanPicture(loan),
  };

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
 * Every loan of the caller that may still ask something of them, page by
 * page: one must not drop off Home because newer loans fill the first page.
 */
export const loanHomeSource: HomeSource = {
  name: "loans",
  async items({ query }) {
    const lists = await Promise.all(
      (["current", "awaiting_control"] as const).map((state) =>
        collectPages(
          (cursor) => query(listLoans, { state, cursor }),
          ({ loans }) => loans,
        ),
      ),
    );

    return lists.flatMap(({ items }) => present(items, loanHomeItem));
  },
};

export const loanRequestHomeSource: HomeSource = {
  name: "loan_requests",
  async items({ query }) {
    const lists = await Promise.all(
      (["lender", "borrower"] as const).map((role) =>
        collectPages(
          (cursor) => query(listLoanRequests, { role, state: "open", cursor }),
          ({ requests }) => requests,
        ),
      ),
    );

    return lists.flatMap(({ items }) => present(items, loanRequestHomeItem));
  },
};

export const coOwnerLoanHomeSource: HomeSource = {
  name: "co_owner_loans",
  async items({ query }) {
    const { items } = await query(listCoOwnerLoans, {});

    return present(items, coOwnerLoanHomeItem);
  },
};

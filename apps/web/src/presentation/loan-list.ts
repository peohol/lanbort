import {
  type HomeItem,
  homeItemKinds,
  type Loan,
  type LoanRequest,
} from "@lanbort/contracts";
import { loanHomeItem, loanRequestHomeItem } from "@lanbort/domain";
import { loanHref, loanRequestHref } from "@/navigation/routes";
import { formatShortPeriod } from "./dates";
import { describeLoanRequest, loanRequestTitle } from "./loan-requests";
import { describeLoanStatus, endingLabels, loanTitle } from "./loan-status";

/**
 * One loan or request as the Lån list shows it (KF1 v2): its name from the
 * reader's side and its situation in a line. Details and history belong to
 * its own page (UX-IA-008).
 */
export interface LoanListEntry {
  readonly key: string;
  readonly href: string;
  readonly title: string;
  readonly status: string;
}

/** The Lån list's groups, in order (UX-IA-006, «Skjermstruktur»). */
export const loanGroups = [
  { id: "awaiting_you", heading: "Venter på deg" },
  { id: "under_way", heading: "Pågår og kommende" },
  { id: "awaiting_others", heading: "Venter på andre" },
] as const;

export type LoanGroupId = (typeof loanGroups)[number]["id"];

export interface LoanGroup {
  readonly id: LoanGroupId;
  readonly heading: string;
  readonly entries: readonly LoanListEntry[];
}

/**
 * Home's section decides the group, so a loan is placed alike on Home and
 * in Lån: what only the user can do, what waits on others or is not
 * settled, and the rest under way. Without a task, `idle` says where it
 * belongs.
 */
function groupOf(item: HomeItem | null, idle: LoanGroupId): LoanGroupId {
  if (!item) return idle;

  switch (homeItemKinds[item.kind]) {
    case "awaiting_you":
      return "awaiting_you";
    case "unresolved":
      return "awaiting_others";
    default:
      return "under_way";
  }
}

const requestEntry = (request: LoanRequest): LoanListEntry => ({
  key: `foresporsel-${request.id}`,
  href: loanRequestHref(request.id),
  title: loanRequestTitle(request),
  status: describeLoanRequest(request).text,
});

const loanEntry = (loan: Loan, status: string): LoanListEntry => ({
  key: `lan-${loan.id}`,
  href: loanHref(loan.id),
  title: loanTitle(loan),
  status,
});

/**
 * The open requests and loans that have not ended, in their groups; an
 * ended loan only while it still asks the reader something (PS-LOAN-019),
 * else it is among the ended ones. An open request without a task waits
 * on the other side or the environment. Empty groups are left out.
 */
export function groupLoans({
  requests,
  loans,
  today,
}: {
  requests: readonly LoanRequest[];
  loans: readonly Loan[];
  /** A calendar date in Norway. */
  today: string;
}): LoanGroup[] {
  const placed = [
    ...requests.map((request) => ({
      group: groupOf(loanRequestHomeItem(request), "awaiting_others"),
      entry: requestEntry(request),
    })),
    ...loans.flatMap((loan) => {
      const item = loanHomeItem(loan);

      return loan.status === "ended" && !item
        ? []
        : [
            {
              group: groupOf(item, "under_way"),
              entry: loanEntry(loan, describeLoanStatus(loan, today).headline),
            },
          ];
    }),
  ];

  return loanGroups
    .map((group) => ({
      ...group,
      entries: placed
        .filter((each) => each.group === group.id)
        .map(({ entry }) => entry),
    }))
    .filter(({ entries }) => entries.length > 0);
}

/** An ended loan: how it ended and when it was (KF7). */
export const endedLoanEntry = (loan: Loan): LoanListEntry =>
  loanEntry(
    loan,
    `${loan.ending ? endingLabels[loan.ending.reason].label : "Avsluttet"} · ${formatShortPeriod(loan.period)}`,
  );

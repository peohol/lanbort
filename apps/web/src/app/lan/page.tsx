import type { LoanRequestRole } from "@lanbort/contracts";
import {
  collectPages,
  listLoanRequests,
  listLoans,
  loanHomeItem,
  loanRequestHomeItem,
} from "@lanbort/domain";
import type { Metadata } from "next";
import {
  LoanList,
  type LoanListEntry,
  loanListId,
} from "@/components/loan-list";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { anchorFor } from "@/navigation/targets";
import { formatPeriod } from "@/presentation/dates";
import { describeHomeItem } from "@/presentation/home-items";
import {
  formatDesiredPeriod,
  loanEndReasonLabels,
  loanRequestStatusLabels,
  loanRoleLabels,
  loanStatusLabels,
} from "@/presentation/loans";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Lån – Lånbort" };

/** UX-IA-006: one surface, filtered by side; `?side=` in the address. */
const sides = [
  { value: undefined, label: "Alle" },
  { value: "borrower", label: "Låner" },
  { value: "lender", label: "Låner bort" },
] as const;

function sideOf(value: string | string[] | undefined) {
  return sides.find((side) => side.value === value)?.value;
}

/** What the entry asks of the user, in Home's words, if anything. */
const waiting = (item: Parameters<typeof describeHomeItem>[0] | null) =>
  item ? describeHomeItem(item).text : null;

/** The three lists, each with its own page count in the address. */
const lists = {
  requests: { heading: "Forespørsler", key: "foresporsler" },
  current: { heading: "Pågående lån", key: "pagaende" },
  ended: { heading: "Avsluttede lån", key: "avsluttede" },
} as const;

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const params = await searchParams;
  const side = sideOf(params.side);
  const roles: readonly LoanRequestRole[] = side
    ? [side]
    : ["borrower", "lender"];
  const loanPages = (state: "current" | "ended") =>
    collectPages(
      (cursor) => pageQuery(listLoans, { state, role: side, cursor }),
      ({ loans }) => loans,
      pagesShown(params, lists[state].key),
    );
  const [requestLists, current, ended] = await Promise.all([
    Promise.all(
      roles.map((role) =>
        collectPages(
          (cursor) =>
            pageQuery(listLoanRequests, { role, state: "open", cursor }),
          ({ requests }) => requests,
          pagesShown(params, lists.requests.key),
        ),
      ),
    ),
    loanPages("current"),
    loanPages("ended"),
  ]);
  const more = (
    list: keyof typeof lists,
    ...pages: { nextCursor: unknown }[]
  ) =>
    pages.every(({ nextCursor }) => nextCursor === null)
      ? null
      : morePagesHref(
          "/lan",
          params,
          lists[list].key,
          loanListId(lists[list].heading),
        );

  const requests: LoanListEntry[] = requestLists
    .flatMap((list) => list.items)
    .map((request) => ({
      id: anchorFor("loan_request", request.id),
      title: request.object?.title ?? "Objektet finnes ikke lenger",
      role: loanRoleLabels[request.role],
      status: loanRequestStatusLabels[request.status],
      period: formatDesiredPeriod(request.start, request.end),
      waiting: waiting(loanRequestHomeItem(request)),
    }));
  const loans = (list: typeof current): LoanListEntry[] =>
    list.items.map((loan) => ({
      id: anchorFor("loan", loan.id),
      title: loan.agreement.title,
      role: loanRoleLabels[loan.role],
      status: loan.ending
        ? loanEndReasonLabels[loan.ending.reason]
        : loanStatusLabels[loan.status],
      period: formatPeriod(loan.period),
      waiting: waiting(loanHomeItem(loan)),
    }));

  return (
    <main>
      <h1>Lån</h1>
      <nav aria-label="Vis lån" className="filters">
        {sides.map(({ value, label }) => (
          <a
            key={label}
            href={value ? `?side=${value}` : "/lan"}
            aria-current={value === side ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <LoanList
        heading={lists.requests.heading}
        empty="Ingen åpne forespørsler."
        entries={requests}
        more={more("requests", ...requestLists)}
      />
      <LoanList
        heading={lists.current.heading}
        empty="Ingen pågående lån."
        entries={loans(current)}
        more={more("current", current)}
      />
      <LoanList
        heading={lists.ended.heading}
        empty="Ingen avsluttede lån."
        entries={loans(ended)}
        more={more("ended", ended)}
      />
    </main>
  );
}

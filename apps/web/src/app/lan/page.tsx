import type { LoanRequestRole } from "@lanbort/contracts";
import {
  listLoanRequests,
  listLoans,
  loanHomeItem,
  loanRequestHomeItem,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { LoanList, type LoanListEntry } from "@/components/loan-list";
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

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAccount();
  const side = sideOf((await searchParams).side);
  const roles: readonly LoanRequestRole[] = side
    ? [side]
    : ["borrower", "lender"];
  const [requestLists, current, ended] = await Promise.all([
    Promise.all(
      roles.map((role) => pageQuery(listLoanRequests, { role, state: "open" })),
    ),
    pageQuery(listLoans, { state: "current", role: side }),
    pageQuery(listLoans, { state: "ended", role: side }),
  ]);

  const requests: LoanListEntry[] = requestLists
    .flatMap((list) => list?.requests ?? [])
    .map((request) => ({
      id: anchorFor("loan_request", request.id),
      title: request.object?.title ?? "Objektet finnes ikke lenger",
      role: loanRoleLabels[request.role],
      status: loanRequestStatusLabels[request.status],
      period: formatDesiredPeriod(request.start, request.end),
      waiting: waiting(loanRequestHomeItem(request)),
    }));
  const loans = (list: typeof current): LoanListEntry[] =>
    (list?.loans ?? []).map((loan) => ({
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
        heading="Forespørsler"
        empty="Ingen åpne forespørsler."
        entries={requests}
      />
      <LoanList
        heading="Pågående lån"
        empty="Ingen pågående lån."
        entries={loans(current)}
      />
      <LoanList
        heading="Avsluttede lån"
        empty="Ingen avsluttede lån."
        entries={loans(ended)}
      />
    </main>
  );
}

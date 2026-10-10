import type { LoanRequestRole } from "@lanbort/contracts";
import { collectPages, listLoanRequests, listLoans } from "@lanbort/domain";
import type { Metadata } from "next";
import { LoanList } from "@/components/loan-list";
import { MenuList, MenuRow } from "@/components/menu-list";
import { loansHref } from "@/navigation/areas";
import type { SearchParams } from "@/navigation/list-pages";
import { calendarDay } from "@/presentation/dates";
import { groupLoans } from "@/presentation/loan-list";
import { pageQuery, requirePageAccount } from "@/server/session";
import { endedLoansHref } from "./_parts/paths";
import { SideFilter, sideHref, sideOf } from "./_parts/side-filter";

export const metadata: Metadata = { title: "Lån – Lånbort" };

/**
 * The Lån area (UX-IA-006, KF1 v2): open requests and loans that have not
 * ended, grouped by who they wait on, and the ended ones behind a row of
 * their own. Every one is read, as on Home, so nothing waiting on the user
 * hides on a later page.
 */
export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const side = sideOf((await searchParams).side);
  const roles: readonly LoanRequestRole[] = side
    ? [side]
    : ["borrower", "lender"];
  const [requests, loans] = await Promise.all([
    Promise.all(
      roles.map((role) =>
        collectPages(
          (cursor) =>
            pageQuery(listLoanRequests, { role, state: "open", cursor }),
          ({ requests }) => requests,
        ),
      ),
    ),
    Promise.all(
      (["current", "awaiting_control"] as const).map((state) =>
        collectPages(
          (cursor) => pageQuery(listLoans, { state, role: side, cursor }),
          ({ loans }) => loans,
        ),
      ),
    ),
  ]);
  const groups = groupLoans({
    requests: requests.flatMap(({ items }) => items),
    loans: loans.flatMap(({ items }) => items),
    today: calendarDay(),
  });

  return (
    <main>
      <h1>Lån</h1>
      <SideFilter pathname={loansHref} side={side} />
      {groups.length === 0 && (
        <p className="quiet">Ingen forespørsler eller lån pågår nå.</p>
      )}
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={group.id}>
          <h2 id={group.id}>{group.heading}</h2>
          <LoanList label={group.id} entries={group.entries} />
        </section>
      ))}
      <MenuList>
        <MenuRow href={sideHref(endedLoansHref, side)} label="Avsluttede lån" />
      </MenuList>
    </main>
  );
}

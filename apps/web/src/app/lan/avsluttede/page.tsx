import { collectPages, listLoans } from "@lanbort/domain";
import type { Metadata } from "next";
import { LoanList } from "@/components/loan-list";
import { PageHeader } from "@/components/page-header";
import { loansHref } from "@/navigation/areas";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { endedLoanEntry } from "@/presentation/loan-list";
import { pageQuery, requirePageAccount } from "@/server/session";
import { endedLoansHref } from "../_parts/paths";
import { SideFilter, sideOf } from "../_parts/side-filter";

export const metadata: Metadata = { title: "Avsluttede lån – Lånbort" };

/** The page count in the address, and where «Vis flere» returns to. */
const pagesKey = "sider";
const listId = "liste";

/**
 * The ended loans (UX-IA-006, UX-IA-008), newest first, a page at a time:
 * history, behind a row of its own in Lån.
 */
export default async function EndedLoansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const params = await searchParams;
  const side = sideOf(params.side);
  const ended = await collectPages(
    (cursor) => pageQuery(listLoans, { state: "ended", role: side, cursor }),
    ({ loans }) => loans,
    pagesShown(params, pagesKey),
  );

  return (
    <main>
      <PageHeader
        title="Avsluttede lån"
        back={{ href: loansHref, label: "Lån" }}
      />
      <SideFilter pathname={endedLoansHref} side={side} />
      <div id={listId}>
        {ended.items.length === 0 ? (
          <p className="quiet">Ingen avsluttede lån.</p>
        ) : (
          <LoanList
            entries={ended.items.map(endedLoanEntry)}
            more={
              ended.nextCursor === null
                ? null
                : {
                    href: morePagesHref(
                      endedLoansHref,
                      params,
                      pagesKey,
                      listId,
                    ),
                    text: "Vis flere avsluttede lån",
                  }
            }
          />
        )}
      </div>
    </main>
  );
}

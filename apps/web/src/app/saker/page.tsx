import {
  collectPages,
  listOwnCases,
  listOwnEnvironments,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { accountHref } from "@/navigation/areas";
import { environmentCasesHref } from "@/navigation/cases";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { casesHref } from "@/navigation/routes";
import { pageQuery, requirePageAccount } from "@/server/session";
import { CaseList } from "./case-list";

export const metadata: Metadata = { title: "Saker – Lånbort" };

/** The list's pages in the address, and the element it is. */
const listKey = "saker";

/**
 * Own cases (UX-IA-007): the cases the user takes part in, newest first,
 * and, for each environment they administer, the way to its queue. The
 * platform stewards' queue is not shown until their stronger sign-in is
 * built (OD-0023), since every action in it is refused until then.
 */
export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const account = await requirePageAccount();
  const query = await searchParams;
  const [own, environments] = await Promise.all([
    collectPages(
      (cursor) => pageQuery(listOwnCases, { cursor }),
      (page) => page.items,
      pagesShown(query, listKey),
    ),
    pageQuery(listOwnEnvironments, {}),
  ]);
  const names = new Map(
    (environments ?? []).map((environment) => [
      environment.id,
      environment.name,
    ]),
  );
  const administered = (environments ?? []).filter((environment) =>
    environment.roles.includes("administrator"),
  );

  return (
    <main>
      <PageHeader title="Saker" back={{ href: accountHref, label: "Konto" }}>
        Kontakt med administratorer, meklinger og rapporter du er part i.
        Private samtaler er aldri en del av en sak.
      </PageHeader>
      {administered.length > 0 && (
        <section aria-labelledby="ko">
          <h2 id="ko">Saker du kan behandle</h2>
          <ul className="entries">
            {administered.map((environment) => (
              <li key={environment.id} className="entry">
                <Link href={environmentCasesHref(environment.id)}>
                  Saker i {environment.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby={listKey}>
        <h2 id={listKey}>Dine saker</h2>
        {own.items.length === 0 ? (
          <EmptyState>
            Du er ikke part i noen saker. En sak starter fra miljøet, lånet
            eller det den gjelder.
          </EmptyState>
        ) : (
          <CaseList
            label="Dine saker, nyeste først"
            cases={own.items}
            viewer={{ userId: account.userId, asHandler: false }}
            environmentName={(id) => names.get(id) ?? null}
            nameOf={() => ""}
            more={
              own.nextCursor === null
                ? null
                : morePagesHref(casesHref, query, listKey, listKey)
            }
          />
        )}
      </section>
    </main>
  );
}

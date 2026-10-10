import {
  collectPages,
  listOwnCases,
  listOwnEnvironments,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
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
 * Own cases (UX-IA-007, PS-COM-001): the cases the user takes part in, the
 * open ones first, with «Din tur» where they are to write; and, for each
 * environment they administer, the way to its queue. It is a way into the
 * same pages, not an inbox of its own. A report about the user is never
 * here. The platform stewards' queue is not shown until their stronger
 * sign-in is built (OD-0023), since every action in it is refused until
 * then.
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
  const groups = [
    {
      key: "apne",
      heading: "Åpne",
      cases: own.items.filter((c) => c.status === "open"),
    },
    {
      key: "lukkede",
      heading: "Lukkede",
      cases: own.items.filter((c) => c.status === "closed"),
    },
  ].filter((group) => group.cases.length > 0);
  const viewer = { userId: account.userId, asHandler: false };

  return (
    <main>
      <PageHeader title="Saker" home="home">
        Kontakt med administratorer, meklinger og rapporter du er part i.
        Private samtaler er aldri en del av en sak.
      </PageHeader>
      {own.items.length === 0 && (
        <EmptyState>
          Du har ingen saker. En sak starter fra miljøet, lånet eller det den
          gjelder.
        </EmptyState>
      )}
      <div id={listKey}>
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={group.key}>
            <h2 id={group.key}>
              {group.heading}
              {group.key === "apne" && (
                <span className="count"> · {group.cases.length}</span>
              )}
            </h2>
            <CaseList
              label={group.key}
              cases={group.cases}
              viewer={viewer}
              environmentName={(id) => names.get(id) ?? null}
            />
          </section>
        ))}
      </div>
      {own.nextCursor !== null && (
        <p className="link-row">
          <a href={morePagesHref(casesHref, query, listKey, listKey)}>
            Vis eldre saker
          </a>
        </p>
      )}
      {administered.length > 0 && (
        <section aria-labelledby="ko">
          <h2 id="ko">Saker du kan behandle</h2>
          <MenuList label="ko">
            {administered.map((environment) => (
              <MenuRow
                key={environment.id}
                href={environmentCasesHref(environment.id)}
                icon="shield"
                label={`Saker i ${environment.name}`}
                detail="Som administrator"
              />
            ))}
          </MenuList>
        </section>
      )}
    </main>
  );
}

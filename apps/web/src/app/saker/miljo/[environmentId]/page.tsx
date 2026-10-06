import {
  collectPages,
  getEnvironment,
  listEnvironmentCaseQueue,
  listRoles,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ContextTag } from "@/components/tag";
import { environmentCasesHref, showsClosedCases } from "@/navigation/cases";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { casesHref } from "@/navigation/routes";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { CaseList } from "../../case-list";

export const metadata: Metadata = { title: "Saker i miljøet – Lånbort" };

const listKey = "saker";

/**
 * An environment's queue (UX-IA-007, UX-JRN-012): the cases its
 * administrators handle, open or closed, newest first. What the viewer is
 * involved in is never here (PS-USR-009); anyone but an administrator gets
 * the page that says nothing is here.
 */
export default async function EnvironmentCasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ environmentId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const account = await requirePageAccount();
  const [{ environmentId }, query] = await Promise.all([params, searchParams]);
  const closed = showsClosedCases(query);
  const status = closed ? "closed" : "open";
  const queue = await collectPages(
    (cursor) =>
      pageQueryOrNotFound(listEnvironmentCaseQueue, {
        environmentId,
        status,
        cursor,
      }),
    (page) => page.items,
    pagesShown(query, listKey),
  );
  const [environment, roles] = await Promise.all([
    pageQueryOrNotFound(getEnvironment, { environmentId }),
    pageQuery(listRoles, { environmentId }),
  ]);
  const names = new Map(
    (roles?.holders ?? []).map((holder) => [holder.userId, holder.realName]),
  );
  const filters = [
    { label: "Åpne", href: environmentCasesHref(environmentId), on: !closed },
    {
      label: "Lukkede",
      href: environmentCasesHref(environmentId, "closed"),
      on: closed,
    },
  ];

  return (
    <main>
      <PageHeader
        title="Saker"
        back={{ href: casesHref, label: "Alle saker" }}
        context={<ContextTag label="Miljø">{environment.name}</ContextTag>}
      >
        Saker til administratorene i {environment.name}. Saker du selv er
        involvert i, vises ikke her.
      </PageHeader>
      <nav className="filters" aria-label="Vis saker">
        {filters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            aria-current={filter.on ? "page" : undefined}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      <section aria-labelledby={listKey}>
        <h2 id={listKey} className="visually-hidden">
          {closed ? "Lukkede saker" : "Åpne saker"}
        </h2>
        {queue.items.length === 0 ? (
          <EmptyState>
            {closed ? "Ingen lukkede saker." : "Ingen saker venter nå."}
          </EmptyState>
        ) : (
          <CaseList
            label={closed ? "Lukkede saker" : "Åpne saker, nyeste først"}
            cases={queue.items}
            viewer={{ userId: account.userId, asHandler: true }}
            environmentName={() => null}
            nameOf={(userId) => names.get(userId) ?? "Tidligere bruker"}
            more={
              queue.nextCursor === null
                ? null
                : morePagesHref(
                    environmentCasesHref(environmentId),
                    query,
                    listKey,
                    listKey,
                  )
            }
          />
        )}
      </section>
    </main>
  );
}

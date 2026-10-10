import {
  collectPages,
  getEnvironment,
  listEnvironmentCaseQueue,
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
import { queueGroups } from "@/presentation/cases";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";
import { CaseList } from "../../case-list";
import { HandlerRole } from "../../handler-role";
import styles from "../../cases.module.css";

export const metadata: Metadata = { title: "Saker i miljøet – Lånbort" };

const listKey = "saker";

/**
 * An environment's queue (UX-IA-007, UX-JRN-012): the cases its
 * administrators handle, open or closed. The open ones are grouped by who
 * has them, in the order work is done (`queueGroups`). What the viewer is
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
  const environment = await pageQueryOrNotFound(getEnvironment, {
    environmentId,
  });
  const filters = [
    {
      label: closed ? "Åpne" : `Åpne · ${queue.items.length}`,
      href: environmentCasesHref(environmentId),
      on: !closed,
    },
    {
      label: "Lukkede",
      href: environmentCasesHref(environmentId, "closed"),
      on: closed,
    },
  ];
  const viewer = { userId: account.userId, asHandler: true };
  const groups = closed
    ? [{ key: "lukkede", heading: "Lukkede saker", cases: queue.items }]
    : queueGroups(queue.items, account.userId);

  return (
    <main>
      <PageHeader
        title="Saker"
        kind="Miljø"
        back={{ href: casesHref, label: "Saker" }}
        context={
          <ContextTag label="Miljø" icon="environment">
            {environment.name}
          </ContextTag>
        }
      />
      <HandlerRole environment={environment.name} />
      <nav className="filters" aria-label="Vis saker">
        {filters.map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            aria-current={filter.on ? "page" : undefined}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      <div id={listKey}>
        {queue.items.length === 0 ? (
          <EmptyState>
            {closed ? "Ingen lukkede saker." : "Ingen saker venter nå."}
          </EmptyState>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-labelledby={group.key}>
              <h2 id={group.key}>
                {group.heading}
                {!closed && (
                  <span className="count"> · {group.cases.length}</span>
                )}
              </h2>
              <CaseList
                label={group.key}
                cases={group.cases}
                viewer={viewer}
                environmentName={() => null}
              />
            </section>
          ))
        )}
      </div>
      {queue.nextCursor !== null && (
        <p className="link-row">
          <a
            href={morePagesHref(
              environmentCasesHref(environmentId),
              query,
              listKey,
              listKey,
            )}
          >
            Vis eldre saker
          </a>
        </p>
      )}
      <p className={styles.footnote}>
        Køen viser ikke saker der du selv er part eller rapportert, og sier ikke
        at de finnes.
      </p>
    </main>
  );
}

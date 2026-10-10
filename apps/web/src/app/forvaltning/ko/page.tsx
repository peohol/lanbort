import { collectPages, listPlatformCaseQueue } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import {
  parsePlatformQueue,
  type PlatformQueueFilter,
  platformQueueFilters,
  platformQueueHref,
  platformQueuePath,
  stewardshipHref,
} from "@/navigation/stewardship";
import { queueGroups } from "@/presentation/cases";
import { stewardStanding } from "@/presentation/stewardship";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";
import { requireStewardship } from "@/server/stewardship";
import { CaseList } from "../../saker/case-list";
import { StewardRole } from "../steward-role";
import { StewardStatus } from "../steward-status";
import styles from "../../saker/cases.module.css";

export const metadata: Metadata = { title: "Plattformkøen – Lånbort" };

const listKey = "saker";

/**
 * The platform queue (PS-ADM-013, PS-ADM-015, Tomat «Plattformkøen»): the
 * cases the platform stewards handle, as the environments' queues in core
 * flow 8, filtered by kind and grouped by who has them. Reading it takes
 * the same fresh passkey confirmation as acting; until then nothing from
 * the cases is shown. Cases the steward is involved in are never here.
 */
export default async function PlatformQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const account = await requirePageAccount();
  const steward = await requireStewardship();
  const query = await searchParams;
  const header = (
    <>
      <PageHeader
        title="Plattformkøen"
        kind="Lånbort"
        back={{ href: stewardshipHref, label: "Forvaltning" }}
      />
      <StewardRole steward={steward} />
    </>
  );

  if (stewardStanding(steward) !== "confirmed") {
    return (
      <main>
        {header}
        <StewardStatus steward={steward} unassigned={null} />
      </main>
    );
  }

  const { status, filter } = parsePlatformQueue(query);
  const closed = status === "closed";
  const queue = await collectPages(
    (cursor) => pageQueryOrNotFound(listPlatformCaseQueue, { status, cursor }),
    (page) => page.items,
    pagesShown(query, listKey),
  );
  const inFilter = (key: PlatformQueueFilter) =>
    queue.items.filter((c) =>
      (platformQueueFilters[key].kinds as readonly string[]).includes(c.kind),
    );
  const shown = filter ? inFilter(filter) : queue.items;
  const statuses = [
    { label: "Åpne", status: "open" as const },
    { label: "Lukkede", status: "closed" as const },
  ];
  const kinds = [
    { label: "Alle", filter: undefined, count: queue.items.length },
    ...(Object.keys(platformQueueFilters) as PlatformQueueFilter[]).map(
      (key) => ({
        label: platformQueueFilters[key].label,
        filter: key,
        count: inFilter(key).length,
      }),
    ),
  ];
  const viewer = { userId: account.userId, asHandler: true };
  const groups = closed
    ? [{ key: "lukkede", heading: "Lukkede saker", cases: shown }]
    : queueGroups(shown, account.userId);

  return (
    <main>
      {header}
      <nav className="filters" aria-label="Åpne eller lukkede">
        {statuses.map((each) => (
          <Link
            key={each.status}
            href={platformQueueHref({ status: each.status, filter })}
            aria-current={each.status === status ? "page" : undefined}
          >
            {each.label}
            {each.status === status && ` · ${queue.items.length}`}
          </Link>
        ))}
      </nav>
      <nav className="filters" aria-label="Sakstype">
        {kinds.map((each) => (
          <Link
            key={each.label}
            href={platformQueueHref({ status, filter: each.filter })}
            aria-current={each.filter === filter ? "page" : undefined}
          >
            {each.label} · {each.count}
          </Link>
        ))}
      </nav>
      <div id={listKey}>
        {shown.length === 0 ? (
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
          <a href={morePagesHref(platformQueuePath, query, listKey, listKey)}>
            Vis eldre saker
          </a>
        </p>
      )}
      <p className={styles.footnote}>
        Saker der du selv er involvert, som den som rapporterte, den saken
        gjelder eller part, står ikke her. Dem ser du bare som part.
      </p>
    </main>
  );
}

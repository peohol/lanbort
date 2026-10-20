import {
  type PilotPriority,
  pilotPhases,
  pilotPriorityNames,
  pilotTestStatusSchema,
} from "@lanbort/contracts";
import { readPilotWorkspace } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import type { SearchParams } from "@/navigation/list-pages";
import {
  pilotCampaignHref,
  pilotDefectsHref,
  pilotTasksHref,
  pilotTestHref,
} from "@/navigation/pilot";
import {
  blockingDefects,
  filterPilotTests,
  pilotAreaName,
  pilotFilterChoices,
  pilotFilterOf,
  pilotPhaseName,
  pilotSeverityLabels,
  pilotStatusLabels,
  pilotStatusTones,
  pilotViewHref,
  pilotViews,
  type PilotView,
} from "@/presentation/pilot";
import { requirePilotRole } from "@/server/pilot";
import { pageQueryOrNotFound } from "@/server/session";
import { PilotNav } from "./pilot-nav";
import styles from "./pilot.module.css";
import { ProgressBars } from "./progress-bars";
import { QuickPass } from "./quick-pass";

export const metadata: Metadata = { title: "Pilot – Lånbort" };

/**
 * «Pilotoversikt» (pilot-ui.md): the campaign and its phase, what stops the
 * next phase, progress by priority and area, and every test with its
 * standing, to search, narrow down and record from. A participant has only
 * their own tasks.
 */
export default async function PilotOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if ((await requirePilotRole()).role !== "lead") redirect(pilotTasksHref);

  const workspace = await pageQueryOrNotFound(readPilotWorkspace, {});
  const { campaign, progress, defects, participants } = workspace;
  const filter = pilotFilterOf(await searchParams);
  const shown = filterPilotTests(workspace.tests, filter);
  const blocking = blockingDefects(defects);
  const gate = campaign && progress.gates[campaign.phase];
  const open = campaign !== null && campaign.closedAt === null;

  return (
    <main>
      <PageHeader title="Pilot" home="home">
        {campaign &&
          `${campaign.name} · Fase ${pilotPhaseName(campaign.phase)} · ${open ? "Pågår" : "Avsluttet"}`}
      </PageHeader>
      <PilotNav />

      {!campaign && (
        <EmptyState
          action={
            <Link href={pilotCampaignHref} className="button button-primary">
              Start piloten
            </Link>
          }
        >
          Ingen pilotkampanje er startet ennå. Når du starter den, kan du
          registrere testresultater her.
        </EmptyState>
      )}

      {blocking.length > 0 && (
        <section className="card" aria-labelledby="stopper">
          <h2 id="stopper">
            <Tag tone="danger">
              {blocking.length} alvorlige feil stopper piloten
            </Tag>
          </h2>
          <ul>
            {blocking.map((defect) => (
              <li key={defect.id}>
                F-{defect.number} {defect.title} (
                {pilotSeverityLabels[defect.severity]})
              </li>
            ))}
          </ul>
          <Link href={pilotDefectsHref}>Gå til feil</Link>
        </section>
      )}

      {gate && (
        <section className="card" aria-labelledby="port">
          <h2 id="port">
            Port etter fase {pilotPhaseName(gate.phase)}{" "}
            <Tag tone={gate.open ? "positive" : "waiting"}>
              {gate.open ? "Klar for neste fase" : "Ikke klar ennå"}
            </Tag>
          </h2>
          <p>{pilotPhases[gate.phase]!.gate}</p>
          {!gate.open && (
            <ul>
              {gate.basisNotPassed.length > 0 && (
                <li>
                  {gate.basisNotPassed.length} basistester er ikke bestått:{" "}
                  {gate.basisNotPassed.join(", ")}
                </li>
              )}
              {gate.untried.length > 0 && (
                <li>
                  {gate.untried.length} andre tester er ikke prøvd:{" "}
                  {gate.untried.join(", ")}
                </li>
              )}
              {gate.blockingDefects > 0 && (
                <li>{gate.blockingDefects} P0/P1-feil er ikke løst</li>
              )}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="fremdrift">
        <h2 id="fremdrift">Fremdrift</h2>
        <ul className={styles.counts}>
          {pilotTestStatusSchema.options.map((status) => (
            <li key={status}>
              <Tag tone={pilotStatusTones[status]}>
                {pilotStatusLabels[status]}: {progress.counts[status]}
              </Tag>
            </li>
          ))}
        </ul>
        <h3>Etter prioritet</h3>
        <ProgressBars
          groups={progress.byPriority.map((group) => ({
            ...group,
            label: `${group.key} – ${pilotPriorityNames[group.key as PilotPriority]}`,
          }))}
        />
        <h3>Etter område</h3>
        <ProgressBars
          groups={progress.byArea.map((group) => ({
            ...group,
            label: `${group.key} – ${pilotAreaName(group.key)}`,
          }))}
        />
      </section>

      <section aria-labelledby="tester">
        <h2 id="tester">Tester</h2>
        <nav aria-label="Utvalg" className="filters">
          {(Object.keys(pilotViews) as PilotView[]).map((view) => (
            <Link
              key={view}
              href={pilotViewHref(filter, view)}
              aria-current={filter.view === view ? "page" : undefined}
            >
              {pilotViews[view].label}
            </Link>
          ))}
        </nav>
        <form method="get" className={styles.filterForm}>
          <input type="hidden" name="vis" value={filter.view} />
          <Field id="pilot-q" label="Søk">
            <input
              id="pilot-q"
              name="q"
              type="search"
              defaultValue={filter.q}
              placeholder="ID eller beskrivelse"
            />
          </Field>
          {(
            [
              ["omrade", "Område", pilotFilterChoices.area, filter.area],
              ["fase", "Fase", pilotFilterChoices.phase, filter.phase],
              [
                "prioritet",
                "Prioritet",
                pilotFilterChoices.priority,
                filter.priority,
              ],
              ["status", "Status", pilotFilterChoices.status, filter.status],
              [
                "tester",
                "Tester",
                participants.map((participant) => ({
                  value: participant.pseudonym,
                  label: participant.pseudonym,
                })),
                filter.tester,
              ],
            ] as const
          ).map(([name, label, choices, value]) => (
            <Field key={name} id={`pilot-${name}`} label={label}>
              <select id={`pilot-${name}`} name={name} defaultValue={value}>
                <option value="">Alle</option>
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <div className="actions">
            <button type="submit">Vis</button>
          </div>
        </form>
        <p role="status">
          Viser {shown.length} av {workspace.tests.length} tester
        </p>
        {shown.length > 0 ? (
          <MenuList>
            {shown.map((test) => (
              <MenuRow
                key={test.id}
                href={pilotTestHref(test.id)}
                label={`${test.id} ${test.action}`}
                detail={
                  <>
                    <Tag tone={pilotStatusTones[test.status]}>
                      {pilotStatusLabels[test.status]}
                    </Tag>{" "}
                    {test.priority} · fase {test.phase}
                    {test.assignees.length > 0 &&
                      ` · ${test.assignees.join(", ")}`}
                    {test.openDefects > 0 && ` · ${test.openDefects} åpne feil`}
                  </>
                }
                actions={
                  open &&
                  test.status !== "passed" && (
                    <QuickPass campaignId={campaign.id} testId={test.id} />
                  )
                }
              />
            ))}
          </MenuList>
        ) : (
          <EmptyState>Ingen tester passer med dette utvalget.</EmptyState>
        )}
      </section>
    </main>
  );
}

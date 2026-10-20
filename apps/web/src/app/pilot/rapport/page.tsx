import {
  type PilotCounts,
  type PilotPriority,
  pilotDefectStatusSchema,
  pilotPriorityNames,
  pilotSeveritySchema,
  pilotTestStatusSchema,
} from "@lanbort/contracts";
import { readPilotWorkspace } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { pilotHref } from "@/navigation/pilot";
import {
  pilotAreaName,
  pilotDefectStatusLabels,
  pilotPhaseName,
  pilotStatusLabels,
} from "@/presentation/pilot";
import { requirePilotLead } from "@/server/pilot";
import { pageQueryOrNotFound } from "@/server/session";
import { PilotNav } from "../pilot-nav";
import styles from "../pilot.module.css";
import { ExportButtons } from "./export-buttons";

export const metadata: Metadata = { title: "Pilotrapport – Lånbort" };

/** A table of how many tests of each group stand where. */
function CountsTable({
  caption,
  groups,
}: {
  caption: string;
  groups: readonly {
    key: string;
    label: string;
    total: number;
    counts: PilotCounts;
  }[];
}) {
  return (
    // Scrolls on its own on a narrow screen, so it can take focus.
    <div
      className={styles.tableWrap}
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className={styles.table}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Gruppe</th>
            <th scope="col">Totalt</th>
            {pilotTestStatusSchema.options.map((status) => (
              <th key={status} scope="col">
                {pilotStatusLabels[status]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.key}>
              <th scope="row">{group.label}</th>
              <td>{group.total}</td>
              {pilotTestStatusSchema.options.map((status) => (
                <td key={status}>{group.counts[status]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * «Rapportering» (pilot-ui.md): progress by phase, area and priority, the
 * defects by severity and status, and the journal to download.
 */
export default async function PilotReportPage() {
  await requirePilotLead();
  const { progress, defects } = await pageQueryOrNotFound(
    readPilotWorkspace,
    {},
  );

  return (
    <main>
      <PageHeader title="Rapport" back={{ href: pilotHref, label: "Pilot" }} />
      <PilotNav />

      <section aria-labelledby="statistikk">
        <h2 id="statistikk">Fremdrift</h2>
        <CountsTable
          caption="Alle tester"
          groups={[
            {
              key: "all",
              label: "Alle",
              total: progress.total,
              counts: progress.counts,
            },
          ]}
        />
        <CountsTable
          caption="Etter fase"
          groups={progress.byPhase.map((group) => ({
            ...group,
            label: pilotPhaseName(Number(group.key)),
          }))}
        />
        <CountsTable
          caption="Etter område"
          groups={progress.byArea.map((group) => ({
            ...group,
            label: `${group.key} – ${pilotAreaName(group.key)}`,
          }))}
        />
        <CountsTable
          caption="Etter prioritet"
          groups={progress.byPriority.map((group) => ({
            ...group,
            label: `${group.key} – ${pilotPriorityNames[group.key as PilotPriority]}`,
          }))}
        />
      </section>

      <section aria-labelledby="feil">
        <h2 id="feil">Feil</h2>
        <div
          className={styles.tableWrap}
          role="region"
          aria-label="Feil etter alvorlighet og status"
          tabIndex={0}
        >
          <table className={styles.table}>
            <caption>Feil etter alvorlighet og status</caption>
            <thead>
              <tr>
                <th scope="col">Alvorlighet</th>
                {pilotDefectStatusSchema.options.map((status) => (
                  <th key={status} scope="col">
                    {pilotDefectStatusLabels[status]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pilotSeveritySchema.options.map((severity) => (
                <tr key={severity}>
                  <th scope="row">{severity}</th>
                  {pilotDefectStatusSchema.options.map((status) => (
                    <td key={status}>
                      {
                        defects.filter(
                          (defect) =>
                            defect.severity === severity &&
                            defect.status === status,
                        ).length
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="eksport">
        <h2 id="eksport">Last ned</h2>
        <p>
          Filene lastes ned til denne enheten og sendes ikke noe annet sted.
          Resultatene viser deltakerne bare med pseudonym. Sammendraget har bare
          tall og passer i en ukesstatus.
        </p>
        <ExportButtons />
      </section>
    </main>
  );
}

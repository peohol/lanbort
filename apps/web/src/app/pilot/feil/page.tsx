import {
  pilotDefectStatusSchema,
  pilotSeveritySchema,
} from "@lanbort/contracts";
import { readPilotWorkspace } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { CommandForm } from "@/components/command-form";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { pilotHref, pilotTestHref } from "@/navigation/pilot";
import { formatShortTime } from "@/presentation/dates";
import {
  pilotDefectStatusLabels,
  pilotSeverityLabels,
  pilotSeverityTones,
} from "@/presentation/pilot";
import { requirePilotLead } from "@/server/pilot";
import { pageQueryOrNotFound } from "@/server/session";
import { PilotNav } from "../pilot-nav";
import styles from "../pilot.module.css";

export const metadata: Metadata = { title: "Feil i piloten – Lånbort" };

/** Unresolved first, the most serious first among them. */
const order = (status: string, severity: string) =>
  `${status === "open" || status === "fixed" ? 0 : 1}${severity}`;

/**
 * The pilot's defects (pilot-ui.md «Avviksreferanser»): how serious each is
 * and where it stands, the tests it was found in, and the way to have them
 * tried again once it is fixed.
 */
export default async function PilotDefectsPage() {
  await requirePilotLead();
  const { campaign, defects } = await pageQueryOrNotFound(
    readPilotWorkspace,
    {},
  );
  const open = campaign !== null && campaign.closedAt === null;
  const sorted = [...defects].sort((a, b) =>
    order(a.status, a.severity).localeCompare(order(b.status, b.severity)),
  );

  return (
    <main>
      <PageHeader title="Feil" back={{ href: pilotHref, label: "Pilot" }} />
      <PilotNav />

      {sorted.length === 0 && (
        <EmptyState>Ingen feil er registrert i denne kampanjen.</EmptyState>
      )}
      <ul className={styles.history}>
        {sorted.map((defect) => (
          <li key={defect.id} className="card">
            <h2>
              F-{defect.number} {defect.title}
            </h2>
            <p>
              <Tag tone={pilotSeverityTones[defect.severity]}>
                {pilotSeverityLabels[defect.severity]}
              </Tag>{" "}
              <Tag>{pilotDefectStatusLabels[defect.status]}</Tag>
            </p>
            <p className={styles.meta}>
              Registrert {formatShortTime(defect.createdAt)} · endret{" "}
              {formatShortTime(defect.updatedAt)}
            </p>
            {defect.description && (
              <p className={styles.quote}>{defect.description}</p>
            )}
            {defect.link && (
              <p>
                <a href={defect.link} rel="noreferrer noopener" target="_blank">
                  Privat beskrivelse
                </a>
              </p>
            )}
            {defect.testIds.length > 0 && (
              <p>
                Funnet i:{" "}
                {defect.testIds.map((testId, index) => (
                  <span key={testId}>
                    {index > 0 && ", "}
                    <Link href={pilotTestHref(testId)}>{testId}</Link>
                  </span>
                ))}
              </p>
            )}
            {open && (
              <details>
                <summary>Endre alvorlighet eller status</summary>
                <CommandForm
                  path={`/api/pilot/defects/${defect.id}`}
                  submitLabel="Lagre"
                  done={`F-${defect.number} er endret`}
                >
                  <Field id={`severity-${defect.id}`} label="Alvorlighet">
                    <select
                      id={`severity-${defect.id}`}
                      name="severity"
                      defaultValue={defect.severity}
                    >
                      {pilotSeveritySchema.options.map((severity) => (
                        <option key={severity} value={severity}>
                          {pilotSeverityLabels[severity]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id={`status-${defect.id}`} label="Status">
                    <select
                      id={`status-${defect.id}`}
                      name="status"
                      defaultValue={defect.status}
                    >
                      {pilotDefectStatusSchema.options.map((status) => (
                        <option key={status} value={status}>
                          {pilotDefectStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </CommandForm>
              </details>
            )}
            {open && defect.testIds.length > 0 && (
              <div className="actions">
                <ActionButton
                  label={`Be om ny test av ${defect.testIds.join(", ")}`}
                  path="/api/pilot/retests"
                  body={{
                    campaignId: campaign.id,
                    testIds: defect.testIds,
                    note: `Etter F-${defect.number}`,
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {open && (
        <section aria-labelledby="ny-feil">
          <h2 id="ny-feil">Registrer en feil</h2>
          <p>
            For feil du fant utenfor en test. Feil i en test registrerer du på
            testen.
          </p>
          <CommandForm
            path="/api/pilot/defects"
            fixed={{ campaignId: campaign.id }}
            submitLabel="Registrer feilen"
          >
            <Field id="defect-title" label="Hva er feil, kort">
              <input id="defect-title" name="title" required maxLength={120} />
            </Field>
            <Field id="defect-severity" label="Hvor alvorlig">
              <select id="defect-severity" name="severity" defaultValue="P2">
                {pilotSeveritySchema.options.map((severity) => (
                  <option key={severity} value={severity}>
                    {pilotSeverityLabels[severity]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="defect-description" label="Beskrivelse (valgfritt)">
              <textarea
                id="defect-description"
                name="description"
                rows={3}
                maxLength={2000}
              />
            </Field>
            <Field
              id="defect-link"
              label="Lenke til privat beskrivelse (valgfritt)"
              help="Bare en privat lenke, aldri en offentlig sak."
            >
              <input
                id="defect-link"
                name="link"
                type="url"
                pattern="https://.*"
                maxLength={500}
                aria-describedby="defect-link-hjelp"
              />
            </Field>
          </CommandForm>
        </section>
      )}
    </main>
  );
}

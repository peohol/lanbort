import { pilotCatalogueVersion, pilotPhases } from "@lanbort/contracts";
import { readPilotWorkspace } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { CommandForm } from "@/components/command-form";
import { ConfirmAction } from "@/components/confirm-action";
import { Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { pilotHref, pilotReadinessHref } from "@/navigation/pilot";
import { formatShortTime } from "@/presentation/dates";
import { pilotReadinessOf } from "@/presentation/pilot";
import { requirePilotLead } from "@/server/pilot";
import { pageQueryOrNotFound } from "@/server/session";
import { ContinuePhase } from "../continue-phase";
import { PilotNav } from "../pilot-nav";
import styles from "../pilot.module.css";

export const metadata: Metadata = { title: "Pilotkampanje – Lånbort" };

/**
 * The campaign (pilot-ui.md «Livssyklus»): start it, continue to the next
 * phase only when the current phase is ready, and close it. The lead decides
 * when to continue; phases cannot be skipped or revisited.
 */
export default async function PilotCampaignPage() {
  await requirePilotLead();
  const { campaign, progress, readiness } = await pageQueryOrNotFound(
    readPilotWorkspace,
    {},
  );
  const open = campaign !== null && campaign.closedAt === null;

  return (
    <main>
      <PageHeader title="Kampanje" back={{ href: pilotHref, label: "Pilot" }} />
      <PilotNav />

      {campaign && (
        <section className="card" aria-label="Kampanjen">
          <dl className="facts">
            <dt>Navn</dt>
            <dd>{campaign.name}</dd>
            <dt>Startet</dt>
            <dd>{formatShortTime(campaign.startedAt)}</dd>
            <dt>Status</dt>
            <dd>
              {campaign.closedAt
                ? `Avsluttet ${formatShortTime(campaign.closedAt)}`
                : "Pågår"}
            </dd>
            <dt>Testkatalog</dt>
            <dd>Versjon {pilotCatalogueVersion}</dd>
          </dl>
        </section>
      )}

      {!open && (
        <section aria-labelledby="start">
          <h2 id="start">Start en kampanje</h2>
          {campaign && (
            <p>
              Den forrige kampanjen er avsluttet og kan bare leses. En ny
              kampanje begynner med alle tester som ikke startet.
            </p>
          )}
          <CommandForm
            path="/api/pilot/campaigns"
            submitLabel="Start kampanjen"
          >
            <Field id="campaign-name" label="Navn">
              <input
                id="campaign-name"
                name="name"
                required
                maxLength={80}
                defaultValue="Lukket pilot"
              />
            </Field>
          </CommandForm>
        </section>
      )}

      <section aria-labelledby="faser">
        <h2 id="faser">Faser</h2>
        <ol className={styles.history}>
          {pilotPhases.map((phase) => {
            const gate = progress.gates[phase.number]!;
            const checklist = pilotReadinessOf(readiness, phase.number);
            const met = gate.open && (checklist?.ready ?? true);
            const current = campaign?.phase === phase.number;

            return (
              <li key={phase.number} className="card">
                <h3>
                  {phase.number}. {phase.name}{" "}
                  {current && <Tag tone="attention">Nå</Tag>}
                </h3>
                <p className={styles.meta}>{phase.when}</p>
                <p>{phase.tasks}</p>
                <p>
                  <strong>Port:</strong> {phase.gate}{" "}
                  <Tag tone={met ? "positive" : "waiting"}>
                    {met ? "Oppfylt" : "Ikke oppfylt"}
                  </Tag>
                </p>
                {checklist && (
                  <p>
                    <Link href={pilotReadinessHref}>
                      Sjekkliste for {phase.name.toLowerCase()}
                    </Link>
                  </p>
                )}
                {open && current && (
                  <ContinuePhase
                    campaign={campaign}
                    gate={gate}
                    readiness={checklist}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {open && (
        <section aria-labelledby="avslutt">
          <h2 id="avslutt">Avslutt kampanjen</h2>
          <p>
            Last ned resultatene under «Rapport» først. En avsluttet kampanje
            kan bare leses.
          </p>
          <ConfirmAction
            label="Avslutt kampanjen"
            title={`Avslutte ${campaign.name}?`}
            consequences={{
              gone: [
                "Muligheten til å registrere nye resultater, feil og oppgaver",
                "Deltakernes åpne oppgaver",
              ],
              stays: [
                "Alle resultater, feil og tilbakemeldinger, som kan lastes ned",
              ],
            }}
            confirmLabel="Avslutt kampanjen"
            path={`/api/pilot/campaigns/${campaign.id}/close`}
            body={{}}
            danger
          />
        </section>
      )}
    </main>
  );
}

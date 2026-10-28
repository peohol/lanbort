import {
  type PilotCampaign,
  type PilotRequirement,
  type PilotRequirementStanding,
  pilotPhases,
  pilotRequirementsOf,
} from "@lanbort/contracts";
import { readPilotWorkspace } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { CommandForm } from "@/components/command-form";
import { EmptyState } from "@/components/empty-state";
import { describedBy, Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import {
  pilotCampaignHref,
  pilotDefectsHref,
  pilotHref,
} from "@/navigation/pilot";
import { formatShortTime } from "@/presentation/dates";
import {
  pilotReadinessOf,
  pilotRequirementCheckLabels,
  pilotRequirementCounts,
  pilotRequirementStatusLabels,
  pilotRequirementStatusTones,
} from "@/presentation/pilot";
import { requirePilotLead } from "@/server/pilot";
import { pageQueryOrNotFound } from "@/server/session";
import { ContinuePhase } from "../continue-phase";
import { PilotNav } from "../pilot-nav";
import styles from "../pilot.module.css";

export const metadata: Metadata = { title: "Klargjøring – Lånbort" };

/** The checklist this page is for: «0. Klargjøring». */
const phase = 0;

/** Pages in the journal that show what a journal requirement follows. */
const journalPages: Readonly<Record<string, { href: string; label: string }>> =
  {
    "phase-tests": {
      href: `${pilotHref}?vis=all&fase=${phase}`,
      label: "Se testene i fasen",
    },
    "critical-defects": { href: pilotDefectsHref, label: "Se feillisten" },
  };

/**
 * «Klargjøring» as an operative checklist (pilot-ui.md «Gjennomføring per
 * fase»): every requirement before the first participants are invited,
 * where it stands and on what ground, the automatic checks run on request,
 * the manual ones confirmed with how, and «Gå videre til fase 1» only when
 * all of it holds.
 */
export default async function PilotReadinessPage() {
  await requirePilotLead();
  const { campaign, progress, readiness } = await pageQueryOrNotFound(
    readPilotWorkspace,
    {},
  );
  const checklist = pilotReadinessOf(readiness, phase)!;
  const editable =
    campaign !== null && campaign.closedAt === null && campaign.phase === phase;
  const standings = new Map(
    checklist.requirements.map((standing) => [standing.id, standing]),
  );
  const groups = [
    {
      id: "automatisk",
      title: "Kontrolleres automatisk",
      requirements: pilotRequirementsOf(phase).filter(
        (requirement) => requirement.check !== "manual",
      ),
    },
    {
      id: "manuelt",
      title: "Bekreftes av deg",
      requirements: pilotRequirementsOf(phase).filter(
        (requirement) => requirement.check === "manual",
      ),
    },
  ];

  return (
    <main>
      <PageHeader
        title="Klargjøring"
        back={{ href: pilotHref, label: "Pilot" }}
      >
        Fase {phase} · {pilotPhases[phase]!.when}
      </PageHeader>
      <PilotNav />

      <p>
        Før de første deltakerne inviteres, må hvert krav under være bestått. Et
        krav vises som bestått bare når det er dokumentert: en automatisk
        kontroll fra den siste timen, eller en bekreftelse som sier hvem, når og
        hvordan.
      </p>

      {!campaign && (
        <EmptyState
          action={
            <Link href={pilotCampaignHref} className="button button-primary">
              Start piloten
            </Link>
          }
        >
          Start piloten først. Sjekklisten hører til kampanjen.
        </EmptyState>
      )}

      {campaign && (
        <section className="card" aria-labelledby="status">
          <h2 id="status">
            {checklist.approvedAt ? (
              <Tag tone="positive">Godkjent</Tag>
            ) : checklist.ready ? (
              <Tag tone="positive">Alle krav er bestått</Tag>
            ) : (
              <Tag tone="waiting">Ikke klar ennå</Tag>
            )}
          </h2>
          <ul className={styles.counts} aria-label="Krav etter status">
            {pilotRequirementCounts(checklist).map(({ status, count }) => (
              <li key={status}>
                <Tag tone={pilotRequirementStatusTones[status]}>
                  {pilotRequirementStatusLabels[status]}: {count}
                </Tag>
              </li>
            ))}
          </ul>
          <p className={styles.meta}>
            {checklist.checkedAt
              ? `Automatiske kontroller sist kjørt ${formatShortTime(checklist.checkedAt)}.`
              : "De automatiske kontrollene er ikke kjørt ennå."}
          </p>
          {editable && (
            <div className="actions">
              <ActionButton
                label="Kontroller nå"
                path={`/api/pilot/campaigns/${campaign.id}/readiness`}
                body={{}}
                idempotent={false}
              />
            </div>
          )}
          {checklist.approvedAt && (
            <p>
              Godkjent {formatShortTime(checklist.approvedAt)}, da piloten gikk
              videre til fase {phase + 1}. Sjekklisten står slik den var da.
            </p>
          )}
        </section>
      )}

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={group.id}>
          <h2 id={group.id}>{group.title}</h2>
          <ol className={styles.history}>
            {group.requirements.map((requirement) => (
              <RequirementItem
                key={requirement.id}
                requirement={requirement}
                standing={standings.get(requirement.id)!}
                campaign={editable ? campaign : null}
              />
            ))}
          </ol>
        </section>
      ))}

      {campaign && editable && (
        <section aria-labelledby="videre">
          <h2 id="videre">Gå videre</h2>
          <ContinuePhase
            campaign={campaign}
            gate={progress.gates[phase]!}
            readiness={checklist}
          />
        </section>
      )}
    </main>
  );
}

/** What stands behind a requirement's status, in a line. */
function groundOf(
  requirement: PilotRequirement,
  standing: PilotRequirementStanding,
): string {
  if (requirement.check === "manual") {
    return standing.status === "passed" && standing.at
      ? `Bekreftet av ${standing.by ?? "pilotansvarlig"} ${formatShortTime(standing.at)}.`
      : "Venter på at du kontrollerer og bekrefter.";
  }

  if (requirement.check === "journal") return standing.summary ?? "";

  if (!standing.at) {
    return "Ikke kontrollert ennå. Trykk «Kontroller nå».";
  }

  if (standing.stale) {
    return `Bestått ${formatShortTime(standing.at)}, men det er over en time siden. Kontroller på nytt før du går videre.`;
  }

  return `${standing.status === "unchecked" ? "Forsøkt" : "Kontrollert"} ${formatShortTime(standing.at)}: ${standing.summary}`;
}

function RequirementItem({
  requirement,
  standing,
  campaign,
}: {
  requirement: PilotRequirement;
  standing: PilotRequirementStanding;
  /** The campaign, while the checklist can be changed. */
  campaign: PilotCampaign | null;
}) {
  const headingId = `krav-${requirement.id}`;
  const noteId = `notat-${requirement.id}`;
  const help = "Ikke skriv navn eller e-postadresser til deltakerne.";
  const journalPage = journalPages[requirement.id];
  const confirmPath =
    campaign &&
    `/api/pilot/campaigns/${campaign.id}/requirements/${requirement.id}`;

  return (
    <li className="card">
      <h3 id={headingId}>
        {requirement.title}{" "}
        <Tag tone={pilotRequirementStatusTones[standing.status]}>
          {pilotRequirementStatusLabels[standing.status]}
        </Tag>
      </h3>
      <p>{requirement.why}</p>
      <p className={styles.meta}>{groundOf(requirement, standing)}</p>
      <details>
        <summary>Vis detaljer</summary>
        <p>
          <strong>{pilotRequirementCheckLabels[requirement.check]}:</strong>{" "}
          {requirement.how}
        </p>
        {standing.note && (
          <p>
            <strong>Slik ble det kontrollert:</strong> {standing.note}
          </p>
        )}
        {standing.details.length > 0 && (
          <ul>
            {standing.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {(standing.links.length > 0 || journalPage) && (
          <ul>
            {journalPage && (
              <li>
                <Link href={journalPage.href}>{journalPage.label}</Link>
              </li>
            )}
            {standing.links.map((link) => (
              <li key={link.href}>
                <a href={link.href} rel="noreferrer" target="_blank">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </details>
      {confirmPath &&
        requirement.check === "manual" &&
        (standing.status === "passed" ? (
          <div className="actions">
            <ActionButton
              label="Trekk tilbake bekreftelsen"
              path={`${confirmPath}/withdraw`}
              body={{}}
            />
          </div>
        ) : (
          <CommandForm
            path={`${confirmPath}/confirm`}
            submitLabel="Bekreft"
            secondary
          >
            <Field id={noteId} label="Hvordan kontrollerte du det?" help={help}>
              <textarea
                id={noteId}
                name="note"
                required
                maxLength={1000}
                rows={3}
                {...describedBy(noteId, help)}
              />
            </Field>
          </CommandForm>
        ))}
    </li>
  );
}

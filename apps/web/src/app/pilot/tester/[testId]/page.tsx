import { pilotPriorityNames } from "@lanbort/contracts";
import { readPilotTest } from "@lanbort/domain";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { CommandForm } from "@/components/command-form";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { pilotHref } from "@/navigation/pilot";
import { formatShortTime } from "@/presentation/dates";
import {
  pilotAreaName,
  pilotDefectStatusLabels,
  pilotDeviceLabels,
  pilotEnvironmentLabels,
  pilotOutcomeLabels,
  pilotOutcomeTones,
  pilotPhaseName,
  pilotSeverityLabels,
  pilotStatusLabels,
  pilotStatusTones,
} from "@/presentation/pilot";
import { requirePilotLead } from "@/server/pilot";
import { pageQueryOrNotFound } from "@/server/session";
import styles from "../../pilot.module.css";
import { RunForm } from "./run-form";

export const metadata: Metadata = { title: "Pilottest – Lånbort" };

/**
 * «Ett testkort» (pilot-ui.md): what to try and expect, the latest result,
 * a new run in a few taps, the participants' tasks for it, and every run
 * before, each with the wording it was tried against.
 */
export default async function PilotTestPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  await requirePilotLead();
  const { testId } = await params;
  const detail = await pageQueryOrNotFound(readPilotTest, { testId });
  const { test, campaign, runs, assignments, participants } = detail;
  const open = campaign !== null && campaign.closedAt === null;

  return (
    <main>
      <PageHeader
        title={`${test.id} ${test.action}`}
        back={{ href: pilotHref, label: "Pilot" }}
      >
        <Tag tone={pilotStatusTones[test.status]}>
          {pilotStatusLabels[test.status]}
        </Tag>
      </PageHeader>

      <section className="card" aria-label="Testen">
        <dl className="facts">
          <dt>Gjør</dt>
          <dd>{test.action}</dd>
          <dt>Forventet</dt>
          <dd>{test.expected}</dd>
          <dt>Område</dt>
          <dd>{pilotAreaName(test.area)}</dd>
          <dt>Prioritet</dt>
          <dd>
            {test.priority} – {pilotPriorityNames[test.priority]}
          </dd>
          <dt>Fase</dt>
          <dd>{pilotPhaseName(test.phase)}</dd>
        </dl>
      </section>

      {open ? (
        <section aria-labelledby="registrer">
          <h2 id="registrer">Registrer resultat</h2>
          <RunForm
            campaignId={campaign.id}
            testId={test.id}
            testers={participants}
            openDefects={detail.openDefects}
          />
        </section>
      ) : (
        <EmptyState>
          {campaign
            ? "Kampanjen er avsluttet, så nye resultater kan ikke registreres."
            : "Start en kampanje før du registrerer resultater."}
        </EmptyState>
      )}

      <section aria-labelledby="oppgaver">
        <h2 id="oppgaver">Oppgaver til deltakere</h2>
        {assignments.length === 0 && <p>Ingen har fått denne som oppgave.</p>}
        <ul className={styles.history}>
          {assignments.map((task) => (
            <li key={task.id} className="card">
              <p className={styles.meta}>
                {task.pseudonym} · gitt {formatShortTime(task.assignedAt)}
                {task.withdrawnAt &&
                  ` · trukket ${formatShortTime(task.withdrawnAt)}`}
              </p>
              <p className={styles.quote}>{task.goal}</p>
              {task.feedback.map((report) => (
                <p key={report.reportedAt}>
                  <Tag tone={pilotOutcomeTones[report.outcome]}>
                    {pilotOutcomeLabels[report.outcome]}
                  </Tag>{" "}
                  <span className={styles.meta}>
                    {formatShortTime(report.reportedAt)}
                  </span>
                  {report.comment && (
                    <span className={styles.quote}> «{report.comment}»</span>
                  )}
                </p>
              ))}
              {open && !task.withdrawnAt && (
                <div className="actions">
                  <ActionButton
                    label="Trekk oppgaven"
                    path={`/api/pilot/assignments/${task.id}/withdraw`}
                    body={{}}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        {open && participants.length > 0 && (
          <details>
            <summary>Gi oppgaven til en deltaker</summary>
            <CommandForm
              path="/api/pilot/assignments"
              fixed={{ campaignId: campaign.id, testId: test.id }}
              submitLabel="Gi oppgaven"
            >
              <Field id="pilot-participant" label="Deltaker">
                <select id="pilot-participant" name="participantId" required>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.pseudonym}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="pilot-goal"
                label="Mål for deltakeren"
                help="Et kort mål, ikke en oppskrift. For eksempel «Finn en ting du vil låne»."
              >
                <input
                  id="pilot-goal"
                  name="goal"
                  required
                  maxLength={200}
                  aria-describedby="pilot-goal-hjelp"
                />
              </Field>
            </CommandForm>
          </details>
        )}
      </section>

      <section aria-labelledby="historikk">
        <h2 id="historikk">Historikk</h2>
        {runs.length === 0 && <p>Ingen resultater er registrert ennå.</p>}
        <ul className={styles.history}>
          {runs.map((run) => (
            <li key={run.id} className="card">
              <p>
                <Tag tone={pilotStatusTones[run.status]}>
                  {pilotStatusLabels[run.status]}
                </Tag>
              </p>
              <p className={styles.meta}>
                {formatShortTime(run.recordedAt)} · versjon {run.appVersion}
                {run.environment &&
                  ` · ${pilotEnvironmentLabels[run.environment]}`}
                {run.device && ` · ${pilotDeviceLabels[run.device]}`}
                {run.platform && ` · ${run.platform}`}
                {run.tester && ` · ${run.tester}`}
                {run.helped && " · trengte hjelp"}
                {campaign &&
                  run.campaignId !== campaign.id &&
                  " · tidligere kampanje"}
              </p>
              {run.note && <p className={styles.quote}>{run.note}</p>}
              {run.defect && (
                <p>
                  F-{run.defect.number} {run.defect.title} (
                  {pilotSeverityLabels[run.defect.severity]},{" "}
                  {pilotDefectStatusLabels[run.defect.status].toLowerCase()})
                </p>
              )}
              {run.earlierWording && (
                <details>
                  <summary>Testet med tidligere ordlyd</summary>
                  <dl className="facts">
                    <dt>Gjør</dt>
                    <dd>{run.earlierWording.action}</dd>
                    <dt>Forventet</dt>
                    <dd>{run.earlierWording.expected}</dd>
                  </dl>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

"use client";

import {
  type PilotDefectRefSummary,
  type PilotDevice,
  type PilotEnvironment,
  type PilotRunStatus,
  type PilotSeverity,
  pilotDeviceSchema,
  pilotEnvironmentSchema,
  pilotSeveritySchema,
  pilotStatusesNeedingNote,
} from "@lanbort/contracts";
import { type FormEvent, useId, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { useCommand } from "@/components/use-command";
import {
  deviceOf,
  pilotDeviceLabels,
  pilotEnvironmentLabels,
  pilotRunStatuses,
  pilotSeverityLabels,
  pilotStatusLabels,
  platformOf,
} from "@/presentation/pilot";
import styles from "../../pilot.module.css";

/**
 * One run of a test (pilot-ui.md «Ett testkort»): the result first, then
 * what goes with it. A failure names a defect, a new one or one already
 * reported; a block or «ikke relevant» says why. Time and app version are
 * the server's.
 */
export function RunForm({
  campaignId,
  testId,
  testers,
  openDefects,
}: {
  campaignId: string;
  testId: string;
  testers: readonly { id: string; pseudonym: string }[];
  openDefects: readonly PilotDefectRefSummary[];
}) {
  const id = useId();
  const [status, setStatus] = useState<PilotRunStatus>("passed");
  const [defect, setDefect] = useState<string>("new");
  const command = useCommand({
    path: "/api/pilot/runs",
    done: `Resultat for ${testId} lagret`,
  });

  const needsNote = pilotStatusesNeedingNote.has(status);
  const failed = status === "failed";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value === "" ? undefined : value;
    };
    const tester = text("testerId");

    const saved = await command.run({
      campaignId,
      testId,
      status,
      environment: text("environment") as PilotEnvironment,
      // This device unless another is named.
      device:
        (text("device") as PilotDevice | undefined) ??
        deviceOf(navigator.userAgent),
      platform: platformOf(navigator.userAgent),
      helped: form.get("helped") === "on",
      testerId: tester ?? null,
      ...(text("note") ? { note: text("note") } : {}),
      ...(failed && defect !== "new" ? { defectId: defect } : {}),
      ...(failed && defect === "new"
        ? {
            newDefect: {
              title: text("title") ?? "",
              severity: (text("severity") ?? "P2") as PilotSeverity,
              ...(text("link") ? { link: text("link") } : {}),
            },
          }
        : {}),
    });

    if (saved) {
      event.currentTarget?.reset();
      setStatus("passed");
      setDefect("new");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset className={styles.statuses}>
        <legend>Resultat</legend>
        <div className={styles.segments}>
          {pilotRunStatuses.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="status"
                value={value}
                checked={status === value}
                onChange={() => setStatus(value)}
              />
              <span>{pilotStatusLabels[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {failed && (
        <fieldset>
          <legend>Feilen</legend>
          {openDefects.length > 0 && (
            <Field id={`${id}-defect`} label="Hvilken feil">
              <select
                id={`${id}-defect`}
                value={defect}
                onChange={(event) => setDefect(event.target.value)}
              >
                <option value="new">En ny feil</option>
                {openDefects.map((each) => (
                  <option key={each.id} value={each.id}>
                    F-{each.number} {each.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {defect === "new" && (
            <>
              <Field id={`${id}-title`} label="Hva er feil, kort">
                <input
                  id={`${id}-title`}
                  name="title"
                  required
                  maxLength={120}
                />
              </Field>
              <Field id={`${id}-severity`} label="Hvor alvorlig">
                <select id={`${id}-severity`} name="severity" defaultValue="P2">
                  {pilotSeveritySchema.options.map((severity) => (
                    <option key={severity} value={severity}>
                      {pilotSeverityLabels[severity]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id={`${id}-link`}
                label="Lenke til privat beskrivelse (valgfritt)"
                help="Bare en privat lenke, aldri en offentlig sak."
              >
                <input
                  id={`${id}-link`}
                  name="link"
                  type="url"
                  pattern="https://.*"
                  maxLength={500}
                  {...describedBy(`${id}-link`, true)}
                />
              </Field>
            </>
          )}
        </fieldset>
      )}

      <Field
        id={`${id}-note`}
        label={needsNote ? "Hvorfor (må fylles ut)" : "Merknad (valgfritt)"}
      >
        <textarea
          id={`${id}-note`}
          name="note"
          rows={2}
          maxLength={1000}
          required={needsNote}
        />
      </Field>

      <details>
        <summary>Tester, enhet og miljø</summary>
        <Field id={`${id}-tester`} label="Hvem testet">
          <select id={`${id}-tester`} name="testerId" defaultValue="">
            <option value="">Pilotansvarlig</option>
            {testers.map((tester) => (
              <option key={tester.id} value={tester.id}>
                {tester.pseudonym}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-device`} label="Enhet">
          <select id={`${id}-device`} name="device" defaultValue="">
            <option value="">Denne enheten</option>
            {pilotDeviceSchema.options.map((value) => (
              <option key={value} value={value}>
                {pilotDeviceLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-environment`} label="Miljø">
          <select
            id={`${id}-environment`}
            name="environment"
            defaultValue="production"
          >
            {pilotEnvironmentSchema.options.map((value) => (
              <option key={value} value={value}>
                {pilotEnvironmentLabels[value]}
              </option>
            ))}
          </select>
        </Field>
      </details>
      <div className="checkbox">
        <input id={`${id}-helped`} type="checkbox" name="helped" />
        <label htmlFor={`${id}-helped`}>Testeren trengte hjelp</label>
      </div>

      <div className="actions">
        <BusyButton
          type="submit"
          className="button-primary"
          busy={command.pending}
        >
          Lagre resultat
        </BusyButton>
      </div>
      <ErrorText>{command.error}</ErrorText>
    </form>
  );
}

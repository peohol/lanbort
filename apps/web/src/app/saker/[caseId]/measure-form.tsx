"use client";

import type { ModerationMeasureKind } from "@lanbort/contracts";
import { type FormEvent, useId, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText, fieldErrorProps } from "@/components/error-text";
import { Field } from "@/components/field";
import { useCommand } from "@/components/use-command";
import { measureEffects, measureLabels } from "@/presentation/cases";
import styles from "../cases.module.css";

/**
 * PS-TRUST-013–016, PS-OBJ-017: a measure on what the report is about,
 * chosen as a card, with its reason. Only the measures that fit the report
 * are offered, and the button names the measure and where it applies
 * (UX-INT-003).
 */
export function MeasureForm({
  caseId,
  measures,
  environment,
}: {
  caseId: string;
  measures: readonly ModerationMeasureKind[];
  environment: string | null;
}) {
  const id = useId();
  const errorId = `${id}-feil`;
  const [measure, setMeasure] = useState<ModerationMeasureKind | null>(null);
  const [reason, setReason] = useState("");
  const [dimension, setDimension] = useState("");
  const command = useCommand({
    path: `/api/cases/${caseId}/measures`,
    done: "Tiltaket er gjennomført",
  });
  const where = environment ? ` i ${environment}` : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!measure) return;

    const done = await command.run({
      measure,
      reason,
      ...(measure === "review_score_removed" ? { dimension } : {}),
    });

    if (done) {
      setMeasure(null);
      setReason("");
    }
  }

  return (
    <section className={styles.section} aria-labelledby={`${id}-tiltak`}>
      <h2 id={`${id}-tiltak`}>{environment ? "Tiltak i miljøet" : "Tiltak"}</h2>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className={styles.options}>
          <legend className="visually-hidden">Velg tiltak</legend>
          {measures.map((each) => (
            <label key={each} className={styles.option}>
              <input
                type="radio"
                name={`${id}-tiltak`}
                value={each}
                checked={measure === each}
                onChange={() => setMeasure(each)}
              />
              <span>
                <strong>{measureLabels[each]}</strong>
                {measureEffects[each] && <small>{measureEffects[each]}</small>}
              </span>
            </label>
          ))}
        </fieldset>
        {measure === "review_score_removed" && (
          <Field id={`${id}-dimensjon`} label="Vurderingen som skal fjernes">
            <input
              id={`${id}-dimensjon`}
              value={dimension}
              onChange={(event) => setDimension(event.target.value)}
              required
            />
          </Field>
        )}
        {measure && (
          <>
            <Field
              id={`${id}-begrunnelse`}
              label="Begrunnelse"
              help="Lagres med tiltaket, sammen med hvem som gjorde det og når."
            >
              <textarea
                id={`${id}-begrunnelse`}
                rows={3}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                {...fieldErrorProps(
                  command.failure,
                  errorId,
                  `${id}-begrunnelse-hjelp`,
                )}
              />
            </Field>
            <div className="actions">
              <BusyButton
                type="submit"
                className="button-primary"
                busy={command.pending}
              >
                {measureLabels[measure]}
                {measure.startsWith("publication_") ? where : ""}
              </BusyButton>
            </div>
          </>
        )}
        <ErrorText id={errorId}>{command.error}</ErrorText>
      </form>
    </section>
  );
}

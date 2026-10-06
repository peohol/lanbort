"use client";

import type { LoanReview } from "@lanbort/contracts";
import { type FormEvent, useId } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { formValues } from "@/components/form-body";
import { useCommand } from "@/components/use-command";
import { loanApi } from "@/presentation/loan-status";
import { dimensionLabel, reviewScores } from "@/presentation/reviews";

const textHelp =
  "Kreves hvis du gir 1 eller 2 på noe. Ellers er det valgfritt. Beskriv det du opplevde.";

/**
 * A review of the other party (UX-JRN-010, PS-TRUST-001–002): one score
 * from 1 to 5 on each dimension the ending lets the caller assess, and one
 * short combined text, needed only when a score is 1 or 2. Sent again with
 * the version seen, it revises the caller's hidden review (PS-TRUST-004).
 */
export function ReviewForm({
  loanId,
  dimensions,
  own,
}: {
  loanId: string;
  dimensions: readonly string[];
  /** The caller's hidden review, when they revise it. */
  own: LoanReview | null;
}) {
  const id = useId();
  const submitLabel = own ? "Lagre endringene" : "Send anmeldelsen";
  const command = useCommand({
    path: `${loanApi(loanId)}/reviews`,
    done: own ? "Anmeldelsen er endret" : "Anmeldelsen er sendt",
    messages: {
      invalid_input:
        "Gi en vurdering på hvert punkt, og beskriv kort hva som skjedde hvis du gir 1 eller 2.",
    },
  });
  const given = new Map(
    own?.scores.map(({ dimension, score }) => [dimension, score]) ?? [],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new Map(
      formValues(event.currentTarget).map(({ name, value }) => [name, value]),
    );
    const text = String(values.get("text") ?? "").trim();

    void command.run({
      loanId,
      scores: dimensions.flatMap((dimension) => {
        const score = Number(values.get(`score.${dimension}`));

        return score ? [{ dimension, score }] : [];
      }),
      text: text || null,
      ...(own ? { expectedVersion: own.version } : {}),
    });
  }

  return (
    <form onSubmit={submit}>
      {dimensions.map((dimension) => (
        <fieldset key={dimension}>
          <legend>{dimensionLabel(dimension)}</legend>
          <div className="scale">
            {reviewScores.map((score) => (
              <label key={score}>
                <input
                  type="radio"
                  name={`score.${dimension}`}
                  value={score}
                  required
                  defaultChecked={given.get(dimension) === score}
                />
                {score}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="help">1 er svært dårlig, 5 er svært bra.</p>
      <Field id={`${id}-tekst`} label="Beskriv kort" help={textHelp}>
        <textarea
          id={`${id}-tekst`}
          name="text"
          maxLength={2000}
          defaultValue={own?.text ?? ""}
          {...describedBy(`${id}-tekst`, textHelp)}
        />
      </Field>
      <div className="actions">
        <BusyButton
          type="submit"
          className="button-primary"
          busy={command.pending}
        >
          {submitLabel}
        </BusyButton>
      </div>
      <ErrorText>{command.error}</ErrorText>
    </form>
  );
}

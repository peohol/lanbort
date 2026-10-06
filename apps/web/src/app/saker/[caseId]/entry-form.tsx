"use client";

import { caseEntryBodySchema } from "@lanbort/contracts";
import { type FormEvent, useId, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText, fieldErrorProps } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { useCommand } from "@/components/use-command";

/** Who a handler writes to: everyone, one participant, or the handlers. */
export interface AudienceChoice {
  readonly value: string;
  readonly label: string;
  readonly audience: "parties" | "party" | "handlers";
  readonly toUserId?: string;
}

/** An earlier entry of the writer's own that a new one may correct. */
export interface CorrectableEntry {
  readonly id: string;
  readonly label: string;
}

/**
 * Writes in a case (PS-COM-013–014): a participant writes to the case; a
 * handler also says who sees it. A correction is a new entry that names
 * the writer's own earlier one, which stays as it was.
 */
export function EntryForm({
  caseId,
  audiences,
  correctable,
  help,
}: {
  caseId: string;
  /** Empty for a participant, who writes to the case as a whole. */
  audiences: readonly AudienceChoice[];
  correctable: readonly CorrectableEntry[];
  help: string;
}) {
  const id = useId();
  const errorId = `${id}-feil`;
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(audiences[0]?.value ?? "");
  const [corrects, setCorrects] = useState("");
  const command = useCommand({
    path: `/api/cases/${caseId}/entries`,
    done: "Innlegget er sendt",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = audiences.find((choice) => choice.value === audience);
    const sent = await command.run({
      body,
      ...(chosen
        ? {
            audience: chosen.audience,
            ...(chosen.toUserId ? { toUserId: chosen.toUserId } : {}),
          }
        : {}),
      ...(corrects ? { correctsEntryId: corrects } : {}),
    });

    if (sent) {
      setBody("");
      setCorrects("");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <Field id={`${id}-tekst`} label="Nytt innlegg" help={help}>
        <textarea
          id={`${id}-tekst`}
          name="body"
          rows={5}
          required
          maxLength={caseEntryBodySchema.maxLength ?? undefined}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          {...fieldErrorProps(command.failure, errorId, `${id}-tekst-hjelp`)}
        />
      </Field>
      {audiences.length > 0 && (
        <Field id={`${id}-til`} label="Hvem skal se innlegget">
          <select
            id={`${id}-til`}
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
          >
            {audiences.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {correctable.length > 0 && (
        <Field
          id={`${id}-retter`}
          label="Retter et tidligere innlegg"
          help="Velg bare hvis dette retter noe du skrev før. Det du skrev før, blir stående."
        >
          <select
            id={`${id}-retter`}
            value={corrects}
            onChange={(event) => setCorrects(event.target.value)}
            {...describedBy(`${id}-retter`, true)}
          >
            <option value="">Nei, et nytt innlegg</option>
            {correctable.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="actions">
        <BusyButton type="submit" busy={command.pending}>
          Send innlegget
        </BusyButton>
      </div>
      <ErrorText id={errorId}>{command.error}</ErrorText>
    </form>
  );
}

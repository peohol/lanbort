"use client";

import { caseEntryBodySchema } from "@lanbort/contracts";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText, fieldErrorProps } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { Icon, type IconName } from "@/components/icon";
import { useCommand } from "@/components/use-command";
import styles from "../cases.module.css";

/** Who a handler writes to: everyone, one participant, or the handlers. */
export interface AudienceChoice {
  readonly value: string;
  readonly label: string;
  readonly icon: IconName;
  readonly audience: "parties" | "party" | "handlers";
  readonly toUserId?: string;
  /** Under the text field when this one is chosen. */
  readonly help: string;
}

/** An earlier entry of the writer's own that a new one may correct. */
export interface CorrectableEntry {
  readonly id: string;
  readonly label: string;
}

/**
 * Writes in a case (PS-COM-013–014): a participant writes to the case; a
 * handler first says who sees it, in a row of pills, and the button says
 * what happens («Lagre notatet»). A correction is a new entry that names the
 * writer's own earlier one, which stays as it was.
 */
export function EntryForm({
  caseId,
  heading,
  label,
  submitLabel,
  audiences,
  correctable,
  help,
  evidenceHref,
}: {
  caseId: string;
  heading: string;
  /** The text field's label. */
  label: string;
  submitLabel: string;
  /** Empty for a participant, who writes to the case as a whole. */
  audiences: readonly AudienceChoice[];
  correctable: readonly CorrectableEntry[];
  /** For a participant; a handler's help follows the audience. */
  help?: string;
  /** Where a participant chooses private messages to submit (WP-46). */
  evidenceHref?: string | null;
}) {
  const id = useId();
  const errorId = `${id}-feil`;
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(audiences[0]?.value ?? "");
  const [corrects, setCorrects] = useState("");
  const chosen = audiences.find((choice) => choice.value === audience);
  const note = chosen?.audience === "handlers";
  const command = useCommand({
    path: `/api/cases/${caseId}/entries`,
    done: note ? "Notatet er lagret" : "Innlegget er sendt",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
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
    <section className={styles.section} aria-labelledby={`${id}-skriv`}>
      <h2 id={`${id}-skriv`}>{heading}</h2>
      <form onSubmit={(event) => void submit(event)}>
        {audiences.length > 0 && (
          <fieldset className={styles.audiences}>
            <legend className="visually-hidden">Hvem skal se innlegget</legend>
            {audiences.map((choice) => (
              <label key={choice.value}>
                <input
                  type="radio"
                  name={`${id}-til`}
                  value={choice.value}
                  checked={audience === choice.value}
                  onChange={() => setAudience(choice.value)}
                />
                <Icon name={choice.icon} />
                {choice.label}
              </label>
            ))}
          </fieldset>
        )}
        <Field
          id={`${id}-tekst`}
          label={note ? "Internt notat" : label}
          help={chosen?.help ?? help}
        >
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
        {evidenceHref && (
          <p className="link-row">
            <Link href={evidenceHref}>
              Legg ved meldinger fra en privat samtale
            </Link>
          </p>
        )}
        <div className="actions">
          <BusyButton
            type="submit"
            className="button-primary"
            busy={command.pending}
          >
            {note ? "Lagre notatet" : submitLabel}
          </BusyButton>
        </div>
        <ErrorText id={errorId}>{command.error}</ErrorText>
      </form>
    </section>
  );
}

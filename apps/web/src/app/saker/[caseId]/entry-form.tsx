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

/**
 * An earlier entry of the writer's own that a new one may correct. A
 * handler's correction goes to the same audience as the entry it corrects.
 */
export interface CorrectableEntry {
  readonly id: string;
  readonly label: string;
  readonly audience?: AudienceChoice["audience"];
  readonly toUserId?: string | null;
}

interface EntryFormProps {
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
  correctOnly?: boolean;
}

/**
 * Writes in a case (PS-COM-013–014): a participant writes to the case; a
 * handler first says who sees it, in a row of pills, and the button says
 * what happens («Lagre notatet»). A correction is a new entry that names the
 * writer's own earlier one, which stays as it was, and reaches the same
 * people. With `correctOnly` it is the one thing to write: a handler
 * correcting their own entry once the case is closed. Once an entry is
 * sent, the form starts afresh for the next.
 */
export function EntryForm(props: EntryFormProps) {
  const [round, setRound] = useState(0);

  return (
    <EntryFormRound
      key={round}
      {...props}
      onSent={() => setRound((count) => count + 1)}
    />
  );
}

function EntryFormRound({
  caseId,
  heading,
  label,
  submitLabel,
  audiences,
  correctable,
  help,
  evidenceHref,
  correctOnly = false,
  onSent,
}: EntryFormProps & { onSent: () => void }) {
  const id = useId();
  const errorId = `${id}-feil`;
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(audiences[0]?.value ?? "");
  const [corrects, setCorrects] = useState(
    correctOnly ? (correctable[0]?.id ?? "") : "",
  );
  const corrected = correctable.find((entry) => entry.id === corrects);
  const chosen = audiences.find((choice) => choice.value === audience);
  const to = corrected?.audience
    ? { audience: corrected.audience, toUserId: corrected.toUserId ?? null }
    : chosen && { audience: chosen.audience, toUserId: chosen.toUserId };
  const note = to?.audience === "handlers";
  const command = useCommand({
    path: `/api/cases/${caseId}/entries`,
    done: note ? "Notatet er lagret" : "Innlegget er sendt",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const sent = await command.run({
      body,
      ...(to
        ? {
            audience: to.audience,
            ...(to.toUserId ? { toUserId: to.toUserId } : {}),
          }
        : {}),
      ...(corrects ? { correctsEntryId: corrects } : {}),
    });

    if (sent) onSent();
  }

  return (
    <section className={styles.section} aria-labelledby={`${id}-skriv`}>
      <h2 id={`${id}-skriv`}>{heading}</h2>
      <form onSubmit={(event) => void submit(event)}>
        {audiences.length > 0 && !corrected && (
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
          help={
            corrected
              ? "Rettelsen går til de samme som så innlegget du retter."
              : (chosen?.help ?? help)
          }
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
            label={
              correctOnly
                ? "Innlegget du retter"
                : "Retter et tidligere innlegg"
            }
            help={
              correctOnly
                ? "Saken er lukket, men du kan rette en faktisk feil i det du skrev. Det du skrev før, blir stående."
                : "Velg bare hvis dette retter noe du skrev før. Det du skrev før, blir stående."
            }
          >
            <select
              id={`${id}-retter`}
              value={corrects}
              required={correctOnly}
              onChange={(event) => setCorrects(event.target.value)}
              {...describedBy(`${id}-retter`, true)}
            >
              {!correctOnly && <option value="">Nei, et nytt innlegg</option>}
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
            {corrected
              ? "Send rettelsen"
              : note
                ? "Lagre notatet"
                : submitLabel}
          </BusyButton>
        </div>
        <ErrorText id={errorId}>{command.error}</ErrorText>
      </form>
    </section>
  );
}

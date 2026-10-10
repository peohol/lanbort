"use client";

import { caseEntryBodySchema } from "@lanbort/contracts";
import { useId, useRef, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import {
  type Consequences,
  ConsequenceList,
} from "@/components/confirm-action";
import { ErrorText, fieldErrorProps } from "@/components/error-text";
import { Field } from "@/components/field";
import { useCommand } from "@/components/use-command";

/**
 * Closing a report or a mediation (PS-COM-020): the sheet says what closing
 * means, as `ConfirmAction` does, and takes the closing message to the
 * parties, which becomes the case's last entry.
 */
export function CloseWithMessage({
  caseId,
  consequences,
  primary,
}: {
  caseId: string;
  consequences: Consequences;
  primary: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const errorId = `${id}-feil`;
  const [body, setBody] = useState("");
  const command = useCommand({
    path: `/api/cases/${caseId}/close`,
    done: "Saken er lukket",
    after: "refresh",
  });

  async function close() {
    if (await command.run({ body })) dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className={primary ? "button-primary" : undefined}
        onClick={() => dialog.current?.showModal()}
      >
        Lukk saken
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={`${id}-tittel`}>
        <h2 id={`${id}-tittel`}>Lukke saken?</h2>
        <ConsequenceList consequences={consequences} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void close();
          }}
        >
          <Field
            id={`${id}-melding`}
            label="Avslutningsmelding til partene"
            help="Blir sakens siste innlegg. Skriv ikke vurderinger, tiltak mot andre eller hvem som sa hva. Du kan si nøytralt om partene ble enige."
          >
            <textarea
              id={`${id}-melding`}
              rows={4}
              required
              maxLength={caseEntryBodySchema.maxLength ?? undefined}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              {...fieldErrorProps(
                command.failure,
                errorId,
                `${id}-melding-hjelp`,
              )}
            />
          </Field>
          <div className="dialog-actions">
            <button type="button" onClick={() => dialog.current?.close()}>
              Avbryt
            </button>
            <BusyButton
              type="submit"
              className="button-primary"
              busy={command.pending}
            >
              Lukk saken
            </BusyButton>
          </div>
          <ErrorText id={errorId}>{command.error}</ErrorText>
        </form>
      </dialog>
    </>
  );
}

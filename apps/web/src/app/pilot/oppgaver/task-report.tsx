"use client";

import { type PilotOutcome, pilotOutcomeSchema } from "@lanbort/contracts";
import { useId, useRef } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { Field } from "@/components/field";
import { useCommand } from "@/components/use-command";
import { pilotOutcomeLabels } from "@/presentation/pilot";

/**
 * How it went, in one tap (pilot-ui.md «Mine pilotoppgaver»), with an
 * optional short comment. What the participant tells is their own
 * observation, never the official result.
 */
export function TaskReport({ assignmentId }: { assignmentId: string }) {
  const id = useId();
  const comment = useRef<HTMLTextAreaElement>(null);
  const command = useCommand<unknown>({
    path: `/api/pilot/tasks/${assignmentId}/report`,
    done: "Takk, tilbakemeldingen er sendt",
  });

  async function report(outcome: PilotOutcome) {
    const text = comment.current?.value.trim() ?? "";

    if (await command.run({ outcome, ...(text ? { comment: text } : {}) })) {
      if (comment.current) comment.current.value = "";
    }
  }

  return (
    <>
      <Field id={`${id}-comment`} label="Kommentar (valgfritt)">
        <textarea id={`${id}-comment`} ref={comment} rows={2} maxLength={500} />
      </Field>
      <div className="actions">
        {pilotOutcomeSchema.options.map((outcome) => (
          <BusyButton
            key={outcome}
            type="button"
            className={outcome === "managed" ? "button-primary" : undefined}
            busy={command.pending}
            onClick={() => void report(outcome)}
          >
            {pilotOutcomeLabels[outcome]}
          </BusyButton>
        ))}
      </div>
      <ErrorText>{command.error}</ErrorText>
    </>
  );
}

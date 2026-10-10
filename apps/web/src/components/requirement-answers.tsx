"use client";

import type { Requirement } from "@lanbort/contracts";
import { type ReactNode, useState } from "react";
import { CommandForm } from "./command-form";
import { Field } from "./field";

/** An answer already given: text, or null for an accepted requirement. */
interface GivenAnswer {
  readonly requirementId: string;
  readonly answer: string | null;
}

/**
 * The environment's requirements as one form that sends a membership
 * command (PS-ENV-005): a text answer to each question and an explicit
 * acceptance of each rule, every one of them required, so the server is
 * only asked once all are met. Answers already given are filled in. With no
 * requirements, it is just the button. A `note` says, just above it, who
 * sees what is sent.
 *
 * The answers are given to the membership process, not to a profile
 * (UX-PRIV-009), and the help says so.
 */
export function RequirementAnswers({
  environmentId,
  requirements,
  given = [],
  path,
  submitLabel,
  next,
  note,
  secondary = false,
}: {
  environmentId: string;
  requirements: readonly Requirement[];
  given?: readonly GivenAnswer[];
  path: string;
  submitLabel: string;
  /** Where the user lands once it is sent; the page is read again otherwise. */
  next?: string;
  note?: ReactNode;
  secondary?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      given.map(({ requirementId, answer }) => [requirementId, answer ?? true]),
    ),
  );
  const set = (id: string, value: string | boolean) =>
    setAnswers((current) => ({ ...current, [id]: value }));

  return (
    <CommandForm
      path={path}
      submitLabel={submitLabel}
      {...(next ? { next } : {})}
      secondary={secondary}
      fixed={{
        environmentId,
        answers: requirements.map(({ id, kind }) =>
          kind === "information"
            ? { requirementId: id, answer: String(answers[id] ?? "") }
            : { requirementId: id, accepted: answers[id] === true },
        ),
      }}
    >
      {requirements.length > 0 && (
        <p className="help">
          Svarene går bare til miljøets administratorer, som bruker dem til å
          behandle medlemskapet. De vises ikke på profilen din.
        </p>
      )}
      {requirements.map(({ id, kind, text }) => {
        const fieldId = `krav-${id}`;

        return kind === "information" ? (
          <Field key={id} id={fieldId} label={text}>
            <textarea
              id={fieldId}
              required
              maxLength={1000}
              rows={2}
              value={String(answers[id] ?? "")}
              onChange={(event) => set(id, event.target.value)}
            />
          </Field>
        ) : (
          <div key={id} className="checkbox">
            <input
              id={fieldId}
              type="checkbox"
              required
              checked={answers[id] === true}
              onChange={(event) => set(id, event.target.checked)}
            />
            <label htmlFor={fieldId}>{text}</label>
          </div>
        );
      })}
      {note && <p className="help">{note}</p>}
    </CommandForm>
  );
}

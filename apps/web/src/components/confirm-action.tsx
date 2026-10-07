"use client";

import { useId, useRef } from "react";
import { BusyButton } from "./busy-button";
import type { ErrorMessages } from "./error-messages";
import { ErrorText } from "./error-text";
import { fillHref } from "./form-body";
import { useCommand } from "./use-command";

/** What a consequence view lists (UX-INT-007); empty lists are left out. */
export interface Consequences {
  /** What disappears or ends. */
  readonly gone?: readonly string[];
  /** What stays as it is. */
  readonly stays?: readonly string[];
  /** Who else it affects, and how. */
  readonly affects?: readonly string[];
}

const groups = [
  { key: "gone", heading: "Dette forsvinner" },
  { key: "stays", heading: "Dette består" },
  { key: "affects", heading: "Dette berører andre" },
] as const;

/** What disappears, what stays and who is affected, in that order. */
export function ConsequenceList({
  consequences,
}: {
  consequences: Consequences;
}) {
  return (
    <div className="consequences">
      {groups.map(({ key, heading }) =>
        consequences[key]?.length ? (
          <section key={key}>
            <h3>{heading}</h3>
            <ul>
              {consequences[key].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

/**
 * A command whose consequence is significant, affects others or cannot
 * simply be undone (UX-INT-002, UX-INT-007): the button opens a modal
 * dialog that shows what disappears, what stays and who is affected, and a
 * confirm button that names what happens (UX-INT-003). The native dialog
 * keeps focus inside, closes on Escape and returns focus to the button.
 */
export function ConfirmAction({
  label,
  title,
  consequences,
  confirmLabel,
  path,
  body,
  danger = false,
  idempotent = true,
  messages,
  next,
}: {
  /** The button that opens the dialog. */
  label: string;
  title: string;
  consequences: Consequences;
  /** Names the consequence, e.g. «Slett Stige for alle eiere». */
  confirmLabel: string;
  path: string;
  body: object;
  danger?: boolean;
  idempotent?: boolean;
  /** What a failure means here, where the general words are not enough. */
  messages?: ErrorMessages;
  /** The page to go to once done, filled from the answer (`CommandForm`). */
  next?: string | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const command = useCommand({
    path,
    done: confirmLabel,
    idempotent,
    messages: messages ?? {},
    after: next ? (data) => fillHref(next, data) : "refresh",
  });

  async function confirm() {
    if (await command.run(body)) dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className={danger ? "button-danger" : undefined}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <ConsequenceList consequences={consequences} />
        <div className="dialog-actions">
          <button type="button" onClick={() => dialog.current?.close()}>
            Avbryt
          </button>
          <BusyButton
            type="button"
            className={danger ? "button-danger" : "button-primary"}
            busy={command.pending}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </BusyButton>
        </div>
        <ErrorText>{command.error}</ErrorText>
      </dialog>
    </>
  );
}

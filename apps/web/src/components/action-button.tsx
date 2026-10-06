"use client";

import { BusyButton } from "./busy-button";
import { ErrorText } from "./error-text";
import { useCommand } from "./use-command";

/**
 * One API command behind a button, for answers made where the thing is
 * shown (UX-P05). `primary` marks the step the page leads to (UX-INT-001).
 */
export function ActionButton({
  label,
  path,
  body,
  idempotent = true,
  primary = false,
  next,
}: {
  label: string;
  path: string;
  body: object;
  idempotent?: boolean;
  primary?: boolean;
  /** Where to go once done, instead of reading the page again. */
  next?: string;
}) {
  const command = useCommand({
    path,
    done: label,
    idempotent,
    after: next ? () => next : "refresh",
  });

  return (
    <>
      <BusyButton
        type="button"
        className={primary ? "button-primary" : undefined}
        onClick={() => void command.run(body)}
        busy={command.pending}
      >
        {label}
      </BusyButton>
      <ErrorText>{command.error}</ErrorText>
    </>
  );
}

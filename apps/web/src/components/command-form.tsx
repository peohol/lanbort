"use client";

import type { FormEvent, ReactNode } from "react";
import { BusyButton } from "./busy-button";
import { ErrorText } from "./error-text";
import { fillHref, formBody, formValues } from "./form-body";
import { useCommand } from "./use-command";

/**
 * A form that sends one command (WP-80). The fields are plain controls with
 * names (see `formBody`); `fixed` adds what the page decided. On success the
 * page is read again, or the user goes to `next`, a page filled from the
 * answer (`/lan/foresporsel/{requestId}`). On failure the form keeps what
 * the user filled in (UX-A11Y-009) and says why next to the button.
 *
 * The submit label names what happens (UX-INT-003). `errorId` lets fields
 * point to the error with `fieldErrorProps`.
 */
export function CommandForm({
  path,
  fixed,
  submitLabel,
  done = submitLabel,
  next,
  idempotent = true,
  errorId,
  secondary = false,
  children,
}: {
  path: string;
  fixed?: Record<string, unknown>;
  submitLabel: string;
  /** What is announced when it is done; the submit label by default. */
  done?: string;
  next?: string;
  idempotent?: boolean;
  errorId?: string;
  /** For a form that is not the page's main step. */
  secondary?: boolean;
  children?: ReactNode;
}) {
  const command = useCommand({
    path,
    done,
    idempotent,
    after: next ? (data) => fillHref(next, data) : "refresh",
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void command.run(formBody(formValues(event.currentTarget), fixed));
  }

  return (
    <form onSubmit={submit}>
      {children}
      <div className="actions">
        <BusyButton
          type="submit"
          busy={command.pending}
          className={secondary ? "button-secondary" : undefined}
        >
          {submitLabel}
        </BusyButton>
      </div>
      <ErrorText {...(errorId ? { id: errorId } : {})}>
        {command.error}
      </ErrorText>
    </form>
  );
}

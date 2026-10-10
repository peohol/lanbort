"use client";

import type { FormEvent, ReactNode } from "react";
import { BusyButton } from "./busy-button";
import type { ErrorMessages } from "./error-messages";
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
  replace = false,
  idempotent = true,
  errorId,
  secondary = false,
  messages,
  children,
}: {
  path: string;
  fixed?: Record<string, unknown>;
  submitLabel: string;
  /** What is announced when it is done; the submit label by default. */
  done?: string;
  next?: string;
  /** The form is done with once sent: `next` takes its place (`useCommand`). */
  replace?: boolean;
  idempotent?: boolean;
  errorId?: string;
  /** For a form that is not the page's main step. */
  secondary?: boolean;
  /** What a failure means here, where the general words are not enough. */
  messages?: ErrorMessages;
  children?: ReactNode;
}) {
  const command = useCommand({
    path,
    done,
    idempotent,
    ...(messages ? { messages } : {}),
    after: next ? (data) => fillHref(next, data) : "refresh",
    replace,
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

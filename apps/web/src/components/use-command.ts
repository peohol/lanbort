"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { announce } from "./announcer";
import { type ApiFailureCode, postJson } from "./api-client";
import { announceDataChanged } from "./data-changed";
import { type ErrorMessages, errorMessage } from "./error-messages";

/** Where the user goes after the command: the page read again, or another. */
export type AfterCommand<T> = "refresh" | ((data: T) => string);

export interface CommandOptions<T> {
  /** The API path of the command. */
  readonly path: string;
  /** What is said to assistive technology once it is done (UX-A11Y-004). */
  readonly done: string;
  /** Commands that take an idempotency key get one per control. */
  readonly idempotent?: boolean;
  readonly after?: AfterCommand<T>;
  /** What a failure means here, where the general words are not enough. */
  readonly messages?: ErrorMessages;
}

/**
 * One command from a button, a form or a dialog. One idempotency key per
 * control, so a retry after a network error cannot act twice (UX-INT-006).
 * On success the page is read again, or the user led on, so it shows the
 * authoritative state (UX-INT-005). A conflict reads the page again too:
 * what the user acted on has changed, and the page shows what holds now.
 */
export function useCommand<T = unknown>({
  path,
  done,
  idempotent = true,
  after = "refresh",
  messages,
}: CommandOptions<T>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailureCode | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function run(body: object): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setFailure(null);
    const result = await postJson<T>(
      path,
      body,
      idempotent ? { idempotencyKey } : {},
    );
    setPending(false);

    if (!result.ok) {
      setFailure(result.code);
      if (result.code === "conflict") router.refresh();
      return false;
    }

    announce(`Ferdig: ${done}`);
    announceDataChanged();
    if (after === "refresh") {
      router.refresh();
    } else {
      router.push(after(result.data));
    }

    return true;
  }

  return {
    run,
    pending,
    failure,
    error: failure && errorMessage(failure, messages),
  };
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { announce } from "./announcer";
import { postJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { announceDataChanged } from "./data-changed";
import { errorMessage } from "./error-messages";
import { ErrorText } from "./error-text";

/**
 * One API command behind a button, for answers made where the thing is
 * shown (UX-P05). Commands that require it get one idempotency key per
 * button, so a retry after a network error cannot act twice. On success the
 * page is read again, so it shows the new state from the server, and the
 * answer is announced (UX-A11Y-004).
 */
export function ActionButton({
  label,
  path,
  body,
  idempotent = true,
}: {
  label: string;
  path: string;
  body: object;
  idempotent?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function act() {
    setPending(true);
    setError(null);
    const result = await postJson(
      path,
      body,
      idempotent ? { idempotencyKey } : {},
    );
    setPending(false);

    if (!result.ok) {
      setError(errorMessage(result.code));
      return;
    }

    announce(`Ferdig: ${label}`);
    announceDataChanged();
    router.refresh();
  }

  return (
    <>
      <BusyButton type="button" onClick={() => void act()} busy={pending}>
        {label}
      </BusyButton>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

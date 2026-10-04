"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { chatConversationHref } from "@/navigation/chat";
import { chatApi } from "./api";
import { chatErrorMessage } from "./messages";

/**
 * Opens a loan logistics channel's conversation (WP-44), starting it if
 * neither party has. One idempotency key per button, so trying again after
 * a lost answer starts nothing twice.
 */
export function StartLoanLogistics({ channelId }: { channelId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { conversationId } = await chatApi.startLoanLogistics(
        channelId,
        idempotencyKey,
      );
      router.push(chatConversationHref(conversationId));
    } catch (problem) {
      setBusy(false);
      setError(chatErrorMessage(problem));
    }
  }

  return (
    <>
      <BusyButton type="button" busy={busy} onClick={() => void start()}>
        Skriv om lånet
      </BusyButton>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

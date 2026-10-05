"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { type ApiFailureCode, postJson } from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { ErrorText, fieldErrorProps } from "@/components/error-text";
import { ChatApiError } from "./api";
import { useChat } from "./chat-provider";
import { createChat } from "./engine";
import { chatErrorMessage } from "./messages";

/**
 * Reset (ADR-0010 §8): a new account key on this device, every other device
 * shut out and old history unreadable on new devices. The server asks for
 * the identity to be proven again just before, so the user confirms with a
 * new code from their e-mail, and the account is told by e-mail afterwards.
 */
export function ChatReset() {
  const { userId, started } = useChat();
  const [step, setStep] = useState<"start" | "code">("start");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailureCode | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const result = await postJson("/api/auth/reauthenticate", {});
    setBusy(false);
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setStep("code");
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const proven = await postJson("/api/auth/reauthenticate/verify", { code });
    if (!proven.ok) {
      setBusy(false);
      setError(proven.code);
      return;
    }
    try {
      started(await createChat(userId, true));
    } catch (problem) {
      setBusy(false);
      setError(
        problem instanceof ChatApiError ? problem.code : "internal_error",
      );
    }
  }

  return (
    <>
      <p>
        Du kan tilbakestille chatten. Da får denne enheten nye nøkler, alle
        andre enheter stenges ute fra chatten, og meldinger du har fått før kan
        ikke leses på nye enheter. De du skriver med, får beskjed om at
        sikkerhetskoden din er endret. Du får en e-post om tilbakestillingen.
      </p>
      {step === "start" ? (
        <>
          <BusyButton type="button" busy={busy} onClick={() => void sendCode()}>
            Tilbakestill chatten
          </BusyButton>
          <ErrorText>{error && chatErrorMessage(error)}</ErrorText>
        </>
      ) : (
        <form onSubmit={(event) => void confirm(event)} aria-busy={busy}>
          <p role="status">
            Vi har sendt en kode til e-postadressen din. Skriv den inn for å
            tilbakestille chatten.
          </p>
          <label htmlFor="chat-reset-code">Kode fra e-posten</label>
          <input
            id="chat-reset-code"
            name="code"
            ref={codeInput}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            required
            {...fieldErrorProps(error, "chat-reset-error")}
            value={code}
            onChange={(event) => setCode(event.target.value.trim())}
          />
          <BusyButton type="submit" busy={busy}>
            Tilbakestill chatten nå
          </BusyButton>
          <div className="secondary-actions">
            <BusyButton
              type="button"
              busy={busy}
              onClick={() => {
                setStep("start");
                setCode("");
                setError(null);
              }}
            >
              Avbryt
            </BusyButton>
          </div>
          <ErrorText id="chat-reset-error">
            {error && chatErrorMessage(error)}
          </ErrorText>
        </form>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type ApiFailureCode, postJson } from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { ErrorText, fieldErrorProps } from "@/components/error-text";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import {
  chatDevicesHref,
  chatHref,
  chatLinkHref,
  chatRestoreHref,
} from "@/navigation/chat";
import { ChatApiError } from "./api";
import styles from "./chat.module.css";
import { useChat } from "./chat-provider";
import { Setup } from "./chat-setup";
import { createChat } from "./engine";
import { chatErrorMessage } from "./messages";
import { Points } from "./points";

/**
 * Tilbakestill privat chat (17–18, ADR-0010 §8): a new account key on this
 * device, every other device shut out and old history unreadable on new
 * devices. The server asks for the identity to be proven again just
 * before, so the user confirms with a new code from their e-mail, and the
 * account is told by e-mail afterwards.
 */
export function ChatReset() {
  const { state, userId, started } = useChat();
  const router = useRouter();
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
      started(await createChat(userId, true), "reset");
      router.push(chatHref);
    } catch (problem) {
      setBusy(false);
      setError(
        problem instanceof ChatApiError ? problem.code : "internal_error",
      );
    }
  }

  const resettable =
    state.status === "ready" ||
    state.status === "link" ||
    state.status === "lost";
  // A bounded task, from Mine enheter or from Samtaler (UX-IA-013).
  const header = (title: string) => (
    <PageHeader
      title={title}
      back={
        state.status === "ready"
          ? { href: chatDevicesHref, label: "Mine enheter" }
          : { href: chatHref, label: "Samtaler" }
      }
      home="conversations"
      task
    />
  );

  if (!resettable) {
    return (
      <>
        {header("Tilbakestill privat chat")}
        <Setup />
      </>
    );
  }

  if (step === "code") {
    return (
      <>
        {header("Bekreft at det er deg")}
        <form
          onSubmit={(event) => void confirm(event)}
          aria-busy={busy}
          className={styles.stack}
        >
          <p role="status" className="quiet">
            Vi har sendt en kode til e-postadressen din.
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
          <ErrorText id="chat-reset-error">
            {error && chatErrorMessage(error)}
          </ErrorText>
          <BusyButton
            type="submit"
            className="button-danger button-confirm"
            busy={busy}
          >
            <Icon name="trash" />
            Tilbakestill privat chat
          </BusyButton>
          <div>
            <BusyButton
              type="button"
              className="button-quiet"
              busy={busy}
              onClick={() => void sendCode()}
            >
              Send ny kode
            </BusyButton>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      {header("Tilbakestill privat chat")}
      <div className={styles.stack}>
        <p className="quiet">
          Gjør dette bare hvis du ikke har noen enhet med privat chat igjen og
          ikke har gjenopprettingsnøkkelen.
        </p>
        <section className="card" aria-label="Hva som skjer">
          <Points
            points={[
              {
                icon: "device",
                text: "Privat chat starter på nytt på denne enheten.",
              },
              { icon: "lock", text: "Alle andre enheter stenges ute." },
              {
                icon: "conversations",
                text: "Meldinger fra før kan ikke leses her eller på nye enheter.",
              },
              {
                icon: "shield",
                text: "De du skriver med, får beskjed om at sikkerhetskoden din er endret.",
              },
            ]}
          />
          <p className="quiet">
            Du bekrefter med en kode vi sender til e-postadressen din, og du får
            en e-post om tilbakestillingen.
          </p>
        </section>
        <BusyButton
          type="button"
          className="button-danger"
          busy={busy}
          onClick={() => void sendCode()}
        >
          <Icon name="trash" />
          Tilbakestill privat chat
        </BusyButton>
        <ErrorText>{error && chatErrorMessage(error)}</ErrorText>
        {state.status === "link" && state.recovery && (
          <Link href={chatRestoreHref} className={styles.centered}>
            Jeg har gjenopprettingsnøkkelen
          </Link>
        )}
        {state.status === "link" && (
          // A full page load: the link page has its own security headers.
          <a href={chatLinkHref} className={styles.centered}>
            Jeg har en annen enhet. Koble til i stedet
          </a>
        )}
      </div>
    </>
  );
}

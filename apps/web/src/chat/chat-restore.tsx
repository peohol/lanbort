"use client";

import { RECOVERY_KEY_LENGTH } from "@lanbort/e2ee";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText, fieldErrorProps } from "@/components/error-text";
import { PageHeader } from "@/components/page-header";
import { chatHref, chatResetHref } from "@/navigation/chat";
import styles from "./chat.module.css";
import { useChat } from "./chat-provider";
import { Setup } from "./chat-setup";
import { restoreChat } from "./engine";
import { chatErrorMessage } from "./messages";
import { Notice } from "./notice";
import { Points } from "./points";

const header = (
  <PageHeader
    title="Hent tilbake privat chat"
    back={{ href: chatHref, label: "Samtaler" }}
    home="conversations"
    task
  />
);

/**
 * Hent tilbake privat chat (R3, ADR-0010 §8): every device is lost, but the
 * user has the recovery key. Chat comes back on this device under the same
 * account key, with the history that was backed up; every other device is
 * shut out, and the contacts see no change.
 */
export function ChatRestore() {
  const { state, userId, started } = useChat();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setWrong(false);
    setError(null);
    try {
      const engine = await restoreChat(userId, typed);
      if (engine === "wrong_key") {
        setWrong(true);
        setBusy(false);
        return;
      }
      setTyped("");
      started(engine, "restored");
      router.push(chatHref);
    } catch (problem) {
      setBusy(false);
      setError(chatErrorMessage(problem));
    }
  }

  if (state.status !== "link") {
    return (
      <>
        {header}
        {state.status === "ready" ? (
          <Notice tag="På" tone="positive" role="status">
            <p>Privat chat er allerede på denne enheten.</p>
          </Notice>
        ) : (
          <Setup />
        )}
      </>
    );
  }

  if (!state.recovery) {
    return (
      <>
        {header}
        <Notice tag="Ingen nøkkel" role="status">
          <p>Kontoen din har ingen gjenopprettingsnøkkel.</p>
          <Link href={chatResetHref}>Tilbakestill privat chat</Link>
        </Notice>
      </>
    );
  }

  return (
    <>
      {header}
      <form
        className={styles.stack}
        onSubmit={(event) => void restore(event)}
        aria-busy={busy}
      >
        <p className="quiet">
          Skriv inn gjenopprettingsnøkkelen. Da kommer privat chat og de
          sikkerhetskopierte meldingene tilbake på denne enheten.
        </p>
        <label htmlFor="recovery-key">Gjenopprettingsnøkkel</label>
        <textarea
          id="recovery-key"
          name="recoveryKey"
          className={styles.recoveryInput}
          rows={3}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          {...fieldErrorProps(
            wrong ? "invalid_input" : null,
            "recovery-key-error",
            "recovery-key-help",
          )}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        <p id="recovery-key-help" className="help quiet">
          {RECOVERY_KEY_LENGTH} tegn. Mellomrom og små bokstaver spiller ingen
          rolle.
        </p>
        <div id="recovery-key-error">
          {wrong && (
            <Notice tag="Stemmer ikke" tone="warning" role="alert">
              <p>
                Nøkkelen stemmer ikke. Sjekk at alle {RECOVERY_KEY_LENGTH}{" "}
                tegnene er riktige.
              </p>
            </Notice>
          )}
        </div>
        <section className="card" aria-label="Hva som skjer">
          <Points
            points={[
              {
                icon: "conversations",
                text: "Meldingene som var sikkerhetskopiert, hentes tilbake.",
              },
              { icon: "lock", text: "Alle andre enheter stenges ute." },
              {
                icon: "shield",
                text: "De du skriver med, merker ingen endring.",
              },
            ]}
          />
        </section>
        <BusyButton type="submit" className="button-primary" busy={busy}>
          Hent tilbake
        </BusyButton>
        <ErrorText>{error}</ErrorText>
        <Link href={chatResetHref} className={styles.centered}>
          Har ikke nøkkelen? Tilbakestill privat chat
        </Link>
      </form>
    </>
  );
}

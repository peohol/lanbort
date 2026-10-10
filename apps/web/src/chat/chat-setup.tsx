"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { Icon } from "@/components/icon";
import { SignOutButton } from "@/components/sign-out-button";
import {
  chatLinkHref,
  chatResetHref,
  chatRestoreHref,
} from "@/navigation/chat";
import styles from "./chat.module.css";
import { ChatIcon } from "./chat-icon";
import { useChat } from "./chat-provider";
import { chatApi } from "./api";
import { EncryptionSheet } from "./encryption";
import { type ChatEngine, createChat } from "./engine";
import { chatErrorMessage } from "./messages";
import { Intro } from "./intro";
import { Notice } from "./notice";
import { Points } from "./points";
import { RecoveryKeyFlow, waitingNote } from "./recovery-key";

/**
 * Slå på privat chat (05): one explanation, one button. Then, once, the
 * offer of a recovery key (R1, PS-COM-019) before the conversations.
 */
function StartChat() {
  const { userId, started } = useChat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<ChatEngine>();

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setEngine(await createChat(userId, false));
    } catch (problem) {
      setBusy(false);
      setError(chatErrorMessage(problem));
    }
  }

  if (engine) {
    return (
      <RecoveryKeyFlow
        engine={engine}
        alternative={{
          label: "Ikke nå",
          run: async () => {
            await chatApi.answerRecoveryPrompt("offer");
            started(engine, "started");
          },
          note: waitingNote,
        }}
        done={() => started(engine, "started")}
      />
    );
  }

  return (
    <Intro
      icon={<Icon name="lock" />}
      title="Skriv privat med dem du låner av og til"
    >
      <p className="quiet">
        Meldingene er ende-til-ende-kryptert. Bare du og den du skriver med kan
        lese dem. Lånbort kan ikke.
      </p>
      <Points
        points={[
          {
            icon: "device",
            text: "Samtalene lagres på denne enheten. Andre enheter godkjenner du herfra, og de ser meldinger som sendes etter at de er koblet til.",
          },
          {
            icon: "hidden",
            text: "Ingen får vite om du har lest en melding.",
          },
        ]}
      />
      <BusyButton
        type="button"
        className="button-primary"
        busy={busy}
        onClick={() => void start()}
      >
        Slå på privat chat
      </BusyButton>
      <ErrorText>{error}</ErrorText>
      <div className={styles.centered}>
        <EncryptionSheet />
      </div>
    </Intro>
  );
}

/**
 * For someone without another device with chat: the recovery key if there
 * is one (R3), else the last way (17).
 */
function NoOtherDevice({ recovery }: { recovery: boolean }) {
  return (
    <>
      {recovery && (
        <Link href={chatRestoreHref} className={styles.centered}>
          Mistet alle enhetene? Bruk gjenopprettingsnøkkelen
        </Link>
      )}
      <OtherDevicesGone />
    </>
  );
}

function OtherDevicesGone() {
  return (
    <details className={styles.disclosure}>
      <summary>Har du ingen annen enhet med privat chat?</summary>
      <p>
        Da kan du tilbakestille privat chat på denne enheten. Meldinger fra før
        kan ikke leses her etterpå.
      </p>
      <Link href={chatResetHref}>Tilbakestill privat chat</Link>
    </details>
  );
}

/**
 * A chat page's content once this device can chat; before that, what the
 * device needs: start chat, be linked, or recover (ADR-0010 §5, §8).
 */
export function ReadyChat({
  header,
  children,
}: {
  /** The page's top while it waits for the device; the page sets its own after. */
  header?: ReactNode;
  children: (engine: ChatEngine) => ReactNode;
}) {
  const { state } = useChat();

  return state.status === "ready" ? (
    children(state.engine)
  ) : (
    <>
      {header}
      <Setup />
    </>
  );
}

/** What the device needs before it can chat, or why it cannot yet. */
export function Setup() {
  const { state, reload } = useChat();

  switch (state.status) {
    case "loading":
      return <p role="status">Henter privat chat …</p>;
    case "elsewhere":
      return (
        <Notice tag="Åpen i en annen fane" icon="info" role="status">
          <p>
            Privat chat er allerede åpen i en annen fane. Bruk den, eller lukk
            den og prøv igjen her.
          </p>
          <button type="button" className="button-secondary" onClick={reload}>
            Prøv igjen her
          </button>
        </Notice>
      );
    case "failed":
      return (
        <Notice tag="Ikke åpnet" icon="info" role="alert">
          <p>Vi fikk ikke åpnet privat chat. {chatErrorMessage(state.code)}</p>
          <button type="button" className="button-secondary" onClick={reload}>
            Prøv igjen
          </button>
        </Notice>
      );
    case "new":
      return <StartChat />;
    case "link":
      return (
        <>
          <Intro
            icon={<ChatIcon name="device" />}
            title="Koble til denne enheten"
          >
            <p className="quiet">
              Privat chat er på en annen enhet du har. For å lese og skrive her
              godkjenner du denne enheten derfra.
            </p>
            <Points
              points={[
                {
                  icon: "clock",
                  text: "Denne enheten får meldinger som sendes etter at den er koblet til.",
                },
              ]}
            />
            {/* A full page load: the link page has its own security headers. */}
            <a className="button button-primary" href={chatLinkHref}>
              Koble til denne enheten
            </a>
          </Intro>
          <NoOtherDevice recovery={state.recovery} />
        </>
      );
    case "lost":
      return (
        <>
          <Notice
            tag="Må kobles på nytt"
            icon="info"
            title="Privat chat er borte fra denne enheten"
          >
            <p className="quiet">
              Det skjer for eksempel når nettleserdataene for Lånbort er
              slettet. Logg ut og inn igjen, og koble til enheten på nytt fra en
              annen enhet du har privat chat på. Meldinger som lå her, kan ikke
              hentes tilbake hit.
            </p>
            <SignOutButton />
          </Notice>
          <OtherDevicesGone />
        </>
      );
    case "ready":
      return null;
  }
}

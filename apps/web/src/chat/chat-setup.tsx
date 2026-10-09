"use client";

import { type ReactNode, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { chatLinkHref } from "@/navigation/chat";
import { useChat } from "./chat-provider";
import { EncryptionSheet } from "./encryption";
import { ChatReset } from "./chat-reset";
import { type ChatEngine, createChat } from "./engine";
import { chatErrorMessage } from "./messages";

function StartChat() {
  const { userId, started } = useChat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      started(await createChat(userId, false));
    } catch (problem) {
      setBusy(false);
      setError(chatErrorMessage(problem));
    }
  }

  return (
    <>
      <p>
        Med privat chat kan du skrive med venner, og med folk du låner av eller
        til, uten at noen andre kan lese det. Slå det på her, så blir denne
        enheten den første som kan lese samtalene dine.
      </p>
      <BusyButton type="button" busy={busy} onClick={() => void start()}>
        Slå på privat chat
      </BusyButton>
      <ErrorText>{error}</ErrorText>
      <EncryptionSheet />
    </>
  );
}

/**
 * A chat page's content once this device can chat; before that, what the
 * device needs: start chat, be linked, or recover (ADR-0010 §5, §8).
 */
export function ReadyChat({
  title,
  children,
}: {
  /** The page's heading while it waits for the device; the page sets its own after. */
  title?: string;
  children: (engine: ChatEngine) => ReactNode;
}) {
  const { state } = useChat();

  return state.status === "ready" ? (
    children(state.engine)
  ) : (
    <>
      {title && <h1>{title}</h1>}
      <Setup />
    </>
  );
}

function Setup() {
  const { state, reload } = useChat();

  switch (state.status) {
    case "loading":
      return <p role="status">Henter privat chat …</p>;
    case "elsewhere":
      return (
        <p>
          Privat chat er allerede åpen i en annen fane eller et annet vindu i
          denne nettleseren. Lukk den og last siden på nytt.
        </p>
      );
    case "failed":
      return (
        <>
          <ErrorText>{chatErrorMessage(state.code)}</ErrorText>
          <button type="button" onClick={reload}>
            Prøv igjen
          </button>
        </>
      );
    case "new":
      return <StartChat />;
    case "link":
      return (
        <>
          <p>
            Du har privat chat på en annen enhet. Denne enheten må godkjennes
            fra en av dem før den kan lese samtalene dine, og den ser bare det
            som sendes etter det.
          </p>
          {/* A full page load: the link page has its own security headers. */}
          <p className="link-row">
            <a href={chatLinkHref}>Koble til denne enheten</a>
          </p>
          <ChatResetOffer />
        </>
      );
    case "lost":
      return (
        <>
          <p>
            Denne enheten har mistet nøklene til chatten, for eksempel fordi
            nettleserdataene er slettet. Logg ut og inn igjen, og koble den til
            fra en annen enhet du har chat på.
          </p>
          <ChatResetOffer />
        </>
      );
    case "ready":
      return null;
  }
}

/** For someone who has lost every device with chat. */
function ChatResetOffer() {
  return (
    <details>
      <summary>Jeg har ingen annen enhet med chat</summary>
      <ChatReset />
    </details>
  );
}

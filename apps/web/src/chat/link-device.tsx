"use client";

import type { ChatLinkStatus } from "@lanbort/contracts";
import type { PendingLink } from "@lanbort/e2ee";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { chatHref } from "@/navigation/chat";
import { chatApi } from "./api";
import { useChat } from "./chat-provider";
import { completeDeviceLink, requestDeviceLink } from "./engine";
import { groupLinkCode } from "./link-code";
import { chatErrorMessage } from "./messages";
import { QrCode } from "./qr-code";

/** How often the new device asks whether it has been approved. */
const pollMs = 2_000;

/**
 * On a new device (ADR-0010 §5): shows a QR code and a code for an existing
 * device to approve, and waits. The keys to open the approval exist only
 * in this page, so it must stay open until then.
 */
export function LinkDevice() {
  const { state, userId, started } = useChat();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<{
    link: PendingLink;
    status: ChatLinkStatus;
  }>();
  const finishing = useRef(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setWaiting(await requestDeviceLink());
    } catch (problem) {
      setError(chatErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!waiting) return;
    const interval = setInterval(() => {
      if (finishing.current) return;
      chatApi
        .linkStatus(waiting.status.linkRequestId)
        .then(async (status) => {
          if (status.package === null || finishing.current) return;
          finishing.current = true;
          const engine = await completeDeviceLink(userId, waiting.link, {
            ...status,
            package: status.package,
          });
          started(engine);
          router.push(chatHref);
        })
        .catch((problem: unknown) => {
          finishing.current = false;
          clearInterval(interval);
          setWaiting(undefined);
          setError(
            "Koblingen ble ikke fullført. Koden kan ha utløpt. " +
              chatErrorMessage(problem),
          );
        });
    }, pollMs);
    return () => clearInterval(interval);
  }, [waiting, userId, started, router]);

  if (state.status === "ready") {
    return (
      <>
        <h1>Koble til denne enheten</h1>
        <p>Denne enheten er allerede koblet til chatten.</p>
        <p className="link-row">
          <Link href={chatHref}>Til samtalene</Link>
        </p>
      </>
    );
  }

  if (state.status !== "link") {
    return (
      <>
        <h1>Koble til denne enheten</h1>
        <p>
          Denne enheten kan ikke kobles til nå.{" "}
          <Link href={chatHref}>Gå til Samtaler</Link> for å se hvorfor.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Koble til denne enheten</h1>
      {!waiting ? (
        <>
          <p>
            Du trenger en annen enhet der du allerede har privat chat. Den
            godkjenner denne enheten ved å skanne en kode herfra, eller ved at
            du skriver koden inn der.
          </p>
          <BusyButton type="button" busy={busy} onClick={() => void start()}>
            Vis koden
          </BusyButton>
        </>
      ) : (
        <>
          <p>
            Åpne Samtaler og <strong>Mine enheter</strong> på den andre enheten,
            velg «Godkjenn en ny enhet», og skann koden eller skriv den inn. La
            denne siden være åpen til den er godkjent.
          </p>
          <QrCode
            value={waiting.link.qr}
            label="QR-kode for å koble til enheten"
          />
          <p>
            Kode:{" "}
            <span className="link-code">
              {groupLinkCode(waiting.link.code)}
            </span>
          </p>
          <p role="status">
            Venter på godkjenning. Koden gjelder til{" "}
            {new Date(waiting.status.expiresAt).toLocaleTimeString("nb-NO", {
              timeStyle: "short",
            })}
            .
          </p>
          <p className="quiet">
            Denne enheten ser bare meldinger som sendes etter at den er koblet
            til.
          </p>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}

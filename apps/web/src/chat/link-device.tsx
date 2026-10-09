"use client";

import type { ChatLinkStatus } from "@lanbort/contracts";
import type { PendingLink } from "@lanbort/e2ee";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { chatHref } from "@/navigation/chat";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import { useChat } from "./chat-provider";
import { completeDeviceLink, requestDeviceLink } from "./engine";
import { groupLinkCode } from "./link-code";
import { chatErrorMessage } from "./messages";
import { Notice } from "./notice";
import { QrCode } from "./qr-code";
import { messageTime } from "./time";

/** How often the new device asks whether it has been approved. */
const pollMs = 2_000;

type Phase =
  | { kind: "starting" }
  | {
      kind: "waiting";
      link: PendingLink;
      status: ChatLinkStatus;
      /** How long the code is valid, as the server set it. */
      minutes: number;
    }
  | { kind: "expired"; minutes: number }
  | { kind: "failed"; reason: string };

const minutesLeft = (expiresAt: string) =>
  Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 60_000));

/** Asks for a link and says where that leaves the page. */
async function request(): Promise<Phase> {
  try {
    const { link, status } = await requestDeviceLink();
    return {
      kind: "waiting",
      link,
      status,
      minutes: minutesLeft(status.expiresAt),
    };
  } catch (problem) {
    return { kind: "failed", reason: chatErrorMessage(problem) };
  }
}

/** Linking is a bounded task, started from Samtaler (UX-IA-013). */
const header = (title: string, task = true) => (
  <PageHeader
    title={title}
    back={{ href: chatHref, label: "Samtaler" }}
    task={task}
  />
);

/**
 * On a new device (08–09, ADR-0010 §5): shows a QR code and a code for an
 * existing device to approve, and waits. The keys to open the approval
 * exist only in this page, so it must stay open until then.
 */
export function LinkDevice() {
  const { state, userId, started } = useChat();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const requested = useRef(false);
  const finishing = useRef(false);

  function again() {
    setPhase({ kind: "starting" });
    void request().then(setPhase);
  }

  // The device came here to be linked: the code is made at once (08 → 09).
  useEffect(() => {
    if (state.status !== "link" || requested.current) return;
    requested.current = true;
    void request().then(setPhase);
  }, [state.status]);

  useEffect(() => {
    if (phase.kind !== "waiting") return;
    const interval = setInterval(() => {
      if (finishing.current) return;
      chatApi
        .linkStatus(phase.status.linkRequestId)
        .then(async (status) => {
          if (status.package === null || finishing.current) return;
          finishing.current = true;
          const engine = await completeDeviceLink(userId, phase.link, {
            ...status,
            package: status.package,
          });
          started(engine, "linked");
          router.push(chatHref);
        })
        .catch((problem: unknown) => {
          finishing.current = false;
          clearInterval(interval);
          setPhase(
            Date.now() >= Date.parse(phase.status.expiresAt)
              ? { kind: "expired", minutes: phase.minutes }
              : { kind: "failed", reason: chatErrorMessage(problem) },
          );
        });
    }, pollMs);
    return () => clearInterval(interval);
  }, [phase, userId, started, router]);

  if (state.status === "ready") {
    return (
      <>
        {header("Koble til denne enheten", false)}
        {state.since === "linked" ? (
          <p role="status">Enheten er koblet til.</p>
        ) : (
          <Notice>
            <p>Denne enheten er allerede koblet til privat chat.</p>
            <Link href={chatHref} className="button button-secondary">
              Gå til samtalene
            </Link>
          </Notice>
        )}
      </>
    );
  }

  if (state.status !== "link") {
    return (
      <>
        {header("Koble til denne enheten", false)}
        {state.status === "loading" ? (
          <p role="status">Henter privat chat …</p>
        ) : (
          <p>
            Denne enheten kan ikke kobles til nå.{" "}
            <Link href={chatHref}>Gå til Samtaler</Link> for å se hvorfor.
          </p>
        )}
      </>
    );
  }

  switch (phase.kind) {
    case "starting":
      return (
        <>
          {header("Koble til denne enheten")}
          <p role="status">Lager en kode …</p>
        </>
      );
    case "expired":
      return (
        <>
          {header("Koble til denne enheten")}
          <Notice tag="Utløpt" icon="clock" role="status">
            <p>
              Koden gjaldt i {phase.minutes} minutter og ble ikke godkjent i
              tide. Lag en ny og skann den fra den andre enheten.
            </p>
            <button type="button" className="button-primary" onClick={again}>
              Lag ny kode
            </button>
          </Notice>
        </>
      );
    case "failed":
      return (
        <>
          {header("Koble til denne enheten")}
          <Notice tag="Ikke koblet" icon="info" role="alert">
            <p>Koblingen ble ikke fullført. {phase.reason}</p>
            <button type="button" className="button-secondary" onClick={again}>
              Prøv igjen
            </button>
          </Notice>
        </>
      );
    case "waiting":
      return (
        <>
          {header("Skann koden med en enhet som har privat chat")}
          <ol className={styles.steps}>
            <li>Åpne Lånbort på den andre enheten</li>
            <li>Gå til Samtaler › Mine enheter</li>
            <li>Velg «Skann koden» og hold kameraet hit</li>
          </ol>
          <div className={`card ${styles.qr}`}>
            <QrCode
              value={phase.link.qr}
              label="QR-kode for å koble til enheten"
            />
            <div role="status" className={styles.qrStatus}>
              <Tag tone="waiting">Venter på godkjenning</Tag>
              <strong>
                Koden gjelder til kl. {messageTime(phase.status.expiresAt)}
              </strong>
              <small>{phase.minutes} minutter. Den kan brukes én gang.</small>
            </div>
          </div>
          <div className={styles.typeCode}>
            <p>Kan ikke den andre enheten skanne? Skriv inn denne koden der:</p>
            <p className="link-code">{groupLinkCode(phase.link.code)}</p>
          </div>
          <p className="quiet">
            La denne siden være åpen til koblingen er godkjent.
          </p>
        </>
      );
  }
}

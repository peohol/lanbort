"use client";

import type { OwnChatDevices } from "@lanbort/contracts";
import { groupRecoveryKey } from "@lanbort/e2ee";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { chatRecoveryKeyHref } from "@/navigation/chat";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import { ChatIcon } from "./chat-icon";
import { addedAt } from "./device-names";
import { Intro } from "./intro";
import type { ChatEngine } from "./engine";
import { chatErrorMessage } from "./messages";
import { Points } from "./points";

/**
 * The recovery key (ADR-0010 §8, PS-COM-019): offered once right after
 * chat is turned on (R1), always from Mine enheter, and in one reminder.
 * The key is shown once (R2) and never kept here; only what keeps the
 * backup up to date stays on the device.
 */

/** The other choice beside «Lag gjenopprettingsnøkkel»: «Ikke nå», «Avbryt». */
interface Alternative {
  label: string;
  run: () => void | Promise<void>;
  /** What waiting means, under the buttons (R1). */
  note?: ReactNode;
}

/** R1: what the key is for, before it is made. */
function Offer({
  replacing,
  alternative,
  make,
}: {
  replacing: boolean;
  alternative?: Alternative | undefined;
  make: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => void | Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (problem) {
      setError(chatErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Intro
        icon={<ChatIcon name="key" />}
        title="Lag en gjenopprettingsnøkkel"
      >
        <p className="quiet">
          Mister du alle enhetene dine, kan du hente tilbake privat chat og
          meldingene som er sikkerhetskopiert, med nøkkelen. Bare du har den.
        </p>
        <Points
          points={[
            {
              icon: "key",
              text: "Du får 52 tegn som du skriver ned eller lagrer i en passordbehandler. Den vises bare én gang.",
            },
            {
              icon: "shield",
              text: "Lånbort kan ikke se nøkkelen, og kan ikke hjelpe deg hvis du mister den.",
            },
            ...(replacing
              ? [
                  {
                    icon: "info" as const,
                    text: "Lager du en ny, slutter den gamle å virke.",
                  },
                ]
              : []),
          ]}
        />
        <BusyButton
          type="button"
          className="button-primary"
          busy={busy}
          onClick={() => void run(make)}
        >
          Lag gjenopprettingsnøkkel
        </BusyButton>
        {alternative && (
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => void run(alternative.run)}
          >
            {alternative.label}
          </button>
        )}
        <ErrorText>{error}</ErrorText>
      </Intro>
      {alternative?.note}
    </>
  );
}

/** R2: the key, once, until the user says it is written down. */
function ShowKey({ code, done }: { code: string; done: () => void }) {
  const [kept, setKept] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const groups = groupRecoveryKey(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(groups.join(" "));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={`card ${styles.intro}`} aria-labelledby="ta-vare">
      <h2 id="ta-vare">Ta vare på nøkkelen</h2>
      <p className="quiet">
        Skriv den ned eller lagre den i en passordbehandler. Den vises ikke
        igjen.
      </p>
      <p
        className={styles.code}
        aria-label={`Gjenopprettingsnøkkel: ${groups.join(" ")}`}
      >
        {groups.map((group, index) => (
          <span key={index}>{group}</span>
        ))}
      </p>
      <button
        type="button"
        className="button-secondary"
        onClick={() => void copy()}
      >
        <ChatIcon name="copy" />
        Kopier
      </button>
      <p role="status" className="help quiet">
        {copied === true && "Nøkkelen er kopiert."}
        {copied === false &&
          "Nøkkelen kunne ikke kopieres. Skriv den av i stedet."}
      </p>
      <div className="checkbox">
        <input
          id="recovery-kept"
          type="checkbox"
          checked={kept}
          onChange={(event) => setKept(event.target.checked)}
        />
        <label htmlFor="recovery-kept">
          Jeg har skrevet ned eller lagret nøkkelen
        </label>
      </div>
      <button
        type="button"
        className="button-primary"
        disabled={!kept}
        onClick={done}
      >
        Ferdig
      </button>
    </section>
  );
}

/**
 * Makes the key and shows it once (R1–R2). `done` comes when the user has
 * written it down.
 */
export function RecoveryKeyFlow({
  engine,
  replacing = false,
  alternative,
  done,
}: {
  engine: ChatEngine;
  /** The account has a key already; a new one ends it. */
  replacing?: boolean;
  alternative?: Alternative;
  done: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);

  return code ? (
    <ShowKey
      code={code}
      done={() => {
        setCode(null);
        done();
      }}
    />
  ) : (
    <Offer
      replacing={replacing}
      alternative={alternative}
      make={async () => setCode(await engine.createRecoveryKey())}
    />
  );
}

/** What waiting means, under R1's buttons. */
export const waitingNote = (
  <section className="card" aria-labelledby="hvis-du-venter">
    <h2 id="hvis-du-venter" className={styles.pointsHeading}>
      Hvis du venter
    </h2>
    <p className="quiet">
      Mister du alle enhetene, må privat chat tilbakestilles. Meldinger fra før
      er da tapt, og de du skriver med får beskjed om at sikkerhetskoden din er
      endret. Du kan lage nøkkelen senere i Mine enheter.
    </p>
  </section>
);

/**
 * The one reminder in Samtaler (PS-COM-019): for someone who said «Ikke nå»
 * and has no key, once they have begun to exchange messages. Either answer
 * ends it.
 */
export function RecoveryReminder({
  engine,
  devices,
}: {
  engine: ChatEngine;
  devices: OwnChatDevices | undefined;
}) {
  const [exchanged, setExchanged] = useState(false);
  const [answered, setAnswered] = useState(false);
  const due = Boolean(devices?.recoveryReminder) && !engine.hasRecoveryKey;

  useEffect(() => {
    if (due) {
      engine
        .hasExchangedMessages()
        .then(setExchanged)
        .catch(() => undefined);
    }
  }, [due, engine]);

  if (!due || !exchanged || answered) return null;
  const answer = () => {
    setAnswered(true);
    void chatApi.answerRecoveryPrompt("reminder").catch(() => undefined);
  };

  return (
    <section className={`card ${styles.intro}`} aria-labelledby="ta-vare-pa">
      <h2 id="ta-vare-pa">Ta vare på meldingene dine</h2>
      <p className="quiet">
        Med en gjenopprettingsnøkkel kan du hente tilbake meldingene som er
        sikkerhetskopiert, hvis du mister alle enhetene.
      </p>
      <Link
        className="button button-secondary"
        href={chatRecoveryKeyHref}
        onClick={answer}
      >
        Lag gjenopprettingsnøkkel
      </Link>
      <button type="button" className="button-quiet" onClick={answer}>
        Ikke nå
      </button>
    </section>
  );
}

/** In Mine enheter: the key's state, and how to make one (PS-COM-019). */
export function RecoveryKeyRow({
  recovery,
}: {
  recovery: OwnChatDevices["recovery"];
}) {
  return recovery ? (
    <div className={styles.deviceRow}>
      <span className={styles.iconBubble}>
        <ChatIcon name="key" />
      </span>
      <span className={styles.linkText}>
        <strong>Gjenopprettingsnøkkel</strong>
        <small>Laget {addedAt(recovery.createdAt)}</small>
        <Link href={chatRecoveryKeyHref}>Lag en ny nøkkel</Link>
        <small>Lager du en ny, slutter den gamle å virke.</small>
      </span>
    </div>
  ) : (
    <section className={`card ${styles.intro}`} aria-labelledby="ingen-nokkel">
      <h2 id="ingen-nokkel">Ingen gjenopprettingsnøkkel</h2>
      <p className="quiet">
        Mister du alle enhetene, må privat chat tilbakestilles, og meldingene
        fra før er tapt.
      </p>
      <Link className="button button-secondary" href={chatRecoveryKeyHref}>
        Lag gjenopprettingsnøkkel
      </Link>
    </section>
  );
}

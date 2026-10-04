"use client";

import type { ChatConversation } from "@lanbort/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { announce } from "@/components/announcer";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { chatHref } from "@/navigation/chat";
import { loanHref } from "@/navigation/targets";
import { chatApi } from "./api";
import { useEngineVersion } from "./chat-provider";
import { ReadyChat } from "./chat-setup";
import {
  type ChatEngine,
  type ConversationProblem,
  chatTuning,
  fitsShortMessage,
  type HistoryEntry,
} from "./engine";
import { chatErrorMessage } from "./messages";

const time = (iso: string) =>
  new Date(iso).toLocaleString("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  });

const waitingForRecipient =
  "Meldingen sendes når den du skriver med, har slått på privat chat.";

const problems: Record<ConversationProblem, string> = {
  no_key_package:
    "Denne enheten kunne ikke bli med i samtalen. Be den du skriver med om å åpne samtalen, så prøver vi igjen.",
  out_of_sync:
    "Denne enheten er kommet i utakt med samtalen og kan ikke lese nye meldinger her. Bruk en annen enhet, eller tilbakestill chatten under Mine enheter.",
};

/** The 60 digits both compare, as 12 groups of 5 (ADR-0010 §3). */
function SecurityCode({
  engine,
  person,
}: {
  engine: ChatEngine;
  person: ChatConversation["others"][number];
}) {
  const version = useEngineVersion(engine);
  const [code, setCode] = useState<string[]>();
  const changed = engine.keyChanged(person.userId);

  useEffect(() => {
    void engine.securityCode(person.userId).then(setCode);
  }, [engine, person.userId, version]);

  const name = person.realName ?? "Ukjent navn";

  return (
    <section aria-labelledby={`kode-${person.userId}`}>
      {changed && (
        <div role="alert">
          <p>
            <strong>Sikkerhetskoden til {name} er endret.</strong> Det skjer når
            hen har tilbakestilt chatten sin, for eksempel etter å ha mistet
            alle enhetene sine. Det kan også bety at noen prøver å utgi seg for
            å være hen. Spør {name} på en annen måte om det stemmer før du
            fortsetter.
          </p>
          <BusyButton
            type="button"
            busy={false}
            onClick={() => void engine.acceptKeyChange(person.userId)}
          >
            Godta den nye sikkerhetskoden
          </BusyButton>
        </div>
      )}
      <details>
        <summary id={`kode-${person.userId}`}>
          Sikkerhetskode med {name}
        </summary>
        <p>
          Sammenlign koden med den {name} ser hos seg. Er den lik, er det ingen
          andre som kan lese samtalen.
        </p>
        {code && (
          <p className="security-code" aria-label={code.join(" ")}>
            {code.map((group, index) => (
              <span key={index}>{group} </span>
            ))}
          </p>
        )}
      </details>
    </section>
  );
}

function Message({
  entry,
  others,
}: {
  entry: HistoryEntry;
  others: ChatConversation["others"];
}) {
  const sender = entry.own
    ? "Deg"
    : (others.find((o) => o.userId === entry.senderUserId)?.realName ??
      "Ukjent avsender");

  return (
    <li className="entry">
      <span className="entry-detail">
        {sender}
        {entry.sentAt ? ` · ${time(entry.sentAt)}` : ""}
        {entry.unsent ? " · ikke sendt ennå" : ""}
      </span>
      {entry.text === null ? (
        <span className="quiet">
          Meldingen kunne ikke leses på denne enheten.
        </span>
      ) : (
        <span className="message-text">{entry.text}</span>
      )}
    </li>
  );
}

function Conversation({ engine, id }: { engine: ChatEngine; id: string }) {
  const router = useRouter();
  const version = useEngineVersion(engine);
  const [info, setInfo] = useState<ChatConversation>();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<{
    joined: boolean;
    alone: boolean;
    problem: ConversationProblem | null;
  }>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chatApi
      .conversation(id)
      .then(setInfo)
      .catch((problem: unknown) => setError(chatErrorMessage(problem)));
    engine.maintain(id).catch((problem: unknown) => {
      setError(chatErrorMessage(problem));
    });
  }, [engine, id]);

  useEffect(() => {
    let current = true;
    void Promise.all([engine.history(id), engine.status(id)]).then(
      ([entries, state]) => {
        if (!current) return;
        setHistory(entries);
        setStatus(state);
      },
    );
    return () => {
      current = false;
    };
  }, [engine, id, version]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || tooLong) return;
    setBusy(true);
    setError(null);
    setText("");
    try {
      announce(
        (await engine.send(id, message))
          ? "Meldingen er sendt."
          : waitingForRecipient,
      );
    } catch (problem) {
      setError(chatErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  async function hide() {
    try {
      await chatApi.hide(id);
      router.push(chatHref);
    } catch (problem) {
      setError(chatErrorMessage(problem));
    }
  }

  const others = info?.others ?? [];
  const canWrite = info?.open === true && status?.joined === true;
  const tooLong =
    info?.kind === "loan_logistics" && !fitsShortMessage(text.trim());

  return (
    <>
      <h1>
        {others.map((o) => o.realName ?? "Ukjent navn").join(", ") || "Samtale"}
      </h1>
      <p className="link-row">
        <Link href={chatHref}>Alle samtaler</Link>
      </p>
      {info?.loanId && (
        <p className="help">
          Denne samtalen er kun for den praktiske avslutningen av{" "}
          <Link href={loanHref(info.loanId)}>lånet</Link>: overlevering, retur,
          tid, sted og selve gjenstanden. Den stenges når lånet er avsluttet.
        </p>
      )}
      {info && !info.open && (
        <p className="quiet">
          Samtalen er stengt. Ingen av dere kan sende nye meldinger her.
        </p>
      )}
      {status?.problem && <p role="alert">{problems[status.problem]}</p>}
      {status && !status.joined && !status.problem && info?.open && (
        <p role="status">
          Venter på at en enhet i samtalen legger til denne enheten. Det skjer
          når den du skriver med, eller en annen av dine enheter, er innom
          chatten.
        </p>
      )}

      {status?.alone && info?.open && (
        <p role="status">{waitingForRecipient}</p>
      )}

      {others.map((person) => (
        <SecurityCode key={person.userId} engine={engine} person={person} />
      ))}

      <section aria-labelledby="meldinger">
        <h2 id="meldinger" className="visually-hidden">
          Meldinger
        </h2>
        {history.length === 0 ? (
          <p className="quiet">Ingen meldinger på denne enheten ennå.</p>
        ) : (
          <ol className="entries" aria-live="polite">
            {history.map((entry) => (
              <Message key={entry.id} entry={entry} others={others} />
            ))}
          </ol>
        )}
      </section>

      {canWrite && (
        <form onSubmit={(event) => void send(event)} aria-busy={busy}>
          <label htmlFor="melding">Ny melding</label>
          <textarea
            id="melding"
            name="melding"
            rows={3}
            maxLength={chatTuning.maxTextLength}
            required
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-describedby={tooLong ? "for-lang" : undefined}
          />
          {tooLong && (
            <p id="for-lang" role="alert">
              Meldingen er for lang. Her kan du bare sende korte meldinger om
              lånet.
            </p>
          )}
          <BusyButton type="submit" busy={busy}>
            Send
          </BusyButton>
          <p className="help quiet">
            Ingen får vite om eller når meldingen blir lest.
          </p>
        </form>
      )}
      <ErrorText>{error}</ErrorText>

      <div className="secondary-actions">
        <button type="button" onClick={() => void hide()}>
          Fjern fra mine samtaler
        </button>
      </div>
    </>
  );
}

export function ConversationView({ id }: { id: string }) {
  return (
    <ReadyChat title="Samtale">
      {(engine) => <Conversation engine={engine} id={id} />}
    </ReadyChat>
  );
}

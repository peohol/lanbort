"use client";

import type { ChatConversation } from "@lanbort/contracts";
import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { announce } from "@/components/announcer";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { PageHeader } from "@/components/page-header";
import { PlaceBar } from "@/components/place-bar";
import { Icon } from "@/components/icon";
import { Tag } from "@/components/tag";
import { chatAboutHref, chatHref } from "@/navigation/chat";
import { loanHref } from "@/navigation/routes";
import { ChatApiError, chatApi } from "./api";
import styles from "./chat.module.css";
import {
  ConversationRows,
  DevicesLink,
  loanOf,
  nameOf,
  Picture,
} from "./chat-home";
import { ChatIcon } from "./chat-icon";
import { useEngineVersion } from "./chat-provider";
import { ReadyChat } from "./chat-setup";
import { EncryptionLine } from "./encryption";
import {
  type ChatEngine,
  type ConversationProblem,
  chatTuning,
  type HistoryEntry,
  shortMessageRoom,
} from "./engine";
import type { ChatLoan, ChatLoans } from "./loans";
import { chatErrorMessage } from "./messages";
import { dayHeading, messageTime, sameDay } from "./time";
import { firstUnseen } from "./unread";
import { useConversations } from "./use-conversations";

const problems: Record<ConversationProblem, string> = {
  no_key_package:
    "Denne enheten kunne ikke bli med i samtalen. Be den du skriver med om å åpne samtalen, så prøver vi igjen.",
  out_of_sync:
    "Denne enheten er kommet i utakt med samtalen og kan ikke lese nye meldinger her. Bruk en annen enhet, eller tilbakestill privat chat under Mine enheter.",
};

const offlineText =
  "Du er uten nett. Meldinger du skriver nå, sendes av seg selv når du er på nett igjen.";

function subscribeOnline(changed: () => void) {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
}

const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

/** Whether the end of the page is in view, give or take a message. */
const nearEnd = () =>
  window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;

/** «Lån mellom dere» (02): links to the loans, never an action here. */
function LoansBetween({ loans }: { loans: readonly ChatLoan[] }) {
  return (
    <section className={styles.loans} aria-labelledby="lan-mellom-dere">
      <h2 id="lan-mellom-dere">Lån mellom dere · {loans.length}</h2>
      <ul>
        {loans.map((loan) => (
          <li key={loan.id}>
            <Link href={loan.href} className={styles.loanLink}>
              <span>
                <strong>{loan.title}</strong>
                <small>{loan.status}</small>
              </span>
              <Icon name="chevron" />
            </Link>
          </li>
        ))}
      </ul>
      <p>Avtaler og bekreftelser gjør dere i lånet.</p>
    </section>
  );
}

/**
 * A contact's security code changed (19): it says what it can mean without
 * accusing anyone, and nothing is written until the reader has seen it
 * (ADR-0010 §3).
 */
function KeyChanged({
  engine,
  conversationId,
  person,
}: {
  engine: ChatEngine;
  conversationId: string;
  person: ChatConversation["others"][number];
}) {
  const name = person.realName ?? "Tidligere bruker";
  return (
    <section
      className={styles.notice}
      role="alert"
      aria-labelledby={`kode-${person.userId}`}
    >
      <Tag tone="warning" icon="shield">
        Sikkerhetskode endret
      </Tag>
      <h2 id={`kode-${person.userId}`}>Sikkerhetskoden til {name} er endret</h2>
      <p className="quiet">
        Det skjer når {name} har startet privat chat på nytt, for eksempel etter
        å ha mistet enhetene sine. Det kan også bety at noen andre prøver å utgi
        seg for å være {name}. Er du usikker, spør {name} på en annen måte,
        eller sammenlign koden når dere møtes.
      </p>
      <BusyButton
        type="button"
        className="button-primary"
        busy={false}
        onClick={() => void engine.acceptKeyChange(person.userId)}
      >
        Godta og fortsett
      </BusyButton>
      <Link href={chatAboutHref(conversationId)} className="button-quiet">
        Sammenlign sikkerhetskoden
      </Link>
    </section>
  );
}

/** What an own message says about where it is (PS-COM-004: no more). */
function ownMeta(
  entry: HistoryEntry,
  { online, alone }: { online: boolean; alone: boolean },
) {
  if (!entry.unsent) return entry.sentAt ? messageTime(entry.sentAt) : "";
  if (!online) return "Venter · sendes når du er på nett";
  if (alone) return "Venter · sendes når det kan";
  return "Sender …";
}

function Messages({
  history,
  divider,
  online,
  alone,
  name,
}: {
  history: readonly HistoryEntry[];
  divider: string | null;
  online: boolean;
  alone: boolean;
  name: string;
}) {
  return (
    <ol className={styles.messages} aria-live="polite">
      {history.map((entry, index) => {
        const previous = history[index - 1]?.sentAt;
        const newDay =
          entry.sentAt !== null &&
          (previous == null || !sameDay(previous, entry.sentAt));
        const waiting = entry.own && entry.unsent;
        const meta = entry.own
          ? ownMeta(entry, { online, alone })
          : entry.sentAt
            ? messageTime(entry.sentAt)
            : "";
        return (
          <li key={entry.id} className={styles.stack}>
            {newDay && entry.sentAt && (
              <p className={styles.day}>{dayHeading(entry.sentAt)}</p>
            )}
            {entry.id === divider && (
              <p className={styles.newLine}>Ny melding</p>
            )}
            <div
              className={[
                styles.message,
                entry.own && styles.own,
                waiting && styles.waiting,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="visually-hidden">
                {entry.own ? "Du skrev:" : `${name} skrev:`}
              </span>
              {entry.text === null ? (
                <span className={`${styles.bubble} ${styles.unreadable}`}>
                  Meldingen kunne ikke leses på denne enheten.
                </span>
              ) : (
                <span className={styles.bubble}>{entry.text}</span>
              )}
              {meta && (
                <span className={styles.meta}>
                  {waiting && !meta.startsWith("Sender") && (
                    <Icon name="clock" />
                  )}
                  {meta}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Composer({
  logistics,
  disabledText,
  onSend,
}: {
  logistics: boolean;
  /** Why nothing can be written yet, shown in the field. */
  disabledText: string | null;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const message = text.trim();
  const room = logistics ? shortMessageRoom(message) : null;
  const tooLong = room !== null && room < 0;
  const blocked = disabledText !== null || !message || tooLong;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (blocked || busy) return;
    setBusy(true);
    setText("");
    try {
      await onSend(message);
    } finally {
      setBusy(false);
    }
  }

  // A keyboard sends with Enter; a new line is Shift+Enter. On a touch
  // screen, the button sends and Enter is a new line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      matchMedia("(pointer: fine)").matches
    ) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => void send(event)}
      aria-busy={busy}
    >
      <label htmlFor="melding" className="visually-hidden">
        Ny melding
      </label>
      <textarea
        id="melding"
        name="melding"
        rows={1}
        maxLength={chatTuning.maxTextLength}
        placeholder={disabledText ?? "Skriv en melding"}
        disabled={disabledText !== null}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        aria-invalid={tooLong || undefined}
        aria-describedby={logistics ? "plass-igjen" : undefined}
      />
      <button
        type="submit"
        className={styles.send}
        aria-disabled={blocked || undefined}
      >
        <ChatIcon name="send" />
        <span className="visually-hidden">Send</span>
      </button>
      {room !== null && (
        <p
          id="plass-igjen"
          className={`${styles.budget} ${tooLong ? styles.budgetOver : ""}`}
          role={tooLong ? "alert" : undefined}
        >
          <meter
            min={0}
            max={shortMessageRoom("")}
            value={Math.max(0, shortMessageRoom("") - room)}
            aria-hidden="true"
          />
          {tooLong
            ? "Meldingen er for lang. Her kan du bare sende korte meldinger om lånet."
            : `Omtrent ${room} tegn igjen`}
        </p>
      )}
    </form>
  );
}

function Conversation({
  engine,
  id,
  loans,
}: {
  engine: ChatEngine;
  id: string;
  loans: ChatLoans;
}) {
  const version = useEngineVersion(engine);
  const online = useOnline();
  const [info, setInfo] = useState<ChatConversation>();
  const [history, setHistory] = useState<HistoryEntry[]>();
  const [divider, setDivider] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    joined: boolean;
    alone: boolean;
    problem: ConversationProblem | null;
  }>();
  const [jump, setJump] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const shown = useRef(0);
  // Whether the reader was at the newest message before more came.
  const atEnd = useRef(true);
  const newest = useRef<string | undefined>(undefined);

  // Read up to the newest message once the reader has it in view, on this
  // device only: a message that came while they were further up stays new.
  const readToEnd = useCallback(() => {
    const last = newest.current;
    if (last && document.visibilityState === "visible") {
      void engine.markSeen(id, last);
    }
  }, [engine, id]);

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
    void Promise.all([
      engine.history(id),
      engine.status(id),
      engine.seen(id),
    ]).then(([entries, state, seen]) => {
      if (!current) return;
      // Where the new messages began when the page opened; it stays there
      // until the conversation is left.
      if (!opened.current) {
        opened.current = true;
        setDivider(firstUnseen(entries, seen)?.id ?? null);
      }
      setHistory(entries);
      setStatus(state);
    });
    return () => {
      current = false;
    };
  }, [engine, id, version]);

  // Opens at the newest message; new ones keep the reader there if they
  // were already, or offer the way down instead of moving them.
  useLayoutEffect(() => {
    if (!history) return;
    const count = history.length;
    newest.current = history.at(-1)?.id;
    if (shown.current === 0 || history.at(-1)?.own || atEnd.current) {
      end.current?.scrollIntoView({ block: "end" });
      setJump(false);
      readToEnd();
    } else if (count > shown.current) {
      setJump(true);
    }
    shown.current = count;
  }, [history, readToEnd]);

  useEffect(() => {
    const settle = () => {
      atEnd.current = nearEnd();
      if (atEnd.current) {
        setJump(false);
        readToEnd();
      }
    };
    window.addEventListener("scroll", settle, { passive: true });
    document.addEventListener("visibilitychange", settle);
    return () => {
      window.removeEventListener("scroll", settle);
      document.removeEventListener("visibilitychange", settle);
    };
  }, [readToEnd]);

  async function send(message: string) {
    setError(null);
    try {
      const sent = await engine.send(id, message);
      announce(
        sent
          ? "Meldingen er sendt."
          : "Meldingen venter og sendes av seg selv.",
      );
    } catch (problem) {
      // Kept on the device and sent at the next sync (20).
      if (problem instanceof ChatApiError && problem.code === "network") {
        announce("Meldingen venter og sendes når du er på nett igjen.");
      } else {
        setError(chatErrorMessage(problem));
      }
    }
  }

  const others = info?.others ?? [];
  const name = nameOf(others) || "den du skriver med";
  const logistics = info?.kind === "loan_logistics";
  const loan = logistics ? loanOf(loans, info.loanId) : undefined;
  const between = !logistics && others[0] ? loans[others[0].userId] : undefined;
  const changed = others.filter((o) => engine.keyChanged(o.userId));
  const canWrite = info?.open === true && status?.joined === true;

  return (
    <>
      <header className="page-header">
        <PlaceBar
          place={{ label: info ? name : "Samtale", home: "conversations" }}
        />
        <div className={styles.head}>
          <Picture people={others} />
          <div className={styles.headText}>
            <p className="page-kind">
              {logistics
                ? `Lånelogistikk${loan ? ` · ${loan.title}` : ""}`
                : "Samtale"}
            </p>
            <h1>{info ? name : "Samtale"}</h1>
          </div>
          <Link
            href={chatAboutHref(id)}
            className={styles.moreLink}
            aria-label="Om samtalen"
          >
            <ChatIcon name="more" />
          </Link>
        </div>
      </header>

      {between && between.length > 0 && <LoansBetween loans={between} />}

      {logistics && info && (
        <section className={styles.notice} aria-label="Om lånelogistikk">
          <Tag tone="neutral" icon="things">
            Bare for å avslutte lånet
          </Tag>
          <p>
            Vanlig chat med {name} er stengt. Her kan dere bare avtale
            overlevering eller retur{loan ? ` av ${loan.title}` : ""}: tid, sted
            og hvordan. Korte meldinger, ingen bilder. Ingen av dere kan stenge
            den. Den lukkes når lånet er avsluttet.
          </p>
          {info.loanId && (
            <Link href={loanHref(info.loanId)} className="button-quiet">
              Gå til lånet
            </Link>
          )}
        </section>
      )}

      {info && !info.open && (
        <div className={styles.notice} role="status">
          <Tag tone="neutral" icon="lock">
            {logistics ? "Lukket" : "Stengt"}
          </Tag>
          <p>
            {logistics
              ? "Samtalen om lånet er lukket. Dere kan ikke sende flere meldinger her."
              : "Samtalen er stengt. Ingen av dere kan sende nye meldinger her."}
          </p>
        </div>
      )}

      {!online && info?.open && (
        <div className={`${styles.notice} ${styles.noticeRow}`} role="status">
          <Icon name="offline" />
          <p>{offlineText}</p>
        </div>
      )}

      {status?.problem && (
        <p className={styles.notice} role="alert">
          {problems[status.problem]}
        </p>
      )}
      {status && !status.joined && !status.problem && info?.open && (
        <p className={styles.notice} role="status">
          Venter på at en enhet i samtalen legger til denne enheten. Det skjer
          når den du skriver med, eller en annen av dine enheter, er innom
          privat chat.
        </p>
      )}

      {status?.alone && info?.open && (
        <p className={styles.notice} role="status">
          Meldingen sendes når den du skriver med, har slått på privat chat.
        </p>
      )}

      {changed.map((person) => (
        <KeyChanged
          key={person.userId}
          engine={engine}
          conversationId={id}
          person={person}
        />
      ))}

      {info && <EncryptionLine with={name} />}

      <section aria-labelledby="meldinger">
        <h2 id="meldinger" className="visually-hidden">
          Meldinger
        </h2>
        {history?.length === 0 && (
          <p className="quiet">Ingen meldinger på denne enheten ennå.</p>
        )}
        {history && history.length > 0 && (
          <Messages
            history={history}
            divider={divider}
            online={online}
            alone={status?.alone === true}
            name={name}
          />
        )}
        <div ref={end} />
      </section>

      {jump && (
        <button
          type="button"
          className={styles.jump}
          onClick={() => end.current?.scrollIntoView({ block: "end" })}
        >
          Ny melding <ChatIcon name="down" />
        </button>
      )}

      {canWrite && (
        <Composer
          logistics={logistics}
          disabledText={changed.length > 0 ? "Godta først for å skrive" : null}
          onSend={send}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}

/** The list beside the open conversation on a wider screen (UX-IA-001). */
const wide = "(min-width: 64rem)";

function subscribeWide(changed: () => void) {
  const query = matchMedia(wide);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

/** Whether the screen has room for the list beside the conversation. */
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => matchMedia(wide).matches,
    () => false,
  );

function SideList({
  engine,
  id,
  loans,
}: {
  engine: ChatEngine;
  id: string;
  loans: ChatLoans;
}) {
  const { conversations, summaries } = useConversations(engine);
  return (
    <nav className={styles.splitList} aria-label="Alle samtaler">
      {conversations && conversations.length > 0 && (
        <ConversationRows
          conversations={conversations}
          summaries={summaries}
          loans={loans}
          current={id}
        />
      )}
      <DevicesLink />
    </nav>
  );
}

export function ConversationView({
  id,
  loans,
}: {
  id: string;
  loans: ChatLoans;
}) {
  return (
    <ReadyChat
      header={
        <PageHeader
          title="Samtale"
          back={{ href: chatHref, label: "Samtaler" }}
        />
      }
    >
      {(engine) => <Split engine={engine} id={id} loans={loans} />}
    </ReadyChat>
  );
}

function Split({
  engine,
  id,
  loans,
}: {
  engine: ChatEngine;
  id: string;
  loans: ChatLoans;
}) {
  const conversation = <Conversation engine={engine} id={id} loans={loans} />;
  // On a phone the conversation is the page, and its first row shares the
  // bar at the top.
  return useWide() ? (
    <div className={styles.split}>
      <SideList engine={engine} id={id} loans={loans} />
      <div>{conversation}</div>
    </div>
  ) : (
    conversation
  );
}

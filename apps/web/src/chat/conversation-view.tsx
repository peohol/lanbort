"use client";

import type { ChatConversation } from "@lanbort/contracts";
import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { announce } from "@/components/announcer";
import { BusyButton } from "@/components/busy-button";
import { announceDataChanged } from "@/components/data-changed";
import { ErrorText } from "@/components/error-text";
import { useStack } from "@/components/navigation-stack";
import { PageHeader } from "@/components/page-header";
import { PlaceBar } from "@/components/place-bar";
import { Icon } from "@/components/icon";
import { useScreenFrame } from "@/components/screen-frame";
import { chatAboutHref, chatHref } from "@/navigation/chat";
import { loanHref } from "@/navigation/routes";
import { ChatApiError, chatApi } from "./api";
import styles from "./chat.module.css";
import { ConversationRows, loanOf, nameOf, Picture } from "./chat-home";
import { ChatIcon } from "./chat-icon";
import { useEngineVersion } from "./chat-provider";
import { addedAt } from "./device-names";
import { ReadyChat } from "./chat-setup";
import { EncryptionLine } from "./encryption";
import {
  type ChatEngine,
  type ConversationProblem,
  type Counterpart,
  chatTuning,
  type HistoryEntry,
  shortMessageRoom,
} from "./engine";
import { missesEarlier } from "./history-transfer";
import { LinkRow } from "./link-row";
import { type ChatLoan, type ChatLoans, cameFromFirst } from "./loans";
import { chatErrorMessage } from "./messages";
import { Notice } from "./notice";
import { dayHeading, messageTime, sameDay } from "./time";
import { ChangedAgain, SecurityDigits, useSecurityCode } from "./security-code";
import { firstUnseen } from "./unread";
import { useConversations } from "./use-conversations";

const problems: Record<ConversationProblem, string> = {
  no_key_package:
    "Denne enheten kunne ikke bli med i samtalen. Be den du skriver med om å åpne samtalen, så prøver vi igjen.",
  out_of_sync:
    "Denne enheten er kommet i utakt med samtalen og kan ikke lese nye meldinger her. Bruk en annen enhet, eller tilbakestill privat chat under Mine enheter.",
  other_person:
    "Samtalen er kryptert med en annen enn den som vises her. Ingenting sendes i den, og meldingene i den kan være fra en annen.",
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

/**
 * Whether the end of the messages is in view, give or take a message: in
 * the frame the list scrolls on its own, otherwise the page does.
 */
const nearEnd = (list: HTMLElement | null) =>
  list && list.scrollHeight > list.clientHeight
    ? list.scrollTop + list.clientHeight >= list.scrollHeight - 160
    : window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;

/** «Lån mellom dere» (02): links to the loans, never an action here. */
function LoansBetween({ loans }: { loans: readonly ChatLoan[] }) {
  const shown = cameFromFirst(loans, useStack()?.entries ?? []);
  return (
    <section className={styles.loans} aria-labelledby="lan-mellom-dere">
      <h2 id="lan-mellom-dere">Lån mellom dere · {loans.length}</h2>
      <ul>
        {shown.map((loan) => (
          <LinkRow
            key={loan.id}
            href={loan.href}
            title={loan.title}
            detail={loan.status}
            picture={loan.picture}
          />
        ))}
      </ul>
      <p>Avtaler og bekreftelser gjør dere i lånet.</p>
    </section>
  );
}

/**
 * A contact's security code changed (19): it says what it can mean without
 * accusing anyone, shows the new code, and nothing is written until the
 * reader has accepted that code (ADR-0010 §3). Should the server show yet
 * another key, the new code is shown only when asked for, before anything
 * can be accepted.
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
  const { code, changedAgain, showNew, accept } = useSecurityCode(
    engine,
    conversationId,
    person.userId,
  );
  const [busy, setBusy] = useState(false);
  return (
    <Notice
      tag="Sikkerhetskode endret"
      tone="warning"
      icon="shield"
      role="alert"
      title={`Sikkerhetskoden til ${name} er endret`}
    >
      <p className="quiet">
        Det skjer når {name} har startet privat chat på nytt, for eksempel etter
        å ha mistet enhetene sine. Det kan også bety at noen andre prøver å utgi
        seg for å være {name}. Er du usikker, spør {name} på en annen måte,
        eller sammenlign koden når dere møtes.
      </p>
      {code?.pending && <SecurityDigits code={code} />}
      {changedAgain ? (
        <ChangedAgain showNew={showNew} />
      ) : (
        <BusyButton
          type="button"
          className="button-primary"
          busy={busy || !code?.pending}
          busyNote={busy ? "godtar …" : "henter koden …"}
          onClick={() => {
            setBusy(true);
            void accept().finally(() => setBusy(false));
          }}
        >
          Godta og fortsett
        </BusyButton>
      )}
      <Link href={chatAboutHref(conversationId)} className="button-quiet">
        Sammenlign sikkerhetskoden
      </Link>
    </Notice>
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
  from,
  name,
}: {
  history: readonly HistoryEntry[];
  divider: string | null;
  online: boolean;
  alone: boolean;
  /**
   * The account the page may name (`Counterpart`): only a message verified
   * to be from it is said to be from `name`.
   */
  from: string | null;
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
              {entry.own || (from !== null && entry.senderUserId === from) ? (
                <span className="visually-hidden">
                  {entry.own ? "Du skrev:" : `${name} skrev:`}
                </span>
              ) : entry.text === null ? (
                <span className="visually-hidden">Ukjent avsender skrev:</span>
              ) : (
                // Seen too: under the name above, it would read as theirs.
                <span className={styles.sender}>
                  Ukjent avsender
                  <span className="visually-hidden"> skrev:</span>
                </span>
              )}
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
      className={`${styles.composer} bar-surface`}
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
        // The field keeps focus, so a phone's keyboard stays open.
        onMouseDown={(event) => event.preventDefault()}
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
  const [linkedAt, setLinkedAt] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    engine
      .linkedAt()
      .then((at) => current && setLinkedAt(at))
      // Without it the note is left out; the conversation works as before.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [engine]);
  const [divider, setDivider] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    joined: boolean;
    alone: boolean;
    problem: ConversationProblem | null;
    counterpart: Counterpart;
  }>();
  const [jump, setJump] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useScreenFrame(list);
  const opened = useRef(false);
  const shown = useRef(0);
  // Whether the reader was at the newest message before more came.
  const atEnd = useRef(true);
  const newest = useRef<string | undefined>(undefined);
  const notified = useRef<string | undefined>(undefined);

  // Read up to the newest message once the reader has it in view, on this
  // device only: a message that came while they were further up stays new.
  // The notification of new messages is read then too (PS-COM-018), once
  // for each newest message.
  const readToEnd = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    const last = newest.current;
    if (last) void engine.markSeen(id, last);
    // Also with nothing here yet, as on a newly linked device: the
    // notification is the account's, not this device's.
    const seen = last ?? "";
    if (notified.current !== seen) {
      notified.current = seen;
      chatApi.readNotifications(id).then(announceDataChanged, () => {
        notified.current = undefined;
      });
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

  // Whom the page shows: the engine sends only if the group is with them.
  const shows = useMemo(
    () => info?.others.map((other) => other.userId),
    [info],
  );

  useEffect(() => {
    let current = true;
    void Promise.all([
      engine.history(id),
      shows && engine.status(id, shows),
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
  }, [engine, id, version, shows]);

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
    const scroller = list.current;
    const settle = () => {
      atEnd.current = nearEnd(scroller);
      if (atEnd.current) {
        setJump(false);
        readToEnd();
      }
    };
    // A reader at the end stays there when the list gets shorter, as when
    // a phone's keyboard opens.
    const resized = new ResizeObserver(() => {
      if (atEnd.current) end.current?.scrollIntoView({ block: "end" });
    });
    if (scroller) resized.observe(scroller);
    window.addEventListener("scroll", settle, { passive: true });
    scroller?.addEventListener("scroll", settle, { passive: true });
    document.addEventListener("visibilitychange", settle);
    return () => {
      resized.disconnect();
      window.removeEventListener("scroll", settle);
      scroller?.removeEventListener("scroll", settle);
      document.removeEventListener("visibilitychange", settle);
    };
  }, [readToEnd]);

  async function send(message: string) {
    setError(null);
    try {
      const sent = await engine.send(id, message, shows ?? []);
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
  const linkedSince =
    linkedAt &&
    info &&
    history &&
    missesEarlier(linkedAt, info.startedAt, history)
      ? linkedAt
      : null;
  // Nothing here is said to be from, or readable by, anyone but the one
  // this device has settled the conversation is with.
  const from = status?.counterpart.userId ?? null;
  const elsewhere =
    status?.problem === "other_person" ||
    status?.counterpart.elsewhere === true;
  const settled = from !== null && !elsewhere;
  const canWrite = info?.open === true && status?.joined === true && settled;

  return (
    <>
      <header className={`page-header ${styles.top}`}>
        <PlaceBar
          place={{ label: info ? name : "Samtale", home: "conversations" }}
        />
        <div className={styles.head}>
          <Picture people={others} />
          <div className={styles.headText}>
            {logistics && (
              <p className="page-kind">
                Lånelogistikk{loan ? ` · ${loan.title}` : ""}
              </p>
            )}
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

      {/* Only this part scrolls while the top and the field stay
          (`useScreenFrame`). */}
      <div ref={list} className={`frame-scroll ${styles.scroller}`}>
        {between && between.length > 0 && <LoansBetween loans={between} />}

        {logistics && info && (
          <Notice tag="Bare for å avslutte lånet" icon="things">
            <p>
              Vanlig chat med {name} er stengt. Her kan dere bare avtale
              overlevering eller retur{loan ? ` av ${loan.title}` : ""}: tid,
              sted og hvordan. Korte meldinger, ingen bilder. Ingen av dere kan
              stenge den. Den lukkes når lånet er avsluttet.
            </p>
            {info.loanId && (
              <Link href={loanHref(info.loanId)} className="button-quiet">
                Gå til lånet
              </Link>
            )}
          </Notice>
        )}

        {info && !info.open && (
          <Notice
            tag={logistics ? "Lukket" : "Stengt"}
            icon="lock"
            role="status"
          >
            <p>
              {logistics
                ? "Samtalen om lånet er lukket. Dere kan ikke sende flere meldinger her."
                : "Samtalen er stengt. Ingen av dere kan sende nye meldinger her."}
            </p>
          </Notice>
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

        {settled &&
          changed.map((person) => (
            <KeyChanged
              key={person.userId}
              engine={engine}
              conversationId={id}
              person={person}
            />
          ))}

        {info && status && (
          <EncryptionLine with={settled ? name : null} elsewhere={elsewhere} />
        )}

        <section aria-labelledby="meldinger">
          <h2 id="meldinger" className="visually-hidden">
            Meldinger
          </h2>
          {linkedSince ? (
            <p className={styles.since}>
              <Icon name="clock" />
              Denne enheten ble koblet til {addedAt(linkedSince)}. Meldinger fra
              før finnes på enhetene som mottok dem.
            </p>
          ) : (
            history?.length === 0 && (
              <p className="quiet">Ingen meldinger på denne enheten ennå.</p>
            )
          )}
          {history && history.length > 0 && (
            <Messages
              history={history}
              divider={divider}
              online={online}
              alone={status?.alone === true}
              from={elsewhere ? null : from}
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
      </div>

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

/**
 * On a larger screen, the other conversations beside this one, to go
 * between them. With only this one there is nothing to go to, so the
 * conversation stands alone; Mine enheter is offered on the list page.
 */
function WideSplit({
  engine,
  id,
  loans,
  conversation,
}: {
  engine: ChatEngine;
  id: string;
  loans: ChatLoans;
  conversation: ReactNode;
}) {
  const { conversations, summaries } = useConversations(engine);

  return conversations && conversations.length > 1 ? (
    <div className={styles.split}>
      <nav className={styles.splitList} aria-label="Alle samtaler">
        <ConversationRows
          conversations={conversations}
          summaries={summaries}
          loans={loans}
          current={id}
        />
      </nav>
      <div className={styles.splitMain}>{conversation}</div>
    </div>
  ) : (
    conversation
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
    <WideSplit
      engine={engine}
      id={id}
      loans={loans}
      conversation={conversation}
    />
  ) : (
    conversation
  );
}

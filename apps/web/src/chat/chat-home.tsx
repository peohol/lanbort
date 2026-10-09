"use client";

import type { ChatContext, ChatConversation } from "@lanbort/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { EmptyState } from "@/components/empty-state";
import { ErrorText } from "@/components/error-text";
import { Icon } from "@/components/icon";
import { ProfilePicture } from "@/components/profile-picture";
import { Tag } from "@/components/tag";
import { chatConversationHref, chatDevicesHref } from "@/navigation/chat";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import { ChatIcon } from "./chat-icon";
import { ReadyChat } from "./chat-setup";
import type { ChatEngine } from "./engine";
import { type ChatLoans, loansLine } from "./loans";
import { chatErrorMessage } from "./messages";
import { listTime } from "./time";
import {
  type ConversationSummary,
  useConversations,
} from "./use-conversations";

export interface ChatPerson {
  userId: string;
  realName: string | null;
  /** Their picture, where the reader may see it (PS-USR-002). */
  pictureId?: string | null;
}

/** Someone the page was opened to write to, with what allows it. */
export interface ChatInvitation extends ChatPerson {
  context?: ChatContext;
}

export const nameOf = (people: readonly ChatPerson[]) =>
  people.map((person) => person.realName ?? "Tidligere bruker").join(", ");

/** The first person's picture, or their initials where none is shown. */
export function Picture({ people }: { people: readonly ChatPerson[] }) {
  const [first] = people;
  return (
    <ProfilePicture
      pictureId={first?.pictureId ?? null}
      name={first?.realName ?? null}
      size="medium"
      initials
    />
  );
}

/** The loan a loan logistics conversation is about, by its id. */
export const loanOf = (loans: ChatLoans, loanId: string | null) =>
  loanId === null
    ? undefined
    : Object.values(loans)
        .flat()
        .find((loan) => loan.id === loanId);

/** What the row says under the name: the loans, or the loan it is for. */
function rowContext(conversation: ChatConversation, loans: ChatLoans) {
  if (conversation.kind === "loan_logistics") {
    const loan = loanOf(loans, conversation.loanId);
    return loan ? `Lånelogistikk · ${loan.title}` : "Lånelogistikk";
  }
  const [other] = conversation.others;
  return other ? loansLine(loans[other.userId]) : null;
}

function preview(summary: ConversationSummary | undefined) {
  if (!summary?.last) return "Ingen meldinger på denne enheten ennå";
  const text = summary.last.text ?? "Meldingen kunne ikke leses her";
  return summary.last.own ? `Du: ${text}` : text;
}

/** One row per conversation (01), the open one marked where it shows. */
export function ConversationRows({
  conversations,
  summaries,
  loans,
  current,
}: {
  conversations: readonly ChatConversation[];
  summaries: ReadonlyMap<string, ConversationSummary>;
  loans: ChatLoans;
  current?: string;
}) {
  return (
    <ul className={styles.list}>
      {conversations.map((conversation) => {
        const id = conversation.conversationId;
        const summary = summaries.get(id);
        const context = rowContext(conversation, loans);
        const at = summary?.last?.sentAt ?? conversation.lastActivityAt;
        return (
          <li key={id} className={summary?.isNew ? styles.rowNew : undefined}>
            <Link
              href={chatConversationHref(id)}
              className={styles.row}
              aria-current={id === current ? "page" : undefined}
            >
              <Picture people={conversation.others} />
              <span className={styles.rowText}>
                <span className={styles.rowTop}>
                  <span className={styles.rowName}>
                    {nameOf(conversation.others)}
                  </span>
                  <span className={styles.rowTime}>{listTime(at)}</span>
                </span>
                {context && <span className={styles.rowLoans}>{context}</span>}
                <span className={styles.rowPreview}>{preview(summary)}</span>
                {summary?.isNew && <Tag tone="attention">Ny melding</Tag>}
                {!conversation.open && (
                  <Tag tone="neutral" icon="lock">
                    Stengt
                  </Tag>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function StartButton({
  engine,
  person,
  context,
  label,
}: {
  engine: ChatEngine;
  person: ChatPerson;
  context?: ChatContext | undefined;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { conversationId } = await chatApi.start({
        userId: person.userId,
        ...(context ? { context } : {}),
      });
      await engine.maintain(conversationId);
      router.push(chatConversationHref(conversationId));
    } catch (problem) {
      setBusy(false);
      setError(chatErrorMessage(problem));
    }
  }

  return (
    <>
      <BusyButton
        type="button"
        className="button-secondary"
        busy={busy}
        onClick={() => void start()}
      >
        {label}
      </BusyButton>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

/** «Mine enheter», with how many devices can read the conversations. */
export function DevicesLink() {
  const [count, setCount] = useState<number>();

  useEffect(() => {
    chatApi
      .devices()
      .then(({ devices }) =>
        setCount(devices.filter((d) => d.revokedAt === null).length),
      )
      .catch(() => undefined);
  }, []);

  return (
    <Link href={chatDevicesHref} className={styles.linkCard}>
      <span className={styles.iconBubble}>
        <ChatIcon name="device" />
      </span>
      <span className={styles.linkText}>
        <strong>Mine enheter</strong>
        {count !== undefined && (
          <small>
            {count === 1 ? "1 enhet kan" : `${count} enheter kan`} lese
            samtalene dine
          </small>
        )}
      </span>
      <Icon name="chevron" />
    </Link>
  );
}

/** The list could not be fetched: what the device holds still reads (21). */
export function NotUpdated({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div className={styles.notice} role="alert">
      <Tag tone="warning">Ikke oppdatert</Tag>
      <p>Vi fikk ikke hentet samtalene. {error}</p>
      <button type="button" className="button-secondary" onClick={retry}>
        Prøv igjen
      </button>
    </div>
  );
}

function ConversationList({
  engine,
  friends,
  loans,
  invitation,
}: {
  engine: ChatEngine;
  friends: readonly ChatPerson[];
  loans: ChatLoans;
  invitation?: ChatInvitation;
}) {
  const { conversations, summaries, error, retry } = useConversations(engine);

  // One private conversation per person (PS-COM-017): those already in
  // the list are not offered again.
  const talkingTo = new Set(
    (conversations ?? [])
      .filter((c) => c.kind === "private")
      .flatMap((c) => c.others.map((o) => o.userId)),
  );
  const newFriends = conversations
    ? friends.filter((f) => !talkingTo.has(f.userId))
    : [];

  return (
    <>
      {invitation && conversations && !talkingTo.has(invitation.userId) && (
        <section
          aria-labelledby="ny-samtale"
          className={`card ${styles.stack}`}
        >
          <h2 id="ny-samtale">Ny samtale</h2>
          <p>
            Vil du starte en privat samtale med{" "}
            {invitation.realName ?? "den som kontaktet deg"}? Å åpne samtalen
            svarer ikke på henvendelsen.
          </p>
          <StartButton
            engine={engine}
            person={invitation}
            context={invitation.context}
            label="Start samtalen"
          />
        </section>
      )}

      <section aria-labelledby="samtaler">
        <h2 id="samtaler" className="visually-hidden">
          Dine samtaler
        </h2>
        {error && <NotUpdated error={error} retry={retry} />}
        {conversations === undefined && !error && (
          <p role="status">Henter samtaler …</p>
        )}
        {conversations?.length === 0 && (
          <EmptyState>
            <strong>Ingen samtaler ennå.</strong> Skriv til en venn herfra.
            Andre kan du skrive med når de har sendt deg en forespørsel eller
            spurt om en ting.
          </EmptyState>
        )}
        {conversations && conversations.length > 0 && (
          <ConversationRows
            conversations={conversations}
            summaries={summaries}
            loans={loans}
          />
        )}
      </section>

      {newFriends.length > 0 && (
        <section aria-labelledby="venner">
          <h2 id="venner" className={styles.sectionHeading}>
            Skriv til en venn
          </h2>
          <ul className={styles.list}>
            {newFriends.map((friend) => (
              <li key={friend.userId} className={styles.friend}>
                <span className="person-name" id={`venn-${friend.userId}`}>
                  <Picture people={[friend]} />
                  <span>
                    <strong>{nameOf([friend])}</strong>
                    <br />
                    <span className="quiet">Venn</span>
                  </span>
                </span>
                <div role="group" aria-labelledby={`venn-${friend.userId}`}>
                  <StartButton
                    engine={engine}
                    person={friend}
                    label="Start samtale"
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="help quiet">
            Venner du allerede har en samtale med, står i listen over.
          </p>
        </section>
      )}

      <DevicesLink />
    </>
  );
}

/** Samtaler: the device's conversations, and who it can start one with. */
export function ChatHome(props: {
  friends: readonly ChatPerson[];
  loans: ChatLoans;
  invitation?: ChatInvitation;
}) {
  return (
    <ReadyChat>
      {(engine) => <ConversationList engine={engine} {...props} />}
    </ReadyChat>
  );
}

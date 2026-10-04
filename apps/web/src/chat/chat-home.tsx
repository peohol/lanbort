"use client";

import type { ChatContext, ChatConversation } from "@lanbort/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { chatConversationHref, chatDevicesHref } from "@/navigation/chat";
import { chatApi } from "./api";
import { useEngineVersion } from "./chat-provider";
import { EncryptionNote, ReadyChat } from "./chat-setup";
import type { ChatEngine } from "./engine";
import { chatErrorMessage } from "./messages";

export interface ChatPerson {
  userId: string;
  realName: string | null;
}

/** Someone the page was opened to write to, with what allows it. */
export interface ChatInvitation extends ChatPerson {
  context?: ChatContext;
}

const nameOf = (people: readonly ChatPerson[]) =>
  people.map((person) => person.realName ?? "Ukjent navn").join(", ");

const time = (iso: string) =>
  new Date(iso).toLocaleString("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
      <BusyButton type="button" busy={busy} onClick={() => void start()}>
        {label}
      </BusyButton>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function ConversationList({
  engine,
  friends,
  invitation,
}: {
  engine: ChatEngine;
  friends: readonly ChatPerson[];
  invitation?: ChatInvitation;
}) {
  const version = useEngineVersion(engine);
  const [conversations, setConversations] = useState<ChatConversation[]>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    chatApi
      .conversations()
      .then((list) => {
        if (current) setConversations(list.conversations);
      })
      .catch((problem: unknown) => {
        if (current) setError(chatErrorMessage(problem));
      });
    return () => {
      current = false;
    };
  }, [version]);

  // Keeps every group in line with its participants' devices, so a device
  // someone linked since gets the messages too (ADR-0010 §4). Once per
  // visit, not on every change it causes itself.
  const maintained = useRef(false);
  useEffect(() => {
    if (!conversations || maintained.current) return;
    maintained.current = true;
    const open = conversations
      .filter((c) => c.open)
      .map((c) => c.conversationId);
    void (async () => {
      for (const id of open) await engine.maintain(id).catch(() => undefined);
    })();
  }, [conversations, engine]);

  // A loan's own conversation is not a private one to start again from.
  const talkingTo = new Set(
    (conversations ?? [])
      .filter((c) => c.kind === "private")
      .flatMap((c) => c.others.map((o) => o.userId)),
  );
  const newFriends = friends.filter((f) => !talkingTo.has(f.userId));

  return (
    <>
      {invitation && !talkingTo.has(invitation.userId) && (
        <section aria-labelledby="ny-samtale">
          <h2 id="ny-samtale">Ny samtale</h2>
          <p>
            Vil du starte en privat samtale med{" "}
            {invitation.realName ?? "den som kontaktet deg"}?
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
        <h2 id="samtaler">Dine samtaler</h2>
        <ErrorText>{error}</ErrorText>
        {conversations === undefined && !error && (
          <p role="status">Henter samtaler …</p>
        )}
        {conversations?.length === 0 && (
          <p className="quiet">Du har ingen samtaler ennå.</p>
        )}
        <ul className="entries">
          {conversations?.map((conversation) => (
            <li key={conversation.conversationId} className="entry">
              <Link href={chatConversationHref(conversation.conversationId)}>
                {nameOf(conversation.others)}
              </Link>
              <span className="entry-detail">
                {conversation.loanId ? "Om lånet · " : ""}
                {conversation.open ? "" : "Stengt · "}
                Sist aktiv {time(conversation.lastActivityAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {newFriends.length > 0 && (
        <section aria-labelledby="venner">
          <h2 id="venner">Skriv til en venn</h2>
          <ul className="entries">
            {newFriends.map((friend) => (
              <li key={friend.userId} className="entry">
                <strong id={`venn-${friend.userId}`}>{nameOf([friend])}</strong>
                <div
                  className="actions"
                  role="group"
                  aria-labelledby={`venn-${friend.userId}`}
                >
                  <StartButton
                    engine={engine}
                    person={friend}
                    label="Start samtale"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="link-row">
        <Link href={chatDevicesHref}>Mine enheter</Link>
      </p>
      <EncryptionNote />
    </>
  );
}

/** Samtaler: the device's conversations, and who it can start one with. */
export function ChatHome(props: {
  friends: readonly ChatPerson[];
  invitation?: ChatInvitation;
}) {
  return (
    <ReadyChat>
      {(engine) => <ConversationList engine={engine} {...props} />}
    </ReadyChat>
  );
}

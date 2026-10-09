"use client";

import {
  type ChatConversation,
  caseEntryBodySchema,
  type PrivateMessageCopy,
  privateMessageCopyLimit,
} from "@lanbort/contracts";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { useCommand } from "@/components/use-command";
import { caseHref } from "@/navigation/routes";
import { chatApi } from "./api";
import { useChat } from "./chat-provider";
import { ReadyChat } from "./chat-setup";
import type { ChatEngine, HistoryEntry } from "./engine";
import { chatErrorMessage } from "./messages";

const time = (iso: string) =>
  new Date(iso).toLocaleString("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  });

const nameOf = (conversation: ChatConversation) =>
  conversation.others.map((o) => o.realName ?? "Ukjent navn").join(", ") ||
  "Samtale";

/** A message this device has read, with what a copy of it needs. */
type Readable = HistoryEntry & { text: string; sentAt: string };

const readable = (entry: HistoryEntry): entry is Readable =>
  entry.text !== null && entry.sentAt !== null && !entry.unsent;

/**
 * WP-46 (PS-COM-013): the participant chooses messages in their own,
 * decrypted history on this device and sends a readable copy of them with
 * an entry in the case. Nothing else of the conversation, and no key,
 * leaves the device; the copy is theirs to vouch for.
 */
function Choose({
  engine,
  caseId,
  title,
}: {
  engine: ChatEngine;
  caseId: string;
  title: string;
}) {
  const { userId } = useChat();
  const [conversations, setConversations] = useState<ChatConversation[]>();
  const [conversationId, setConversationId] = useState("");
  const [history, setHistory] = useState<Readable[]>([]);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const command = useCommand({
    path: `/api/cases/${caseId}/entries`,
    done: "Meldingene er sendt inn",
    after: () => caseHref(caseId),
  });

  useEffect(() => {
    chatApi
      .conversations()
      .then(({ conversations: list }) => setConversations(list))
      .catch((error: unknown) => setProblem(chatErrorMessage(error)));
  }, []);

  useEffect(() => {
    let current = true;
    void (
      conversationId ? engine.history(conversationId) : Promise.resolve([])
    ).then((entries) => {
      if (current) setHistory(entries.filter(readable));
    });
    return () => {
      current = false;
    };
  }, [engine, conversationId]);

  function toggle(id: string, on: boolean) {
    setChosen((before) => {
      const after = new Set(before);
      if (on) after.add(id);
      else after.delete(id);
      return after;
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (chosen.size === 0) {
      setProblem("Velg minst én melding å sende inn.");
      return;
    }
    if (chosen.size > privateMessageCopyLimit) {
      setProblem(
        `Du kan sende inn høyst ${privateMessageCopyLimit} meldinger om gangen.`,
      );
      return;
    }
    setProblem(null);
    const privateMessages: PrivateMessageCopy[] = history
      .filter((entry) => chosen.has(entry.id))
      .map((entry) => ({
        conversationId,
        messageId: entry.id,
        senderUserId: entry.own ? userId : (entry.senderUserId ?? ""),
        sentAt: entry.sentAt,
        body: entry.text,
      }));
    void command.run({ body, privateMessages });
  }

  const others =
    conversations?.find((each) => each.conversationId === conversationId)
      ?.others ?? [];
  const sender = (entry: Readable) =>
    entry.own
      ? "Deg"
      : (others.find((other) => other.userId === entry.senderUserId)
          ?.realName ?? "Ukjent avsender");

  return (
    <>
      <h1>Send inn meldinger</h1>
      <p className="link-row">
        <Link href={caseHref(caseId)}>Tilbake til {title}</Link>
      </p>
      <p>
        Velg meldinger fra en privat samtale. Saksbehandleren får en lesbar kopi
        av bare dem, sammen med innlegget ditt, og aldri resten av samtalen.
        Kopien blir en del av saken, og Lånbort kan ikke bekrefte at den er lik
        originalen.
      </p>
      <form onSubmit={submit}>
        <Field id="samtale" label="Samtale">
          <select
            id="samtale"
            value={conversationId}
            onChange={(event) => {
              setChosen(new Set());
              setConversationId(event.target.value);
            }}
            required
          >
            <option value="">Velg en samtale</option>
            {(conversations ?? []).map((conversation) => (
              <option
                key={conversation.conversationId}
                value={conversation.conversationId}
              >
                {nameOf(conversation)}
              </option>
            ))}
          </select>
        </Field>
        {conversationId && (
          <fieldset>
            <legend>Meldinger</legend>
            {history.length === 0 ? (
              <p className="quiet">
                Ingen meldinger denne enheten kan lese i samtalen.
              </p>
            ) : (
              history.map((entry) => (
                <div key={entry.id} className="checkbox">
                  <input
                    type="checkbox"
                    id={`melding-${entry.id}`}
                    checked={chosen.has(entry.id)}
                    onChange={(event) => toggle(entry.id, event.target.checked)}
                  />
                  <label htmlFor={`melding-${entry.id}`}>
                    {sender(entry)}, {time(entry.sentAt)}: {entry.text}
                  </label>
                </div>
              ))
            )}
          </fieldset>
        )}
        <Field
          id="innlegg"
          label="Innlegg"
          help="Si kort hva meldingene viser."
        >
          <textarea
            id="innlegg"
            rows={4}
            required
            maxLength={caseEntryBodySchema.maxLength ?? undefined}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            {...describedBy("innlegg", true)}
          />
        </Field>
        <div className="actions">
          <BusyButton type="submit" busy={command.pending}>
            {chosen.size === 1
              ? "Send inn 1 melding"
              : `Send inn ${chosen.size} meldinger`}
          </BusyButton>
        </div>
        <ErrorText>{problem ?? command.error}</ErrorText>
      </form>
    </>
  );
}

export function CaseEvidence({
  caseId,
  title,
}: {
  caseId: string;
  title: string;
}) {
  return (
    <ReadyChat header={<h1>Send inn meldinger</h1>}>
      {(engine) => <Choose engine={engine} caseId={caseId} title={title} />}
    </ReadyChat>
  );
}

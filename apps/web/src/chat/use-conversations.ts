"use client";

import type { ChatConversation } from "@lanbort/contracts";
import { useEffect, useRef, useState } from "react";
import { chatApi } from "./api";
import { useEngineVersion } from "./chat-provider";
import type { ChatEngine, HistoryEntry } from "./engine";
import { chatErrorMessage } from "./messages";
import { firstUnseen } from "./unread";

/** What the device itself knows of a conversation, for its row. */
export interface ConversationSummary {
  /** The newest message on this device, if any. */
  last: HistoryEntry | null;
  /** A message from someone else since the conversation was last shown. */
  isNew: boolean;
}

/**
 * The account's conversations from the server, with what this device holds
 * of each: the newest message and whether something is new here. Both
 * follow the engine as messages arrive.
 */
export function useConversations(engine: ChatEngine) {
  const version = useEngineVersion(engine);
  const [conversations, setConversations] = useState<ChatConversation[]>();
  const [summaries, setSummaries] = useState<
    ReadonlyMap<string, ConversationSummary>
  >(new Map());
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    chatApi
      .conversations()
      .then(async ({ conversations: list }) => {
        const entries = await Promise.all(
          list.map(async (c) => {
            const [history, seen] = await Promise.all([
              engine.history(c.conversationId),
              engine.seen(c.conversationId),
            ]);
            const summary: ConversationSummary = {
              last: history.at(-1) ?? null,
              isNew: firstUnseen(history, seen) !== null,
            };
            return [c.conversationId, summary] as const;
          }),
        );
        if (!current) return;
        setConversations(list);
        setSummaries(new Map(entries));
        setError(null);
      })
      .catch((problem: unknown) => {
        if (current) setError(chatErrorMessage(problem));
      });
    return () => {
      current = false;
    };
  }, [engine, version, attempt]);

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

  return {
    conversations,
    summaries,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}

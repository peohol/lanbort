"use client";

import { chatLimits } from "@lanbort/contracts";
import {
  type LinkedArchive,
  openArchive,
  sealArchive,
  wipe,
} from "@lanbort/e2ee";
import { z } from "zod";
import { chatApi } from "./api";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./bytes";
import type { HistoryEntry } from "./engine";

/**
 * Moving a device's history to a device being linked (ADR-0010 §5, KF5
 * screen 12): only when the user chooses it, and only what this device
 * holds. It is encrypted here under a key that reaches the new device only
 * in the sealed link package; the server stores the ciphertext briefly.
 */

/** One conversation's history and how far it has been read. */
export interface ConversationHistory {
  id: string;
  history: HistoryEntry[];
  seen: string | null;
}

const entrySchema = z.strictObject({
  id: z.string(),
  senderUserId: z.string().nullable(),
  own: z.boolean(),
  text: z.string().nullable(),
  sentAt: z.string().nullable(),
});

const archiveSchema = z.strictObject({
  v: z.literal(1),
  conversations: z.array(
    z.strictObject({
      id: z.string(),
      history: z.array(entrySchema),
      seen: z.string().nullable(),
    }),
  ),
});

/** The most an archive can hold. */
const archiveBytes = chatLimits.archivePartBytes * chatLimits.archiveParts;

const encode = (conversations: readonly ConversationHistory[]) =>
  utf8(JSON.stringify({ v: 1, conversations }));

/**
 * The history as an archive's plaintext. A message still waiting to be sent
 * stays behind: the new device would send it again. If it is all too much,
 * the oldest messages are left out.
 */
export function packHistory(
  conversations: readonly ConversationHistory[],
  maxBytes = archiveBytes,
): Uint8Array {
  let kept = conversations.map((conversation) => ({
    ...conversation,
    history: conversation.history
      .filter((entry) => !entry.unsent)
      .map(({ id, senderUserId, own, text, sentAt }) => ({
        id,
        senderUserId,
        own,
        text,
        sentAt,
      })),
  }));
  let packed = encode(kept);

  while (packed.length > maxBytes) {
    const times = kept
      .flatMap((conversation) => conversation.history)
      .map((entry) => entry.sentAt ?? "")
      .sort();
    // A tenth of the oldest at a time, so it ends after a few rounds.
    const cutoff = times[Math.ceil(times.length / 10) - 1] ?? "";
    kept = kept.map((conversation) => ({
      ...conversation,
      history: conversation.history.filter(
        (entry) => (entry.sentAt ?? "") > cutoff,
      ),
    }));
    wipe(packed);
    packed = encode(kept);
  }

  return packed;
}

/** The archive's conversations; it throws on anything else. */
export const unpackHistory = (plaintext: Uint8Array): ConversationHistory[] =>
  archiveSchema.parse(JSON.parse(fromUtf8(plaintext))).conversations;

/**
 * The device's own history with the moved one, each message once and in
 * the order it was sent. What the device already has wins.
 */
export function mergeHistory(
  own: readonly HistoryEntry[],
  moved: readonly HistoryEntry[],
): HistoryEntry[] {
  const known = new Set(own.map((entry) => entry.id));
  const order = (entry: HistoryEntry) => entry.sentAt ?? "￿";

  return [...moved.filter((entry) => !known.has(entry.id)), ...own].sort(
    (a, b) => order(a).localeCompare(order(b)),
  );
}

/** Encrypts the history and stores it, for the link package to point to. */
export async function sendHistory(
  plaintext: Uint8Array,
): Promise<LinkedArchive> {
  const { key, parts } = await sealArchive(plaintext);
  wipe(plaintext);
  const { archiveId } = await chatApi.createArchive(parts.length);

  for (const [index, part] of parts.entries()) {
    await chatApi.putArchivePart(archiveId, index, toBase64(part));
  }

  return { archiveId, parts: parts.length, key };
}

/** Fetches and opens the moved history, then removes it from the server. */
export async function receiveHistory(
  archive: LinkedArchive,
): Promise<Uint8Array> {
  try {
    const parts: Uint8Array[] = [];
    for (let index = 0; index < archive.parts; index++) {
      const { data } = await chatApi.archivePart(archive.archiveId, index);
      parts.push(fromBase64(data));
    }
    return await openArchive(archive.key.reveal(), parts);
  } finally {
    await chatApi.deleteArchive(archive.archiveId).catch(() => undefined);
  }
}

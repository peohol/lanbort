"use client";

import { type CreateChatArchive, chatLimits } from "@lanbort/contracts";
import {
  type LinkedArchive,
  openArchive,
  sealArchive,
  wipe,
} from "@lanbort/e2ee";
import { z } from "zod";
import { ChatApiError, chatApi } from "./api";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./bytes";
import type { HistoryEntry } from "./engine";

/**
 * Moving a device's history to a device being linked (ADR-0010 §5, KF5
 * screen 12): only when the user chooses it, and only what this device
 * holds. It is encrypted here under a key that reaches the new device only
 * in the sealed link package; the server stores the ciphertext briefly.
 * The recovery key's backup (§8) is the same archive, its key sealed in the
 * backup instead.
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
 * How far a conversation was read, on a message the archive keeps: the
 * last kept one at or before the marker, so what was read stays read and
 * what came after stays new. None when every message up to it is left out.
 */
export function keptSeen(
  history: readonly HistoryEntry[],
  kept: readonly HistoryEntry[],
  seen: string | null,
): string | null {
  const at = history.findIndex((entry) => entry.id === seen);
  // No marker, or one already gone: the same on the new device.
  if (at === -1) return seen;
  const keptIds = new Set(kept.map((entry) => entry.id));
  return (
    history.slice(0, at + 1).findLast((entry) => keptIds.has(entry.id))?.id ??
    null
  );
}

/**
 * The history as an archive's plaintext. A message still waiting to be sent
 * stays behind: the new device would send it again. If it is all too much,
 * the oldest messages are left out.
 */
export function packHistory(
  conversations: readonly ConversationHistory[],
  maxBytes = archiveBytes,
): Uint8Array {
  const encodeKept = (kept: readonly HistoryEntry[][]) =>
    encode(
      conversations.map(({ id, history, seen }, index) => ({
        id,
        history: kept[index]!.map(
          ({ id, senderUserId, own, text, sentAt }) => ({
            id,
            senderUserId,
            own,
            text,
            sentAt,
          }),
        ),
        seen: keptSeen(history, kept[index]!, seen),
      })),
    );
  let kept = conversations.map(({ history }) =>
    history.filter((entry) => !entry.unsent),
  );
  let packed = encodeKept(kept);

  while (packed.length > maxBytes) {
    const times = kept
      .flat()
      .map((entry) => entry.sentAt ?? "")
      .sort();
    // A tenth of the oldest at a time, so it ends after a few rounds.
    const cutoff = times[Math.ceil(times.length / 10) - 1] ?? "";
    kept = kept.map((history) =>
      history.filter((entry) => (entry.sentAt ?? "") > cutoff),
    );
    wipe(packed);
    packed = encodeKept(kept);
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

type WithoutParts<T> = T extends unknown ? Omit<T, "partCount"> : never;

/** What an archive is for: a device's link request, or the backup. */
export type ArchiveTarget = WithoutParts<CreateChatArchive>;

/** Encrypts the history and stores it, for a package to point to. */
export async function sendHistory(
  plaintext: Uint8Array,
  target: ArchiveTarget,
): Promise<LinkedArchive> {
  const { key, parts } = await sealArchive(plaintext);
  wipe(plaintext);
  const { archiveId } = await chatApi.createArchive({
    ...target,
    partCount: parts.length,
  });

  for (const [index, part] of parts.entries()) {
    await chatApi.putArchivePart(archiveId, index, toBase64(part));
  }

  return { archiveId, parts: parts.length, key };
}

/**
 * Fetches and opens the moved history. It stays on the server until the
 * caller has stored it, so a lost connection can be tried again.
 */
export async function receiveHistory(
  archive: LinkedArchive,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for (let index = 0; index < archive.parts; index++) {
    const { data } = await chatApi.archivePart(archive.archiveId, index);
    parts.push(fromBase64(data));
  }
  return openArchive(archive.key.reveal(), parts);
}

/**
 * Whether trying again cannot help: the archive is gone or expired, or it
 * does not open. A lost connection or a busy server can.
 */
export const historyLost = (error: unknown) =>
  !(error instanceof ChatApiError) ||
  error.code === "not_found" ||
  error.code === "forbidden";

/**
 * Whether a conversation may have messages from before this device was
 * linked that never came here (13): it was started earlier, and nothing
 * from before the link was moved here.
 */
export const missesEarlier = (
  linkedAt: string,
  startedAt: string,
  history: readonly HistoryEntry[],
) =>
  Date.parse(startedAt) < Date.parse(linkedAt) &&
  !history.some(
    ({ sentAt }) =>
      sentAt !== null && Date.parse(sentAt) < Date.parse(linkedAt),
  );

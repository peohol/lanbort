import {
  chatArchivePartSchema,
  chatArchivePartTargetSchema,
  chatArchiveProgressSchema,
  chatArchiveSchema,
  chatArchiveTargetSchema,
  chatDoneSchema,
  createChatArchiveSchema,
  putChatArchivePartSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { rateLimits } from "../abuse/rate-limits";
import type { Actor } from "../actor";
import { defineCommand } from "../commands/command";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import { actingUserId } from "../objects/state";
import { chatRetention } from "./model";
import {
  createChatArchivePolicy,
  deleteChatArchivePolicy,
  putChatArchivePartPolicy,
  readChatArchivePartPolicy,
} from "./policies";
import { fromBase64, toBase64 } from "./signatures";
import { lockChatAccount, sessionDevice } from "./store";

/**
 * History archives (ADR-0010 §5, §8). When a new device is linked, the
 * approving device may move its history to it: it encrypts the history on
 * the device under a key of its own, stores the ciphertext here in parts,
 * and seals the key in the link package. The server keeps only what it
 * cannot read, for the account's own devices, briefly.
 */

type Db = Kysely<Database>;

interface ArchiveRow {
  id: string;
  user_id: string;
  part_count: number;
  completed_at: Date | null;
  expires_at: Date;
}

async function loadArchive(
  db: Db,
  archiveId: string,
  options: { lock?: boolean } = {},
): Promise<ArchiveRow | undefined> {
  let query = db
    .selectFrom("app.chat_archives")
    .select(["id", "user_id", "part_count", "completed_at", "expires_at"])
    .where("id", "=", archiveId);

  if (options.lock) {
    query = query.forUpdate();
  }

  return query.executeTakeFirst();
}

/** The caller's device, and whether the archive is its account's. */
async function archiveResource(
  db: Db,
  actor: Actor,
  archiveId: string,
  usable: (archive: ArchiveRow) => boolean,
  options: { lock?: boolean } = {},
) {
  const [device, archive] = await Promise.all([
    sessionDevice(db, actor),
    loadArchive(db, archiveId, options),
  ]);

  return {
    resource: {
      hasDevice: device !== null,
      own:
        archive !== undefined &&
        archive.user_id === actingUserId(actor) &&
        usable(archive),
      archive,
    },
    context: undefined,
  };
}

/**
 * The approving device starts an archive while a new device waits to be
 * linked; it replaces the account's earlier one, so there is at most one.
 */
export const createChatArchive = defineCommand({
  name: "chat.create_archive",
  input: createChatArchiveSchema,
  output: chatArchiveSchema,
  policy: createChatArchivePolicy,
  rateLimit: rateLimits.chatArchives,
  idempotency: "required",
  load: async ({ tx, actor }) => {
    await lockChatAccount(tx, actingUserId(actor));
    const device = await sessionDevice(tx, actor, { lock: true });

    return { resource: { hasDevice: device !== null }, context: undefined };
  },
  execute: async ({ tx, actor, input, now }) => {
    const userId = actingUserId(actor);
    const waiting = await tx
      .selectFrom("app.chat_link_requests")
      .select("id")
      .where("user_id", "=", userId)
      .where("approved_at", "is", null)
      .where("expires_at", ">", now)
      .executeTakeFirst();

    if (!waiting) {
      throw new DomainError("conflict", "No device is waiting to be linked");
    }

    await tx
      .deleteFrom("app.chat_archives")
      .where("user_id", "=", userId)
      .execute();
    const archive = await tx
      .insertInto("app.chat_archives")
      .values({
        user_id: userId,
        purpose: "link",
        part_count: input.partCount,
        created_at: now,
        expires_at: new Date(now.getTime() + chatRetention.archiveMs),
      })
      .returning(["id", "expires_at"])
      .executeTakeFirstOrThrow();

    return {
      archiveId: archive.id,
      expiresAt: archive.expires_at.toISOString(),
    };
  },
});

/** One part, once. The archive can be read when the last part is in. */
export const putChatArchivePart = defineCommand({
  name: "chat.put_archive_part",
  input: putChatArchivePartSchema,
  output: chatArchiveProgressSchema,
  policy: putChatArchivePartPolicy,
  rateLimit: rateLimits.chatArchives,
  idempotency: "required",
  load: ({ tx, actor, input, now }) =>
    archiveResource(
      tx,
      actor,
      input.archiveId,
      (archive) =>
        archive.completed_at === null &&
        archive.expires_at > now &&
        input.part < archive.part_count,
      { lock: true },
    ),
  execute: async ({ tx, input, resource, now }) => {
    const archive = resource.archive!;
    const stored = await tx
      .insertInto("app.chat_archive_parts")
      .values({
        archive_id: archive.id,
        part: input.part,
        data: fromBase64(input.data),
      })
      .onConflict((oc) => oc.doNothing())
      .returning("part")
      .executeTakeFirst();

    if (!stored) {
      throw new DomainError("conflict", "The part is already stored");
    }

    const { parts } = await tx
      .selectFrom("app.chat_archive_parts")
      .select(({ fn }) => fn.countAll<string>().as("parts"))
      .where("archive_id", "=", archive.id)
      .executeTakeFirstOrThrow();
    const complete = Number(parts) === archive.part_count;

    if (complete) {
      await tx
        .updateTable("app.chat_archives")
        .set({ completed_at: now })
        .where("id", "=", archive.id)
        .execute();
    }

    return { complete };
  },
});

/** A device of the account reads a complete archive, part by part. */
export const readChatArchivePart = defineQuery({
  name: "chat.read_archive_part",
  input: chatArchivePartTargetSchema,
  policy: readChatArchivePartPolicy,
  load: async ({ db, actor, input, now }) => {
    const loaded = await archiveResource(
      db,
      actor,
      input.archiveId,
      (archive) =>
        archive.completed_at !== null &&
        archive.expires_at > now &&
        input.part < archive.part_count,
    );
    const part = loaded.resource.own
      ? await db
          .selectFrom("app.chat_archive_parts")
          .select("data")
          .where("archive_id", "=", input.archiveId)
          .where("part", "=", input.part)
          .executeTakeFirstOrThrow()
      : null;

    return { ...loaded, resource: { ...loaded.resource, part } };
  },
  present: ({ resource }) =>
    chatArchivePartSchema.parse({ data: toBase64(resource.part!.data) }),
});

/** The new device has the history, or the user gave up: it is gone. */
export const deleteChatArchive = defineCommand({
  name: "chat.delete_archive",
  input: chatArchiveTargetSchema,
  output: chatDoneSchema,
  policy: deleteChatArchivePolicy,
  idempotency: "required",
  load: ({ tx, actor, input }) =>
    archiveResource(tx, actor, input.archiveId, () => true, { lock: true }),
  execute: async ({ tx, input }) => {
    await tx
      .deleteFrom("app.chat_archives")
      .where("id", "=", input.archiveId)
      .execute();

    return {};
  },
});

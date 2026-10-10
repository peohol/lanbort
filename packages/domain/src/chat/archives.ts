import {
  type ChatArchivePurpose,
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
 * and seals the key in the link package. The recovery key's backup works
 * the same way, with the key sealed in the backup. The server keeps only
 * what it cannot read, for the account's own devices: a link's briefly, a
 * backup's for as long as the backup points to it.
 */

type Db = Kysely<Database>;

export interface ArchiveRow {
  id: string;
  user_id: string;
  purpose: string;
  part_count: number;
  completed_at: Date | null;
  expires_at: Date;
  /** The backup points to it, so it is kept past its expiry. */
  attached: boolean;
}

async function loadArchive(
  db: Db,
  archiveId: string,
  options: { lock?: boolean } = {},
): Promise<ArchiveRow | undefined> {
  let query = db
    .selectFrom("app.chat_archives as archive")
    .select(({ exists, selectFrom }) => [
      "archive.id",
      "archive.user_id",
      "archive.purpose",
      "archive.part_count",
      "archive.completed_at",
      "archive.expires_at",
      exists(
        selectFrom("app.chat_recovery_keys as recovery")
          .select("recovery.user_id")
          .whereRef("recovery.archive_id", "=", "archive.id"),
      )
        .$castTo<boolean>()
        .as("attached"),
    ])
    .where("archive.id", "=", archiveId);

  if (options.lock) {
    query = query.forUpdate("archive");
  }

  return query.executeTakeFirst();
}

/** Still there to be read: not expired, or kept by the backup. */
export const archiveLive = (archive: ArchiveRow, now: Date) =>
  archive.attached || archive.expires_at > now;

/** The caller's device, and whether the archive is its account's. */
export async function archiveResource(
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
 * A device starts an archive: for a device waiting to be linked, or for the
 * recovery key's backup. Each replaces the account's earlier one of its
 * kind, except the archive the backup points to, so there is at most one
 * of each being made.
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

    if (!(await archiveWanted[input.purpose](tx, userId, now))) {
      throw new DomainError(
        "conflict",
        input.purpose === "link"
          ? "No device is waiting to be linked"
          : "The account has no recovery key",
      );
    }

    await unattachedArchives(tx, userId)
      .where("purpose", "=", input.purpose)
      .execute();
    const archive = await tx
      .insertInto("app.chat_archives")
      .values({
        user_id: userId,
        purpose: input.purpose,
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

/** Whether the account has a use for a new archive of the kind. */
const archiveWanted: Record<
  ChatArchivePurpose,
  (tx: Db, userId: string, now: Date) => Promise<boolean>
> = {
  link: async (tx, userId, now) =>
    (await tx
      .selectFrom("app.chat_link_requests")
      .select("id")
      .where("user_id", "=", userId)
      .where("approved_at", "is", null)
      .where("expires_at", ">", now)
      .executeTakeFirst()) !== undefined,
  backup: async (tx, userId) =>
    (await tx
      .selectFrom("app.chat_recovery_keys")
      .select("user_id")
      .where("user_id", "=", userId)
      .executeTakeFirst()) !== undefined,
};

/** The archive the recovery key's backup points to; kept while it does. */
const attachedArchives = (db: Db) =>
  db
    .selectFrom("app.chat_recovery_keys")
    .select("archive_id")
    .where("archive_id", "is not", null);

/** Deletes the account's archives the backup does not point to. */
export const unattachedArchives = (db: Db, userId: string) =>
  db
    .deleteFrom("app.chat_archives")
    .where("user_id", "=", userId)
    .where("id", "not in", attachedArchives(db));

/** Expired archives, except the one a backup points to. */
export const expiredArchives = (db: Db, now: Date) =>
  db
    .deleteFrom("app.chat_archives")
    .where("expires_at", "<=", now)
    .where("id", "not in", attachedArchives(db));

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
        archiveLive(archive, now) &&
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

/**
 * The new device has the history, or the user gave up: it is gone. The
 * archive the backup points to stays; a newer backup replaces it.
 */
export const deleteChatArchive = defineCommand({
  name: "chat.delete_archive",
  input: chatArchiveTargetSchema,
  output: chatDoneSchema,
  policy: deleteChatArchivePolicy,
  idempotency: "required",
  load: ({ tx, actor, input }) =>
    archiveResource(tx, actor, input.archiveId, () => true, { lock: true }),
  execute: async ({ tx, actor, input }) => {
    await unattachedArchives(tx, actingUserId(actor))
      .where("id", "=", input.archiveId)
      .execute();

    return {};
  },
});

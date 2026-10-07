import {
  type OwnProfilePicture,
  ownProfilePictureSchema,
  type ProfilePictureVisibility,
  profilePictureTargetSchema,
  profilePictureVisibilityInputSchema,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { z } from "zod";
import { type Actor, actorScope } from "../actor";
import type { AccountDeletionStep } from "../account/deletion";
import {
  type CommandResult,
  type DomainContext,
  defineCommand,
  executeCommand,
} from "../commands/command";
import { idempotencyKeyPattern } from "../commands/idempotency";
import { defineQuery } from "../commands/query";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import {
  type ImageServices,
  type ImageStore,
  readImageFile,
  requireUploadKey,
  uploadedImageId,
  uploadGraceMs,
} from "../objects/images";
import { actingUserId, inSnapshot } from "../objects/state";
import { defineConsumer, OutboxDeliveryError } from "../outbox/consumer";
import {
  profilePictureChanged,
  profilePictureRemoved,
  profilePictureUploadStarted,
  profilePictureVisibilityChanged,
} from "./events";
import {
  changeProfilePicturePolicy,
  type OwnProfile,
  readProfilePicturePolicy,
} from "./policies";
import { loadPeople } from "./store";

type Db = Kysely<Database>;

/**
 * Profile pictures (PS-USR-002). The browser crops and compresses the
 * picture; the server re-encodes it without metadata, stores it privately
 * and registers it as the profile's one picture. Who sees it follows the
 * person's choice and, in any case, only those who may open their page
 * (`pictureVisible`).
 */

/** Where a picture's file lives. Derived from ids only, never from input. */
export function profilePictureKey(userId: string, pictureId: string): string {
  return `people/${userId}/${pictureId}.webp`;
}

interface OwnPicture extends OwnProfile {
  readonly pictureId: string | null;
  readonly visibility: ProfilePictureVisibility;
}

/** The caller's own profile and its picture; null without a profile. */
async function loadOwnPicture(
  db: Db,
  actor: Actor,
  options: { lock?: boolean } = {},
): Promise<{ resource: OwnPicture; context: undefined } | null> {
  if (actor.kind !== "user") {
    return null;
  }

  let query = db
    .selectFrom("app.profiles as profile")
    .leftJoin(
      "app.profile_pictures as picture",
      "picture.user_id",
      "profile.user_id",
    )
    .select([
      "profile.user_id as userId",
      "profile.picture_visibility as visibility",
      "picture.id as pictureId",
    ])
    .where("profile.user_id", "=", actor.userId);

  if (options.lock) {
    query = query.forUpdate("profile");
  }

  const row = await query.executeTakeFirst();

  return row
    ? {
        resource: {
          userId: row.userId,
          pictureId: row.pictureId,
          visibility: row.visibility as ProfilePictureVisibility,
        },
        context: undefined,
      }
    : null;
}

const ownPicture = (resource: OwnPicture): OwnProfilePicture => ({
  pictureId: resource.pictureId,
  visibility: resource.visibility,
});

/**
 * Runs before an upload is processed or stored: authorizes and durably
 * records the intent, so {@link profilePictureFileCleanup} deletes the file
 * should it never be registered. An upload whose registration already
 * completed is a retry, whose stored result is replayed.
 */
const preparePicture = defineCommand({
  name: "profile_picture.prepare",
  input: z.strictObject({
    pictureId: z.uuid(),
    uploadKey: z.string().regex(idempotencyKeyPattern),
  }),
  output: z.strictObject({ completed: z.boolean() }),
  policy: changeProfilePicturePolicy,
  idempotency: "none",
  load: ({ tx, actor }) => loadOwnPicture(tx, actor),
  execute: async ({ tx, actor, input, resource, events }) => {
    const completed = await tx
      .selectFrom("app.idempotency_records")
      .select("idempotency_key")
      .where("scope", "=", actorScope(actor) as string)
      .where("command", "=", setProfilePicture.name)
      .where("idempotency_key", "=", input.uploadKey)
      .executeTakeFirst();

    if (!completed) {
      events.record(profilePictureUploadStarted, {
        resourceId: resource.userId,
        payload: { pictureId: input.pictureId },
      });
    }

    return { completed: completed !== undefined };
  },
});

/**
 * Registers a picture whose file is already stored, in place of the
 * profile's earlier one. Only called by {@link uploadProfilePicture}, which
 * stores the validated file first.
 */
const setProfilePicture = defineCommand({
  name: "profile_picture.set",
  input: z.strictObject({
    pictureId: z.uuid(),
    byteSize: z.int().min(1),
    width: z.int().min(1),
    height: z.int().min(1),
  }),
  output: ownProfilePictureSchema,
  policy: changeProfilePicturePolicy,
  idempotency: "required",
  load: ({ tx, actor }) => loadOwnPicture(tx, actor, { lock: true }),
  execute: async ({ tx, input, resource, events, now }) => {
    await tx
      .insertInto("app.profile_pictures")
      .values({
        user_id: resource.userId,
        id: input.pictureId,
        content_type: "image/webp",
        byte_size: input.byteSize,
        width: input.width,
        height: input.height,
        created_at: now,
      })
      .onConflict((conflict) =>
        conflict.column("user_id").doUpdateSet((eb) => ({
          id: eb.ref("excluded.id"),
          byte_size: eb.ref("excluded.byte_size"),
          width: eb.ref("excluded.width"),
          height: eb.ref("excluded.height"),
          created_at: eb.ref("excluded.created_at"),
        })),
      )
      .execute();
    events.record(profilePictureChanged, {
      resourceId: resource.userId,
      payload: {
        pictureId: input.pictureId,
        replacedPictureId: resource.pictureId,
      },
    });

    return ownPicture({ ...resource, pictureId: input.pictureId });
  },
});

export interface UploadProfilePictureRequest {
  readonly actor: Actor;
  readonly bytes: Uint8Array;
  readonly idempotencyKey?: string | undefined;
  readonly correlationId?: string | undefined;
}

/**
 * Sets the caller's profile picture (PS-USR-002): authorize and record the
 * intent, re-encode without metadata, store the file, then register it in
 * one command. A stored file that never gets registered, and the picture it
 * replaces, are deleted from the outbox. Retry-safe with the same
 * idempotency key: a retry stores nothing and replays the first result.
 */
export async function uploadProfilePicture(
  domain: DomainContext,
  services: ImageServices,
  request: UploadProfilePictureRequest,
): Promise<CommandResult<OwnProfilePicture>> {
  const uploadKey = requireUploadKey(request.idempotencyKey);
  // Unauthenticated actors have no scope; the policy below refuses them.
  const pictureId = uploadedImageId(
    "profile-picture",
    actorScope(request.actor) ?? "",
    uploadKey,
    request.bytes,
  );
  const prepared = await executeCommand(domain, preparePicture, {
    actor: request.actor,
    input: { pictureId, uploadKey },
    correlationId: request.correlationId,
  });
  const image = await services.process(request.bytes);

  if (!image) {
    throw new DomainError("invalid_input", "Not an accepted image", ["image"]);
  }

  if (!prepared.output.completed) {
    await services.store.put(
      profilePictureKey(actingUserId(request.actor), pictureId),
      image.bytes,
      image.contentType,
    );
  }

  return executeCommand(domain, setProfilePicture, {
    actor: request.actor,
    input: {
      pictureId,
      byteSize: image.bytes.byteLength,
      width: image.width,
      height: image.height,
    },
    idempotencyKey: uploadKey,
    correlationId: request.correlationId,
  });
}

/**
 * The profile's picture goes, if it has one (only when it is `pictureId`,
 * if given); the file after commit. Whether one was removed.
 */
export async function removePicture(
  db: Db,
  userId: string,
  events: EventRecorder,
  pictureId?: string,
): Promise<boolean> {
  let query = db
    .deleteFrom("app.profile_pictures")
    .where("user_id", "=", userId);

  if (pictureId !== undefined) {
    query = query.where("id", "=", pictureId);
  }

  const removed = await query.returning("id").executeTakeFirst();

  if (removed) {
    events.record(profilePictureRemoved, {
      resourceId: userId,
      payload: { pictureId: removed.id },
    });
  }

  return removed !== undefined;
}

/** Removes the caller's picture. Removing none again changes nothing. */
export const removeProfilePicture = defineCommand({
  name: "profile_picture.remove",
  input: z.strictObject({}),
  output: ownProfilePictureSchema,
  policy: changeProfilePicturePolicy,
  idempotency: "none",
  load: ({ tx, actor }) => loadOwnPicture(tx, actor, { lock: true }),
  execute: async ({ tx, resource, events }) => {
    await removePicture(tx, resource.userId, events);

    return ownPicture({ ...resource, pictureId: null });
  },
});

/** Sets who sees the profile's picture, when that changes it. */
export async function changeVisibility(
  db: Db,
  profile: { readonly userId: string; readonly visibility: string },
  visibility: ProfilePictureVisibility,
  events: EventRecorder,
  now: Date,
): Promise<boolean> {
  if (visibility === profile.visibility) {
    return false;
  }

  await db
    .updateTable("app.profiles")
    .set({ picture_visibility: visibility, updated_at: now })
    .where("user_id", "=", profile.userId)
    .execute();
  events.record(profilePictureVisibilityChanged, {
    resourceId: profile.userId,
    payload: { visibility },
  });

  return true;
}

/**
 * Who sees the caller's picture (PS-USR-002): generally, friends or only
 * the caller. The choice stays when the picture is replaced or removed.
 */
export const setProfilePictureVisibility = defineCommand({
  name: "profile_picture.set_visibility",
  input: profilePictureVisibilityInputSchema,
  output: ownProfilePictureSchema,
  policy: changeProfilePicturePolicy,
  idempotency: "none",
  load: ({ tx, actor }) => loadOwnPicture(tx, actor, { lock: true }),
  execute: async ({ tx, input, resource, events, now }) => {
    await changeVisibility(tx, resource, input.visibility, events, now);

    return ownPicture({ ...resource, visibility: input.visibility });
  },
});

/**
 * Authorizes reading a picture by its id: the current picture of a person
 * the caller may see it of. Any other id, also a replaced picture's, is
 * `not_found`.
 */
export const profilePictureFile = defineQuery({
  name: "profile_picture.read",
  input: profilePictureTargetSchema,
  policy: readProfilePicturePolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      if (actor.kind !== "user") {
        return null;
      }

      const picture = await tx
        .selectFrom("app.profile_pictures")
        .select("user_id")
        .where("id", "=", input.pictureId)
        .executeTakeFirst();
      const person =
        picture &&
        (await loadPeople(tx, actor.userId, [picture.user_id], now)).get(
          picture.user_id,
        );

      return person ? { resource: person, context: undefined } : null;
    }),
  present: ({ resource }) => ({
    key: profilePictureKey(resource.userId, resource.picture!.id),
    contentType: "image/webp",
  }),
});

/** The picture's file, for those who may see it. */
export function readProfilePicture(
  domain: Pick<DomainContext, "db" | "clock">,
  store: ImageStore,
  request: { actor: Actor; input: unknown },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  return readImageFile(domain, store, profilePictureFile, request);
}

/** PS-ADM-006: the picture goes with the profile. */
export const profilePictureDeletionStep: AccountDeletionStep = {
  name: "profile_picture",
  run: async (db, userId, _now, events) => {
    await removePicture(db, userId, events);
  },
};

export interface ProfilePictureFileCleanupOptions {
  readonly store: () => ImageStore | undefined;
  readonly db: () => Kysely<Database>;
  /** See {@link uploadGraceMs}. */
  readonly uploadGraceMs?: number;
}

/**
 * Deletes picture files nobody refers to (outbox, at-least-once): the file
 * of a replaced or removed picture, and of an upload that was never
 * registered once it can no longer be running. Deleting is idempotent, so
 * redelivery is harmless.
 */
export function profilePictureFileCleanup({
  store,
  db,
  uploadGraceMs: graceMs = uploadGraceMs,
}: ProfilePictureFileCleanupOptions) {
  return defineConsumer({
    name: "profile_pictures.delete_file",
    eventTypes: [
      profilePictureUploadStarted.type,
      profilePictureChanged.type,
      profilePictureRemoved.type,
    ],
    handle: async ({ event }) => {
      const files = store();

      if (!files) {
        throw new OutboxDeliveryError("storage_unavailable");
      }

      const remove = (pictureId: string) =>
        files.remove(profilePictureKey(event.resourceId, pictureId));

      switch (event.type) {
        case profilePictureUploadStarted.type: {
          const { pictureId } = profilePictureUploadStarted.payload.parse(
            event.payload,
          );
          const registered = await db()
            .selectFrom("app.profile_pictures")
            .select("id")
            .where("id", "=", pictureId)
            .executeTakeFirst();

          if (registered) {
            // Its file is deleted when the picture is replaced or removed.
            return;
          }

          if (Date.now() - event.occurredAt.getTime() < graceMs) {
            // Retried with backoff until the upload can no longer be running.
            throw new OutboxDeliveryError("upload_in_progress");
          }

          return remove(pictureId);
        }
        case profilePictureChanged.type: {
          const { replacedPictureId } = profilePictureChanged.payload.parse(
            event.payload,
          );
          return replacedPictureId ? remove(replacedPictureId) : undefined;
        }
        default:
          return remove(
            profilePictureRemoved.payload.parse(event.payload).pictureId,
          );
      }
    },
  });
}

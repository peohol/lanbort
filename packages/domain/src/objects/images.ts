import { createHash } from "node:crypto";
import type { Database } from "@lanbort/database";
import {
  type ObjectImageAdded,
  objectImageAddedSchema,
  objectImageCropInputSchema,
  objectImageIdSchema,
  objectIdSchema,
  objectImageMaxCount,
  objectVersionSchema,
} from "@lanbort/contracts";
import type { Kysely } from "kysely";
import { z } from "zod";
import { type Actor, actorScope } from "../actor";
import {
  type CommandResult,
  type DomainContext,
  defineCommand,
  executeCommand,
  parseInput,
} from "../commands/command";
import { rateLimits } from "../abuse/rate-limits";
import { idempotencyKeyPattern } from "../commands/idempotency";
import {
  defineQuery,
  executeQuery,
  type QueryDefinition,
} from "../commands/query";
import { DomainError } from "../errors";
import type { EventRecorder } from "../events/recorder";
import { defineConsumer, OutboxDeliveryError } from "../outbox/consumer";
import {
  objectImageAdded,
  objectImageCropped,
  objectImageRemoved,
  objectImageUploadStarted,
} from "./events";
import { cropPixels, cropShares } from "./image-crop";
import {
  addObjectImagePolicy,
  cropObjectImagePolicy,
  readObjectPolicy,
  removeObjectImagePolicy,
} from "./policies";
import {
  actingUserId,
  bumpVersion,
  loadObjectState,
  type ObjectState,
} from "./state";

/**
 * Images (object images, PS-OBJ-002, and profile pictures, PS-USR-002) are
 * stored by a storage adapter behind these ports, so the domain never sees
 * a vendor API. Each kind has its own private bucket: the server uploads
 * only after validation and hands an image out only after its read policy
 * has allowed it.
 */
export interface ImageStore {
  /** Creates or replaces the file at `key`. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The file's bytes, or null if there is none. */
  get(key: string): Promise<Uint8Array | null>;
  /** Removes the file; removing a missing file succeeds. */
  remove(key: string): Promise<void>;
}

/** An upload decoded and re-encoded by the server, without any metadata. */
export interface ProcessedImage {
  readonly bytes: Uint8Array;
  readonly contentType: "image/webp";
  readonly width: number;
  readonly height: number;
}

/** Null when the bytes are not an accepted image. */
export type ImageProcessor = (
  bytes: Uint8Array,
) => Promise<ProcessedImage | null>;

export interface ImageServices {
  readonly store: ImageStore;
  readonly process: ImageProcessor;
}

/** Where an image's file lives. Derived from ids only, never from input. */
export function objectImageKey(objectId: string, imageId: string): string {
  return `objects/${objectId}/${imageId}.webp`;
}

/**
 * The image id for an upload of `kind`, derived from who uploads, the
 * idempotency key and the bytes. A retry of the same upload gets the same id
 * (and replays the first result); a different upload never collides with an
 * earlier file.
 */
export function uploadedImageId(
  kind: string,
  scope: string,
  key: string,
  bytes: Uint8Array,
): string {
  const content = createHash("sha256").update(bytes).digest("hex");
  const hex = createHash("sha256")
    .update(JSON.stringify([kind, scope, key, content]))
    .digest("hex");

  // RFC 9562 version 8 (custom) UUID.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${((parseInt(hex[16] as string, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

const objectReference = z.strictObject({ objectId: objectIdSchema });

async function loadImageSlot(
  db: DomainContext["db"],
  objectId: string,
  options: { lock?: boolean } = {},
) {
  const state = await loadObjectState(db, objectId, options);

  if (!state) {
    return null;
  }

  const { count } = await db
    .selectFrom("app.object_images")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("object_id", "=", objectId)
    .executeTakeFirstOrThrow();

  return {
    resource: { ...state, imageCount: Number(count) },
    context: undefined,
  };
}

function requireFreeSlot(imageCount: number): void {
  if (imageCount >= objectImageMaxCount) {
    throw new DomainError(
      "conflict",
      "The object has the maximum number of images",
      ["image"],
    );
  }
}

/**
 * Runs before an upload is processed or stored: authorizes, spends the
 * uploads budget, checks for a free slot (the attach command checks again
 * under lock) and durably records the intent, so
 * {@link objectImageFileCleanup} deletes the file should it never be
 * registered. An upload that completed meanwhile is replayed instead.
 */
const prepareObjectImage = defineCommand({
  name: "object.prepare_image",
  input: z.strictObject({
    objectId: objectIdSchema,
    imageId: objectImageIdSchema,
    uploadKey: z.string().regex(idempotencyKeyPattern),
  }),
  output: z.strictObject({ replay: objectImageAddedSchema.nullable() }),
  policy: addObjectImagePolicy,
  idempotency: "none",
  rateLimit: rateLimits.uploads,
  load: ({ tx, input }) => loadImageSlot(tx, input.objectId),
  execute: async ({ tx, actor, input, resource, events }) => {
    const replay = await completedUpload(tx, actor, {
      command: attachObjectImage,
      key: input.uploadKey,
      same: sameObjectImage(input.objectId, input.imageId),
    });

    if (replay) {
      return { replay };
    }

    requireFreeSlot(resource.imageCount);
    events.record(objectImageUploadStarted, {
      resourceId: resource.objectId,
      payload: { imageId: input.imageId },
    });

    return { replay: null };
  },
});

/** Whether a stored result is of the upload of `imageId` to `objectId`. */
function sameObjectImage(objectId: string, imageId: string) {
  return (output: ObjectImageAdded) =>
    output.objectId === objectId && output.imageId === imageId;
}

/**
 * Registers an image whose file is already stored. Only called by
 * {@link uploadObjectImage}, which stores the validated file first.
 */
export const attachObjectImage = defineCommand({
  name: "object.add_image",
  input: z.strictObject({
    objectId: objectIdSchema,
    imageId: objectImageIdSchema,
    byteSize: z.int().min(1),
    width: z.int().min(1),
    height: z.int().min(1),
  }),
  output: objectImageAddedSchema,
  policy: addObjectImagePolicy,
  idempotency: "required",
  load: ({ tx, input }) => loadImageSlot(tx, input.objectId, { lock: true }),
  execute: async ({ tx, actor, input, resource, events, now }) => {
    requireFreeSlot(resource.imageCount);

    await tx
      .insertInto("app.object_images")
      .values({
        id: input.imageId,
        object_id: resource.objectId,
        position: resource.imageCount,
        content_type: "image/webp",
        byte_size: input.byteSize,
        width: input.width,
        height: input.height,
        uploaded_by_user_id: actingUserId(actor),
        created_at: now,
      })
      .execute();

    const version = await bumpVersion(tx, resource, now, {
      actorUserId: actingUserId(actor),
      change: "image_added",
    });
    events.record(objectImageAdded, {
      resourceId: resource.objectId,
      payload: { version, imageId: input.imageId },
    });

    return { objectId: resource.objectId, imageId: input.imageId, version };
  },
});

export interface UploadObjectImageRequest {
  readonly actor: Actor;
  readonly objectId: unknown;
  readonly bytes: Uint8Array;
  readonly idempotencyKey?: string | undefined;
  readonly correlationId?: string | undefined;
}

/**
 * Adds an image to an object (PS-OBJ-002): authorize and record the intent,
 * re-encode without metadata, store the file, then register it in one
 * command. A stored file that never gets registered is deleted from the
 * outbox. Retry-safe with the same idempotency key: a retry of a completed
 * upload processes and stores nothing and replays the first result, and
 * other bytes or another object under that key are refused.
 */
export async function uploadObjectImage(
  domain: DomainContext,
  services: ImageServices,
  request: UploadObjectImageRequest,
): Promise<CommandResult<ObjectImageAdded>> {
  const uploadKey = requireUploadKey(request.idempotencyKey);
  const { objectId } = parseInput(objectReference, {
    objectId: request.objectId,
  });
  // Unauthenticated actors have no scope; the policy below refuses them.
  const imageId = uploadedImageId(
    "object-image",
    actorScope(request.actor) ?? "",
    uploadKey,
    request.bytes,
  );
  const replay =
    (await completedUpload(domain.db, request.actor, {
      command: attachObjectImage,
      key: uploadKey,
      same: sameObjectImage(objectId, imageId),
    })) ??
    (
      await executeCommand(domain, prepareObjectImage, {
        actor: request.actor,
        input: { objectId, imageId, uploadKey },
        correlationId: request.correlationId,
      })
    ).output.replay;

  if (replay) {
    return { output: replay, replayed: true };
  }

  const image = await services.process(request.bytes);

  if (!image) {
    throw new DomainError("invalid_input", "Not an accepted image", ["image"]);
  }

  const file = objectImageKey(objectId, imageId);
  await services.store.put(file, image.bytes, image.contentType);

  const result = await executeCommand(domain, attachObjectImage, {
    actor: request.actor,
    input: {
      objectId,
      imageId,
      byteSize: image.bytes.byteLength,
      width: image.width,
      height: image.height,
    },
    idempotencyKey: uploadKey,
    correlationId: request.correlationId,
  });

  // A concurrent identical upload registered first, and the image may have
  // been removed (with its file) before this one stored the file again.
  if (result.replayed && !(await findImageFile(domain.db, objectId, imageId))) {
    await services.store.remove(file);
  }

  return result;
}

/** A completed upload's registering command and key, for {@link completedUpload}. */
export interface UploadClaim<O> {
  readonly command: { readonly name: string; readonly output: z.ZodType<O> };
  readonly key: string;
  /** Whether the stored result is of this very upload: same bytes and target. */
  readonly same: (output: O) => boolean;
}

/**
 * The first result of the actor's completed upload with this key, so a retry
 * replays it without processing, storing or spending the uploads budget
 * (PS-NFR-005). Another upload under a used key (other bytes or another
 * target) is refused before anything is processed, so a used key never
 * opens a way past the budget.
 */
export async function completedUpload<O>(
  db: Kysely<Database>,
  actor: Actor,
  { command, key, same }: UploadClaim<O>,
): Promise<O | null> {
  const scope = actorScope(actor);

  if (scope === null) {
    return null;
  }

  const record = await db
    .selectFrom("app.idempotency_records")
    .select("response")
    .where("scope", "=", scope)
    .where("command", "=", command.name)
    .where("idempotency_key", "=", key)
    .executeTakeFirst();

  if (!record) {
    return null;
  }

  const output = command.output.parse(record.response);

  if (!same(output)) {
    throw new DomainError(
      "idempotency_key_reused",
      `Idempotency key reused with different input for ${command.name}`,
    );
  }

  return output;
}

/**
 * An upload's idempotency key: required, since a retried upload must find
 * the file and result of the first one.
 */
export function requireUploadKey(key: string | undefined): string {
  if (key === undefined) {
    throw new DomainError(
      "idempotency_key_required",
      "Adding an image requires an idempotency key",
    );
  }

  if (!idempotencyKeyPattern.test(key)) {
    throw new DomainError("invalid_input", "Invalid idempotency key", [
      "idempotencyKey",
    ]);
  }

  return key;
}

/**
 * Removes an image from the object. The file itself is deleted after commit
 * by {@link objectImageFileCleanup}, so a failed deletion is retried.
 */
export const removeObjectImage = defineCommand({
  name: "object.remove_image",
  input: z.strictObject({
    objectId: objectIdSchema,
    imageId: objectImageIdSchema,
  }),
  output: objectVersionSchema,
  policy: removeObjectImagePolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const state = await loadObjectState(tx, input.objectId, { lock: true });
    const image =
      state &&
      (await tx
        .selectFrom("app.object_images")
        .select("position")
        .where("id", "=", input.imageId)
        .where("object_id", "=", state.objectId)
        .executeTakeFirst());

    return state && image
      ? {
          resource: { ...state, imagePosition: image.position },
          context: undefined,
        }
      : null;
  },
  execute: async ({ tx, actor, input, resource, events, now }) => ({
    objectId: resource.objectId,
    version: await removeImage(
      tx,
      resource,
      { imageId: input.imageId, position: resource.imagePosition },
      actingUserId(actor),
      events,
      now,
    ),
  }),
});

/**
 * Removes one image of the locked object as a new version by `actorUserId`.
 * The file goes after commit ({@link objectImageFileCleanup}).
 */
export async function removeImage(
  tx: Kysely<Database>,
  object: ObjectState,
  image: { readonly imageId: string; readonly position: number },
  actorUserId: string,
  events: EventRecorder,
  now: Date,
): Promise<number> {
  await tx
    .deleteFrom("app.object_images")
    .where("id", "=", image.imageId)
    .execute();
  // Keep positions contiguous, so the order and the five slots stay intact.
  await tx
    .updateTable("app.object_images")
    .set((eb) => ({ position: eb("position", "-", 1) }))
    .where("object_id", "=", object.objectId)
    .where("position", ">", image.position)
    .execute();

  const version = await bumpVersion(tx, object, now, {
    actorUserId,
    change: "image_removed",
  });
  events.record(objectImageRemoved, {
    resourceId: object.objectId,
    payload: { version, imageId: image.imageId },
  });

  return version;
}

/**
 * Chooses the square part of one of the object's pictures that is shown
 * where it is shown square (PS-OBJ-002), or the middle again with null.
 * The picture stays whole, so this is no new version of the object's
 * content: it is how the owners frame what they already show.
 */
export const cropObjectImage = defineCommand({
  name: "object.crop_image",
  input: objectImageCropInputSchema,
  output: objectImageCropInputSchema,
  policy: cropObjectImagePolicy,
  idempotency: "required",
  load: async ({ tx, input }) => {
    const state = await loadObjectState(tx, input.objectId, { lock: true });
    const image =
      state &&
      (await tx
        .selectFrom("app.object_images")
        .select(["width", "height"])
        .where("id", "=", input.imageId)
        .where("object_id", "=", state.objectId)
        .executeTakeFirst());

    return state && image
      ? { resource: { ...state, image }, context: undefined }
      : null;
  },
  execute: async ({ tx, input, resource, events }) => {
    const crop = input.crop && cropPixels(resource.image, input.crop);

    await tx
      .updateTable("app.object_images")
      .set({
        crop_left: crop?.left ?? null,
        crop_top: crop?.top ?? null,
        crop_side: crop?.side ?? null,
      })
      .where("id", "=", input.imageId)
      .execute();
    events.record(objectImageCropped, {
      resourceId: resource.objectId,
      payload: { imageId: input.imageId },
    });

    return {
      objectId: resource.objectId,
      imageId: input.imageId,
      crop: cropShares(resource.image, crop),
    };
  },
});

/**
 * Where one image's file is kept, and its type; or, for a thumbnail kept in
 * the database (`thingImageFile`), its bytes.
 */
export type ImageFile =
  | StoredImageFile
  | { readonly bytes: Uint8Array; readonly contentType: string };

export interface StoredImageFile {
  readonly key: string;
  readonly contentType: string;
}

/** The file of the object's image `imageId`, or null if it has none such. */
export async function findImageFile(
  db: Kysely<Database>,
  objectId: string,
  imageId: string,
): Promise<StoredImageFile | null> {
  const image = await db
    .selectFrom("app.object_images")
    .select(["id", "content_type"])
    .where("id", "=", imageId)
    .where("object_id", "=", objectId)
    .executeTakeFirst();

  return image
    ? {
        key: objectImageKey(objectId, image.id),
        contentType: image.content_type,
      }
    : null;
}

/** Authorizes reading one image of an object; its file comes from the store. */
export const objectImageFile = defineQuery({
  name: "object.read_image",
  input: z.strictObject({
    objectId: objectIdSchema,
    imageId: objectImageIdSchema,
  }),
  policy: readObjectPolicy,
  load: async ({ db, input }) => {
    const state = await loadObjectState(db, input.objectId);
    const file =
      state && (await findImageFile(db, state.objectId, input.imageId));

    return state && file
      ? { resource: { ...state, ...file }, context: undefined }
      : null;
  },
  present: ({ resource }) => ({
    key: resource.key,
    contentType: resource.contentType,
  }),
});

/** The image file, for those who may see the object. */
export function readObjectImage(
  domain: Pick<DomainContext, "db" | "clock">,
  store: ImageStore,
  request: { actor: Actor; input: unknown },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  return readImageFile(domain, store, objectImageFile, request);
}

/**
 * The file of the image `query` authorizes, read from the store only after
 * its policy. Each way of seeing an object has its own query.
 */
export async function readImageFile<I, R, C>(
  domain: Pick<DomainContext, "db" | "clock">,
  store: ImageStore,
  query: QueryDefinition<I, R, C, ImageFile>,
  request: { actor: Actor; input: unknown },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const file = await executeQuery(domain, query, request);
  const bytes = "bytes" in file ? file.bytes : await store.get(file.key);

  if (!bytes) {
    throw new DomainError("not_found", "Image file is missing");
  }

  return { bytes, contentType: file.contentType };
}

export interface ObjectImageFileCleanupOptions {
  readonly store: () => ImageStore | undefined;
  readonly db: () => Kysely<Database>;
  /** See {@link uploadGraceMs}. */
  readonly uploadGraceMs?: number;
}

/**
 * How long an upload may take from its intent to its registration, far
 * above any request's time limit. Until then an unregistered file may still
 * be on its way in and is kept.
 */
export const uploadGraceMs = 15 * 60 * 1000;

/**
 * Deletes image files nobody refers to (outbox, at-least-once): the file of a
 * removed image, and the file of an upload that was never registered once
 * the upload can no longer be running. Deleting is idempotent, so redelivery
 * is harmless.
 */
export function objectImageFileCleanup({
  store,
  db,
  uploadGraceMs: graceMs = uploadGraceMs,
}: ObjectImageFileCleanupOptions) {
  return defineConsumer({
    name: "object_images.delete_file",
    eventTypes: [objectImageRemoved.type, objectImageUploadStarted.type],
    handle: async ({ event }) => {
      const files = store();

      if (!files) {
        throw new OutboxDeliveryError("storage_unavailable");
      }

      if (event.type === objectImageUploadStarted.type) {
        const { imageId } = objectImageUploadStarted.payload.parse(
          event.payload,
        );
        if (await findImageFile(db(), event.resourceId, imageId)) {
          // Its file is deleted when the image is removed.
          return;
        }

        if (Date.now() - event.occurredAt.getTime() < graceMs) {
          // Retried with backoff until the upload can no longer be running.
          throw new OutboxDeliveryError("upload_in_progress");
        }

        await files.remove(objectImageKey(event.resourceId, imageId));
        return;
      }

      const { imageId } = objectImageRemoved.payload.parse(event.payload);
      await files.remove(objectImageKey(event.resourceId, imageId));
    },
  });
}

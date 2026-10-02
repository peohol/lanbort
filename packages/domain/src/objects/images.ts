import { createHash } from "node:crypto";
import {
  type ObjectImageAdded,
  objectImageAddedSchema,
  objectImageIdSchema,
  objectIdSchema,
  objectImageMaxCount,
  objectVersionSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { type Actor, actorScope } from "../actor";
import {
  type CommandResult,
  type DomainContext,
  defineCommand,
  executeCommand,
  parseInput,
} from "../commands/command";
import { idempotencyKeyPattern } from "../commands/idempotency";
import { defineQuery, executeQuery } from "../commands/query";
import { DomainError } from "../errors";
import { defineConsumer, OutboxDeliveryError } from "../outbox/consumer";
import { objectImageAdded, objectImageRemoved } from "./events";
import {
  addObjectImagePolicy,
  readObjectPolicy,
  removeObjectImagePolicy,
} from "./policies";
import { actingUserId, bumpVersion, loadObjectState } from "./state";

/**
 * Object images (PS-OBJ-002) are stored by a storage adapter behind these
 * ports, so the domain never sees a vendor API. The bucket is private: the
 * server uploads only after validation and hands images out only after the
 * object's read policy has allowed it.
 */
export interface ObjectImageStore {
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

export interface ObjectImageServices {
  readonly store: ObjectImageStore;
  readonly process: ImageProcessor;
}

/** Where an image's file lives. Derived from ids only, never from input. */
export function objectImageKey(objectId: string, imageId: string): string {
  return `objects/${objectId}/${imageId}.webp`;
}

/**
 * The image id for an upload, derived from who uploads, the idempotency key
 * and the bytes. A retry of the same upload gets the same id (and replays the
 * first result); a different upload never collides with an earlier file.
 */
function uploadImageId(scope: string, key: string, bytes: Uint8Array): string {
  const content = createHash("sha256").update(bytes).digest("hex");
  const hex = createHash("sha256")
    .update(JSON.stringify(["object-image", scope, key, content]))
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
 * Checked before an upload is processed or stored, so callers without access
 * cannot make the server store anything. The command checks again.
 */
const objectImageSlot = defineQuery({
  name: "object.add_image",
  input: objectReference,
  policy: addObjectImagePolicy,
  load: ({ db, input }) => loadImageSlot(db, input.objectId),
  present: ({ resource }) => ({ imageCount: resource.imageCount }),
});

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

    const version = await bumpVersion(tx, resource, now);
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
 * Adds an image to an object (PS-OBJ-002): authorize, re-encode without
 * metadata, store the file, then register it in one command. A stored file
 * that ends up unregistered (the command failed, or a retry replayed an image
 * that has since been removed) is removed again. Retry-safe with the same
 * idempotency key.
 */
export async function uploadObjectImage(
  domain: DomainContext,
  services: ObjectImageServices,
  request: UploadObjectImageRequest,
): Promise<CommandResult<ObjectImageAdded>> {
  const { imageCount } = await executeQuery(domain, objectImageSlot, {
    actor: request.actor,
    input: { objectId: request.objectId },
  });
  requireFreeSlot(imageCount);
  const { objectId } = parseInput(objectReference, {
    objectId: request.objectId,
  });

  if (request.idempotencyKey === undefined) {
    throw new DomainError(
      "idempotency_key_required",
      "Adding an image requires an idempotency key",
    );
  }

  if (!idempotencyKeyPattern.test(request.idempotencyKey)) {
    throw new DomainError("invalid_input", "Invalid idempotency key", [
      "idempotencyKey",
    ]);
  }

  const image = await services.process(request.bytes);

  if (!image) {
    throw new DomainError("invalid_input", "Not an accepted image", ["image"]);
  }

  const imageId = uploadImageId(
    actorScope(request.actor) as string,
    request.idempotencyKey,
    request.bytes,
  );
  const key = objectImageKey(objectId, imageId);
  // Keeps the stored file only if the image is registered, now or by an
  // earlier attempt that was not removed again since.
  const keepFileIfRegistered = async () => {
    const registered = await domain.db
      .selectFrom("app.object_images")
      .select("id")
      .where("id", "=", imageId)
      .executeTakeFirst();

    if (!registered) {
      await services.store.remove(key).catch(() => undefined);
    }
  };

  await services.store.put(key, image.bytes, image.contentType);

  try {
    const result = await executeCommand(domain, attachObjectImage, {
      actor: request.actor,
      input: {
        objectId,
        imageId,
        byteSize: image.bytes.byteLength,
        width: image.width,
        height: image.height,
      },
      idempotencyKey: request.idempotencyKey,
      correlationId: request.correlationId,
    });

    if (result.replayed) {
      await keepFileIfRegistered();
    }

    return result;
  } catch (error) {
    await keepFileIfRegistered();
    throw error;
  }
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
  execute: async ({ tx, input, resource, events, now }) => {
    await tx
      .deleteFrom("app.object_images")
      .where("id", "=", input.imageId)
      .execute();
    // Keep positions contiguous, so the order and the five slots stay intact.
    await tx
      .updateTable("app.object_images")
      .set((eb) => ({ position: eb("position", "-", 1) }))
      .where("object_id", "=", resource.objectId)
      .where("position", ">", resource.imagePosition)
      .execute();

    const version = await bumpVersion(tx, resource, now);
    events.record(objectImageRemoved, {
      resourceId: resource.objectId,
      payload: { version, imageId: input.imageId },
    });

    return { objectId: resource.objectId, version };
  },
});

/** Authorizes reading one image of an object; its file comes from the store. */
const objectImageFile = defineQuery({
  name: "object.read",
  input: z.strictObject({
    objectId: objectIdSchema,
    imageId: objectImageIdSchema,
  }),
  policy: readObjectPolicy,
  load: async ({ db, input }) => {
    const state = await loadObjectState(db, input.objectId);
    const image =
      state &&
      (await db
        .selectFrom("app.object_images")
        .select(["id", "content_type"])
        .where("id", "=", input.imageId)
        .where("object_id", "=", state.objectId)
        .executeTakeFirst());

    return state && image
      ? {
          resource: {
            ...state,
            key: objectImageKey(state.objectId, image.id),
            contentType: image.content_type,
          },
          context: undefined,
        }
      : null;
  },
  present: ({ resource }) => ({
    key: resource.key,
    contentType: resource.contentType,
  }),
});

/** The image file, for those who may see the object. */
export async function readObjectImage(
  domain: Pick<DomainContext, "db" | "clock">,
  store: ObjectImageStore,
  request: { actor: Actor; input: unknown },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const file = await executeQuery(domain, objectImageFile, request);
  const bytes = await store.get(file.key);

  if (!bytes) {
    throw new DomainError("not_found", "Image file is missing");
  }

  return { bytes, contentType: file.contentType };
}

/**
 * Deletes the file of a removed image (outbox, at-least-once). Deleting is
 * idempotent, so redelivery is harmless.
 */
export function objectImageFileCleanup(
  store: () => ObjectImageStore | undefined,
) {
  return defineConsumer({
    name: "object_images.delete_file",
    eventTypes: [objectImageRemoved.type],
    handle: async ({ event }) => {
      const files = store();

      if (!files) {
        throw new OutboxDeliveryError("storage_unavailable");
      }

      const { imageId } = objectImageRemoved.payload.parse(event.payload);
      await files.remove(objectImageKey(event.resourceId, imageId));
    },
  });
}

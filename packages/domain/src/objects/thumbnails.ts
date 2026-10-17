import type { ObjectImage } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { defineConsumer, OutboxDeliveryError } from "../outbox/consumer";
import {
  objectImageAdded,
  objectImageCropped,
  objectImageRemoved,
} from "./events";
import type { CropPixels } from "./image-crop";
import {
  findImageFile,
  type ImageFile,
  type ImageStore,
  objectImageKey,
  type ProcessedImage,
} from "./images";
import { currentImages } from "./state";

/**
 * Makes the thumbnail of a stored picture: its square part, or its middle
 * without one, small and rough (PS-OBJ-021). Null if it is no picture.
 */
export type ThumbnailMaker = (
  bytes: Uint8Array,
  square: CropPixels | null,
) => Promise<ProcessedImage | null>;

/**
 * Who sees a thing through something that outlives it: one of its loans or
 * loan requests. Null where nothing keeps its thumbnail.
 */
export type ThumbnailHolder =
  { readonly loanId: string } | { readonly requestId: string } | null;

type Db = Kysely<Database>;

const keptBy = (db: Db, holder: NonNullable<ThumbnailHolder>) =>
  "loanId" in holder
    ? db.selectFrom("app.thing_thumbnails").where("loan_id", "=", holder.loanId)
    : db
        .selectFrom("app.thing_thumbnails")
        .where("request_id", "=", holder.requestId);

/**
 * The thing's pictures as `holder` shows them (PS-OBJ-021): as they are now
 * while the thing exists (`objectId`), and after it is deleted the
 * thumbnail its loan or request kept, already square.
 */
export async function thingImages(
  db: Db,
  objectId: string | null,
  holder: ThumbnailHolder,
): Promise<ObjectImage[]> {
  if (objectId !== null || holder === null) {
    return currentImages(db, objectId);
  }

  const kept = await keptBy(db, holder)
    .select(["image_id", "side"])
    .executeTakeFirst();

  return kept
    ? [{ id: kept.image_id, width: kept.side, height: kept.side, crop: null }]
    : [];
}

/** The file of one of the pictures {@link thingImages} shows. */
export async function thingImageFile(
  db: Db,
  objectId: string | null,
  holder: ThumbnailHolder,
  imageId: string,
): Promise<ImageFile | null> {
  if (objectId !== null) {
    return findImageFile(db, objectId, imageId);
  }

  const kept =
    holder &&
    (await keptBy(db, holder)
      .select("bytes")
      .where("image_id", "=", imageId)
      .executeTakeFirst());

  return kept
    ? { bytes: new Uint8Array(kept.bytes), contentType: "image/webp" }
    : null;
}

/**
 * Before a thing is deleted: each of its loans and loan requests keeps a
 * copy of its thumbnail, if it has one (PS-OBJ-021). The thing's own goes
 * with its other rows.
 */
export async function keepThumbnail(db: Db, objectId: string): Promise<void> {
  for (const [table, column] of [
    ["app.loans", "loan_id"],
    ["app.loan_requests", "request_id"],
  ] as const) {
    await sql`
      insert into app.thing_thumbnails
        (${sql.ref(column)}, image_id, crop_left, crop_top, crop_side, side, bytes, made_at)
      select holder.id, thumbnail.image_id, thumbnail.crop_left,
        thumbnail.crop_top, thumbnail.crop_side, thumbnail.side,
        thumbnail.bytes, thumbnail.made_at
      from app.thing_thumbnails as thumbnail
      join ${sql.table(table)} as holder on holder.object_id = thumbnail.object_id
      where thumbnail.object_id = ${objectId}
    `.execute(db);
  }
}

/**
 * The account's things are gone, and so are the thumbnails their loans and
 * requests kept (PS-ADM-006): those it lent out, and those of the requests
 * made to it as an owner.
 */
export async function removeKeptThumbnails(
  db: Db,
  userId: string,
): Promise<void> {
  await db
    .deleteFrom("app.thing_thumbnails")
    .where((eb) =>
      eb.or([
        eb(
          "loan_id",
          "in",
          eb
            .selectFrom("app.loans")
            .select("id")
            .where("responsible_lender_id", "=", userId)
            .where("object_id", "is", null),
        ),
        eb(
          "request_id",
          "in",
          eb
            .selectFrom("app.loan_requests")
            .select("id")
            .where("object_id", "is", null)
            .where(sql<boolean>`${userId}::uuid = any(former_owner_ids)`),
        ),
      ]),
    )
    .execute();
}

export interface ThingThumbnailOptions {
  readonly store: () => ImageStore | undefined;
  readonly thumbnails: () => ThumbnailMaker | undefined;
  readonly db: () => Db;
}

/**
 * Keeps each thing's thumbnail in step with its main picture and the
 * square chosen of it (outbox, at-least-once). It is made from the state as
 * it is when delivered and only stored while that state still holds, so a
 * late or repeated delivery never brings an older picture back.
 */
export function thingThumbnails({
  store,
  thumbnails,
  db,
}: ThingThumbnailOptions) {
  return defineConsumer({
    name: "object_images.thumbnail",
    eventTypes: [
      objectImageAdded.type,
      objectImageRemoved.type,
      objectImageCropped.type,
    ],
    handle: async ({ event }) => {
      const objectId = event.resourceId;
      const main = await db()
        .selectFrom("app.object_images")
        .select(["id", "crop_left", "crop_top", "crop_side"])
        .where("object_id", "=", objectId)
        .where("position", "=", 0)
        .executeTakeFirst();

      if (!main) {
        await db()
          .deleteFrom("app.thing_thumbnails")
          .where("object_id", "=", objectId)
          .where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom("app.object_images")
                  .where("object_id", "=", objectId),
              ),
            ),
          )
          .execute();
        return;
      }

      const { crop_left: left, crop_top: top, crop_side: side } = main;
      const square =
        left === null || top === null || side === null
          ? null
          : { left, top, side };
      // The same picture and square as `main`.
      const sameSquare = (image: string) => sql<boolean>`
        (${sql.ref(`${image}.crop_left`)}, ${sql.ref(`${image}.crop_top`)}, ${sql.ref(`${image}.crop_side`)})
          is not distinct from (${left}::integer, ${top}::integer, ${side}::integer)`;
      const made = await db()
        .selectFrom("app.thing_thumbnails as made")
        .select("made.id")
        .where("made.object_id", "=", objectId)
        .where("made.image_id", "=", main.id)
        .where(sameSquare("made"))
        .executeTakeFirst();

      if (made) {
        return;
      }

      const files = store();
      const make = thumbnails();

      if (!files || !make) {
        throw new OutboxDeliveryError("storage_unavailable");
      }

      const bytes = await files.get(objectImageKey(objectId, main.id));

      if (!bytes) {
        // Removed meanwhile; that removal makes the next one.
        return;
      }

      const thumbnail = await make(bytes, square);

      if (!thumbnail) {
        throw new OutboxDeliveryError("thumbnail_not_made", true);
      }

      await sql`
        insert into app.thing_thumbnails
          (object_id, image_id, crop_left, crop_top, crop_side, side, bytes)
        select image.object_id, image.id, image.crop_left, image.crop_top,
          image.crop_side, ${thumbnail.width}, ${Buffer.from(thumbnail.bytes)}
        from app.object_images as image
        where image.id = ${main.id}
          and image.position = 0
          and ${sameSquare("image")}
        on conflict (object_id) do update set
          image_id = excluded.image_id,
          crop_left = excluded.crop_left,
          crop_top = excluded.crop_top,
          crop_side = excluded.crop_side,
          side = excluded.side,
          bytes = excluded.bytes,
          made_at = excluded.made_at
      `.execute(db());
    },
  });
}

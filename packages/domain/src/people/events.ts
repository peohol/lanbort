import { profilePictureVisibilitySchema } from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/** Profile picture events carry ids and the visibility only, never images. */
const pictureEvent = <Shape extends z.ZodRawShape>(
  type: string,
  payload: z.ZodObject<Shape>,
) =>
  defineEvent({
    type: `profile.${type}`,
    version: 1,
    kind: "domain",
    resourceType: "user",
    payload,
  });

/**
 * Recorded before a picture file is stored, so a file whose upload never
 * got registered is deleted (outbox).
 */
export const profilePictureUploadStarted = pictureEvent(
  "picture_upload_started",
  z.strictObject({ pictureId: z.uuid() }),
);

/** A new picture; the file of the one it replaced is deleted (outbox). */
export const profilePictureChanged = pictureEvent(
  "picture_changed",
  z.strictObject({
    pictureId: z.uuid(),
    replacedPictureId: z.uuid().nullable(),
  }),
);

/** The picture is gone; its file is deleted (outbox). */
export const profilePictureRemoved = pictureEvent(
  "picture_removed",
  z.strictObject({ pictureId: z.uuid() }),
);

export const profilePictureVisibilityChanged = pictureEvent(
  "picture_visibility_changed",
  z.strictObject({ visibility: profilePictureVisibilitySchema }),
);

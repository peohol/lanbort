import { z } from "zod";

/**
 * The profile picture (PS-USR-002). The browser crops the photo to the
 * app's picture shape and compresses it before upload; the server
 * re-encodes it without metadata and keeps nothing larger than
 * {@link profilePictureMaxSide}.
 */

/** Largest picture upload the API accepts, well above a cropped picture. */
export const profilePictureMaxUploadBytes = 1024 * 1024;

/**
 * The longest side of a stored picture, in pixels: sharp at the largest
 * size the app shows it, on a screen with three pixels per point.
 */
export const profilePictureMaxSide = 384;

/**
 * Who sees the picture (PS-USR-002): everyone who may see the person's
 * profile, only friends, or only the person.
 */
export const profilePictureVisibilitySchema = z.enum([
  "general",
  "friends",
  "only_me",
]);

export const profilePictureVisibilityInputSchema = z.strictObject({
  visibility: profilePictureVisibilitySchema,
});

export const profilePictureTargetSchema = z.strictObject({
  // Ids are compared as stored, in lower case.
  pictureId: z.uuid().transform((id) => id.toLowerCase()),
});

/** The caller's own picture after a change; null once it is removed. */
export const ownProfilePictureSchema = z.strictObject({
  pictureId: z.uuid().nullable(),
  visibility: profilePictureVisibilitySchema,
});

export type ProfilePictureVisibility = z.infer<
  typeof profilePictureVisibilitySchema
>;
export type OwnProfilePicture = z.infer<typeof ownProfilePictureSchema>;

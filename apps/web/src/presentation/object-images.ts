import type {
  ObjectImage,
  ObjectImageCrop,
  ThingPicture,
} from "@lanbort/contracts";
import type { CSSProperties } from "react";
import type { PictureShape } from "./picture-crop";

/**
 * Where a thing's photos are read, each through the policy of the place the
 * reader sees the thing in (PS-OBJ-002): as one of its owners, through an
 * environment it is published in, as a friend of an owner (PS-OBJ-020), or
 * as a party of a loan or a request for it, or as invited to co-own it
 * (PS-OBJ-021).
 */
export const ownImageHref = (objectId: string, imageId: string) =>
  `/api/objects/${objectId}/images/${imageId}`;

export const environmentImageHref = (
  environmentId: string,
  objectId: string,
  imageId: string,
) =>
  `/api/environments/objects/image?${new URLSearchParams({ environmentId, objectId, imageId })}`;

export const friendImageHref = (objectId: string, imageId: string) =>
  `/api/social/objects/image?${new URLSearchParams({ objectId, imageId })}`;

export const loanImageHref = (loanId: string, imageId: string) =>
  `/api/loans/${loanId}/images/${imageId}`;

export const loanRequestImageHref = (requestId: string, imageId: string) =>
  `/api/loan-requests/${requestId}/images/${imageId}`;

export const coOwnerInvitationImageHref = (
  invitationId: string,
  imageId: string,
) => `/api/object-invitations/${invitationId}/images/${imageId}`;

/**
 * A thing's main picture where it is shown square (PS-OBJ-002): where it
 * is read, and the square the owners chose of it, or null for its middle.
 */
export interface ThingImage {
  readonly src: string;
  readonly crop: ObjectImageCrop | null;
}

/** The first photo of a thing, if it has one, for a card in a list. */
export const firstImage = (
  images: readonly ObjectImage[],
  href: (imageId: string) => string,
): ThingImage | null =>
  images[0] ? { src: href(images[0].id), crop: images[0].crop } : null;

const sameCrop = (a: ObjectImageCrop | null, b: ObjectImageCrop | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

/**
 * Whether a photo in the thing's form has a square to save: one chosen for
 * a new photo, or another than the saved photo's.
 */
export const cropChanged = (
  image:
    | { readonly kind: "new"; readonly crop: ObjectImageCrop | null }
    | {
        readonly kind: "saved";
        readonly crop: ObjectImageCrop | null;
        readonly savedCrop: ObjectImageCrop | null;
      },
) =>
  image.kind === "new"
    ? image.crop !== null
    : !sameCrop(image.crop, image.savedCrop);

/**
 * The frame the owners choose a thing's square in: a square with corners
 * like a card's picture.
 */
export const thingPictureShape: PictureShape = {
  aspectRatio: 1,
  cornerRadius: 0.125,
};

/**
 * Where a picture lies in a square box so the box shows `crop` of it: the
 * picture scaled so the square fills the box, and moved so it is in view.
 * Shares of the box, so it holds at any size.
 */
export function croppedStyle(crop: ObjectImageCrop): CSSProperties {
  const percent = (share: number) => `${+(share * 100).toFixed(4)}%`;

  return {
    width: percent(1 / crop.width),
    height: percent(1 / crop.height),
    left: percent(-crop.x / crop.width),
    top: percent(-crop.y / crop.height),
  };
}

/** Where a list reads the first picture of a loan's or request's thing. */
export function thingPictureImage(
  picture: ThingPicture | null,
): ThingImage | null {
  const src = thingPictureHref(picture);

  return picture && src ? { src, crop: picture.crop } : null;
}

export function thingPictureHref(picture: ThingPicture | null): string | null {
  switch (picture?.through) {
    case "loan":
      return loanImageHref(picture.loanId, picture.imageId);
    case "loan_request":
      return loanRequestImageHref(picture.requestId, picture.imageId);
    case "owner":
      return ownImageHref(picture.objectId, picture.imageId);
    case "object_invitation":
      return coOwnerInvitationImageHref(picture.invitationId, picture.imageId);
    case undefined:
      return null;
  }
}

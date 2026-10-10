import type { ThingPicture } from "@lanbort/contracts";

/**
 * Where a thing's photos are read, each through the policy of the place the
 * reader sees the thing in (PS-OBJ-002): as one of its owners, through an
 * environment it is published in, as a friend of an owner (PS-OBJ-020), or
 * as a party of a loan or a request for it (PS-OBJ-021).
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

/** The first photo of a thing, if it has one, for a card in a list. */
export const firstImageHref = (
  images: readonly { readonly id: string }[],
  href: (imageId: string) => string,
) => (images[0] ? href(images[0].id) : null);

/** Where a list reads the first picture of a loan's or request's thing. */
export function thingPictureHref(picture: ThingPicture | null): string | null {
  switch (picture?.through) {
    case "loan":
      return loanImageHref(picture.loanId, picture.imageId);
    case "loan_request":
      return loanRequestImageHref(picture.requestId, picture.imageId);
    case "owner":
      return ownImageHref(picture.objectId, picture.imageId);
    case undefined:
      return null;
  }
}

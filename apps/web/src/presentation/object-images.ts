/**
 * Where a thing's photos are read, each through the policy of the place the
 * reader sees the thing in (PS-OBJ-002): as one of its owners, or through
 * an environment it is published in.
 */
export const ownImageHref = (objectId: string, imageId: string) =>
  `/api/objects/${objectId}/images/${imageId}`;

export const environmentImageHref = (
  environmentId: string,
  objectId: string,
  imageId: string,
) =>
  `/api/environments/objects/image?${new URLSearchParams({ environmentId, objectId, imageId })}`;

/** The first photo of a thing, if it has one, for a card in a list. */
export const firstImageHref = (
  images: readonly { readonly id: string }[],
  href: (imageId: string) => string,
) => (images[0] ? href(images[0].id) : null);

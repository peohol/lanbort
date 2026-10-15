import type { ObjectImageCrop } from "@lanbort/contracts";

/** A picture's size in pixels, as stored. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** The square part of a stored picture, in its pixels (PS-OBJ-002). */
export interface CropPixels {
  readonly left: number;
  readonly top: number;
  readonly side: number;
}

const within = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * The chosen square in the picture's pixels: as large as asked but never
 * larger than the picture, and moved inside it where it would reach out.
 * The chooser's picture may be scaled from the stored one, so the shares
 * may round to a square a pixel off; fitting it here keeps it a square.
 */
export function cropPixels(
  image: ImageSize,
  crop: ObjectImageCrop,
): CropPixels {
  const shorter = Math.min(image.width, image.height);
  const side = within(
    Math.round(Math.min(crop.width * image.width, crop.height * image.height)),
    1,
    shorter,
  );

  return {
    left: within(Math.round(crop.x * image.width), 0, image.width - side),
    top: within(Math.round(crop.y * image.height), 0, image.height - side),
    side,
  };
}

/** The stored square as shares of the picture, as the API gives it. */
export function cropShares(
  image: ImageSize,
  crop: CropPixels | null,
): ObjectImageCrop | null {
  return crop
    ? {
        x: crop.left / image.width,
        y: crop.top / image.height,
        width: crop.side / image.width,
        height: crop.side / image.height,
      }
    : null;
}

/** The square as a picture's row holds it: all three columns or none. */
export function storedCrop(row: {
  readonly width: number;
  readonly height: number;
  readonly crop_left: number | null;
  readonly crop_top: number | null;
  readonly crop_side: number | null;
}): ObjectImageCrop | null {
  const { crop_left: left, crop_top: top, crop_side: side } = row;

  return cropShares(
    row,
    left === null || top === null || side === null ? null : { left, top, side },
  );
}

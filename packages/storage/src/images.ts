import sharp from "sharp";

/** Formats accepted as uploads. Anything else is refused, whatever its name. */
const acceptedFormats = new Set(["jpeg", "png", "webp"]);

/** Longest side of a stored image, in pixels. */
export const storedImageMaxSide = 2048;

/** Refuses decompression bombs before decoding: about 50 megapixels. */
export const maxInputPixels = 50_000_000;

export interface NormalizeOptions {
  /** Longest side kept, in pixels; smaller images are never enlarged. */
  readonly maxSide?: number;
  /** WebP quality, 1–100. */
  readonly quality?: number;
}

export interface NormalizedImage {
  readonly bytes: Uint8Array;
  readonly contentType: "image/webp";
  readonly width: number;
  readonly height: number;
}

/**
 * Decodes an uploaded photo and re-encodes it as WebP. Only the pixels
 * survive: EXIF (including GPS position), ICC and other metadata are dropped
 * after the orientation has been applied, and an embedded script, HTML or
 * second file cannot pass through (docs/architecture/08, malicious uploads).
 * Returns null for anything that is not a JPEG, PNG or WebP image.
 */
export async function normalizeImage(
  bytes: Uint8Array,
  { maxSide = storedImageMaxSide, quality = 82 }: NormalizeOptions = {},
): Promise<NormalizedImage | null> {
  try {
    const input = sharp(bytes, {
      limitInputPixels: maxInputPixels,
      failOn: "error",
    });
    const { format } = await input.metadata();

    if (!format || !acceptedFormats.has(format)) {
      return null;
    }

    const { data, info } = await input
      .rotate()
      .resize({
        width: maxSide,
        height: maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: new Uint8Array(data),
      contentType: "image/webp",
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}

/**
 * Side of a thing's thumbnail, in pixels: enough to recognise the thing in
 * its place beside a title, and a few kilobytes at most.
 */
export const thumbnailSide = 96;

/** The square part of a stored picture, in its pixels. */
export interface ThumbnailSquare {
  readonly left: number;
  readonly top: number;
  readonly side: number;
}

/**
 * A small, rough WebP copy of `square` of a stored picture, or of its
 * middle without one (PS-OBJ-021). Stored pictures are already upright and
 * without metadata ({@link normalizeImage}). Null for anything else.
 */
export async function thumbnailImage(
  bytes: Uint8Array,
  square: ThumbnailSquare | null,
): Promise<NormalizedImage | null> {
  try {
    const input = sharp(bytes, {
      limitInputPixels: maxInputPixels,
      failOn: "error",
    });
    const cut = square
      ? input.extract({
          left: square.left,
          top: square.top,
          width: square.side,
          height: square.side,
        })
      : input;
    const { data, info } = await cut
      .resize({ width: thumbnailSide, height: thumbnailSide, fit: "cover" })
      .webp({ quality: 40, effort: 6, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: new Uint8Array(data),
      contentType: "image/webp",
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}

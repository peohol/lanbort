import sharp from "sharp";

/** Formats accepted as uploads. Anything else is refused, whatever its name. */
const acceptedFormats = new Set(["jpeg", "png", "webp"]);

/** Longest side of a stored image, in pixels. */
export const storedImageMaxSide = 2048;

/** Refuses decompression bombs before decoding: about 50 megapixels. */
const maxInputPixels = 50_000_000;

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
        width: storedImageMaxSide,
        height: storedImageMaxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
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

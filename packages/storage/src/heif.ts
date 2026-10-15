import sharp from "sharp";
import { maxInputPixels, storedImageMaxSide } from "./images";

/** The part of libheif-js (an Emscripten build of libheif) used here. */
interface HeifImage {
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: unknown) => void,
  ): void;
  free(): void;
}

interface Libheif {
  HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] };
}

/** Loaded on first use: most photos never need it. */
let libheif: Promise<Libheif> | undefined;
const loadLibheif = () =>
  // @ts-expect-error -- the package has no types; Libheif types what is used.
  (libheif ??= import("libheif-js/wasm-bundle").then(
    (module) => (module.default ?? module) as Libheif,
  ));

/**
 * A HEIC/HEIF photo (what many phones take) as a JPEG every browser can
 * draw, upright, no larger than `maxSide` and without metadata. Most
 * browsers cannot decode HEIC themselves, so they ask the server; the result
 * then goes through the same upload as any other photo. Null for anything
 * that is not such a photo, or is larger than the server decodes.
 */
export async function heifToJpeg(
  bytes: Uint8Array,
  { maxSide = storedImageMaxSide }: { maxSide?: number } = {},
): Promise<Uint8Array | null> {
  let images: HeifImage[] = [];
  try {
    images = new (await loadLibheif()).HeifDecoder().decode(bytes);
    const image = images.find((each) => each.is_primary()) ?? images[0];
    if (!image) return null;

    const width = image.get_width();
    const height = image.get_height();
    if (width * height > maxInputPixels) return null;

    const data = new Uint8ClampedArray(width * height * 4);
    const shown = await new Promise((resolve) =>
      image.display({ data, width, height }, resolve),
    );
    if (!shown) return null;

    const jpeg = await sharp(data, { raw: { width, height, channels: 4 } })
      .flatten({ background: "#ffffff" })
      .resize({
        width: maxSide,
        height: maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    return new Uint8Array(jpeg);
  } catch {
    return null;
  } finally {
    for (const image of images) image.free();
  }
}

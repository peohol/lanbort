/**
 * Reading a chosen photo in the browser. A file's name and type say little
 * about what it holds: a phone can hand over a HEIC photo named `.jpg`, or a
 * file that only lives in the cloud and cannot be read. So the bytes are read
 * at once and decoded here (HEIC by the server where the browser cannot),
 * and only what the browser could draw is uploaded.
 */

import type { PhotoProblem } from "@/presentation/photos";

const heifConversionPath = "/api/images/conversion";

export type PhotoRead =
  | { readonly ok: true; readonly photo: ImageBitmap }
  | { readonly ok: false; readonly problem: PhotoProblem };

/** HEIF brands (ISO/IEC 23008-12) used for HEVC-coded photos. */
const heifBrands = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/** What the bytes hold, by how they start, whatever the file is called. */
export type PhotoFormat = "jpeg" | "png" | "gif" | "webp" | "avif" | "heif";

export function photoFormat(bytes: Uint8Array): PhotoFormat | null {
  const text = (start: number) =>
    String.fromCharCode(...bytes.subarray(start, start + 4));

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (text(0) === "\x89PNG") return "png";
  if (text(0) === "GIF8") return "gif";
  if (text(0) === "RIFF" && text(8) === "WEBP") return "webp";
  if (bytes.length < 16 || text(4) !== "ftyp") return null;

  // An ISO-BMFF `ftyp` box: the major brand, then the compatible ones.
  const boxSize = Math.min(
    bytes.length,
    new DataView(bytes.buffer, bytes.byteOffset).getUint32(0),
  );
  const brands = [text(8)];
  for (let at = 16; at + 4 <= boxSize; at += 4) brands.push(text(at));

  if (brands.some((brand) => brand === "avif" || brand === "avis")) {
    return "avif";
  }
  return brands.some((brand) => heifBrands.has(brand)) ? "heif" : null;
}

/** The size `width`×`height` takes with its longest side at most `maxSide`. */
function fitted(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Decodes through `createImageBitmap`, the lighter way. */
async function decodeBitmap(blob: Blob, maxSide: number) {
  const full = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  const size = fitted(full.width, full.height, maxSide);
  if (size.width === full.width) return full;

  try {
    return await createImageBitmap(full, {
      resizeWidth: size.width,
      resizeHeight: size.height,
      resizeQuality: "high",
    });
  } finally {
    full.close();
  }
}

/**
 * Decodes through an image element, which some browsers manage when
 * `createImageBitmap` gives up (a very large photo, say).
 */
async function decodeElement(blob: Blob, maxSide: number) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { width, height } = fitted(
      image.naturalWidth,
      image.naturalHeight,
      maxSide,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Waits before reading again. A phone can hand over a photo before it is
 * all there (still coming from a cloud service, say), and the same file
 * reads fine moments later.
 */
const retryDelaysMs = [500, 1500];

/**
 * The chosen photo, upright and with its longest side at most `maxSide`, or
 * why it cannot be used.
 */
export async function readPhoto(
  file: Blob,
  maxSide: number,
): Promise<PhotoRead> {
  let read = await readOnce(file, maxSide);
  for (const delay of retryDelaysMs) {
    // The server has said what it could about a HEIC photo.
    if (read.ok || read.problem === "heif") break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    read = await readOnce(file, maxSide);
  }
  return read;
}

async function readOnce(file: Blob, maxSide: number): Promise<PhotoRead> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, problem: "unreadable" };
  }
  if (bytes.length === 0) return { ok: false, problem: "unreadable" };

  // An in-memory copy: the original may stop being readable later.
  const blob = new Blob([bytes]);
  const format = photoFormat(bytes);
  const photo =
    (await decoded(blob, format, maxSide)) ??
    (format === "heif"
      ? await decoded(await convertedHeif(blob), "jpeg", maxSide)
      : null);

  return photo
    ? { ok: true, photo }
    : { ok: false, problem: format === "heif" ? "heif" : "undecodable" };
}

/** The first way that decodes the photo, or null. */
async function decoded(
  blob: Blob | null,
  format: PhotoFormat | null,
  maxSide: number,
): Promise<ImageBitmap | null> {
  if (!blob) return null;
  // The image element is tried only for formats browsers draw, as its
  // failure is reported to the console.
  const decoders =
    format && format !== "heif"
      ? [decodeBitmap, decodeElement]
      : [decodeBitmap];
  for (const decode of decoders) {
    try {
      return await decode(blob, maxSide);
    } catch {
      // Try the next way.
    }
  }
  return null;
}

/**
 * A HEIC photo as a JPEG, from the server, for the many browsers that
 * cannot decode HEIC themselves. Nothing is stored there.
 */
async function convertedHeif(blob: Blob): Promise<Blob | null> {
  try {
    const response = await fetch(heifConversionPath, {
      method: "POST",
      headers: { "content-type": "image/heic" },
      body: blob,
      signal: AbortSignal.timeout(120_000),
    });
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

/**
 * The canvas as a compressed file no larger than `maxBytes`: WebP where the
 * browser can write it, otherwise JPEG. The server re-encodes it either way.
 */
export async function encodePhoto(
  canvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<Blob | null> {
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );

  for (const quality of [0.85, 0.7]) {
    const webp = await encode("image/webp", quality);
    const blob =
      webp?.type === "image/webp" ? webp : await encode("image/jpeg", quality);
    if (blob && blob.size <= maxBytes) return blob;
  }

  return null;
}

/**
 * The photo on a white ground (a transparent PNG would turn black as JPEG),
 * compressed for upload.
 */
export function encodeWhole(
  photo: ImageBitmap,
  maxBytes: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = photo.width;
  canvas.height = photo.height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(photo, 0, 0);

  return encodePhoto(canvas, maxBytes);
}

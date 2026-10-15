/** The longest side a photo is read at; more is never needed to crop. */
const readMaxSide = 2048;

/** A chosen photo, upright and no larger than needed to crop it. */
export async function readPhoto(file: Blob): Promise<ImageBitmap | null> {
  try {
    const full = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = readMaxSide / Math.max(full.width, full.height);
    if (scale >= 1) return full;

    const smaller = await createImageBitmap(full, {
      resizeWidth: Math.round(full.width * scale),
      resizeHeight: Math.round(full.height * scale),
      resizeQuality: "high",
    });
    full.close();
    return smaller;
  } catch {
    return null;
  }
}

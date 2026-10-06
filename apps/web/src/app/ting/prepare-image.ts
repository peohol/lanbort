import {
  objectImageMaxUploadBytes,
  objectImageUploadMaxSide,
} from "@lanbort/contracts";

/** What the API takes as it is (PS-OBJ-002); anything else is redrawn. */
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * A photo ready to upload: as it is when the API takes it, or redrawn as a
 * smaller JPEG when it is too large or in another format the browser can
 * read (a phone's HEIC photo, say). Null when it cannot be read as a photo
 * or stays too large. The server re-encodes it and drops its metadata.
 */
export async function prepareImage(file: File): Promise<Blob | null> {
  if (file.size <= objectImageMaxUploadBytes && acceptedTypes.has(file.type)) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(
      1,
      objectImageUploadMaxSide / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );

    return blob && blob.size <= objectImageMaxUploadBytes ? blob : null;
  } catch {
    return null;
  }
}

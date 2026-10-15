import {
  objectImageMaxUploadBytes,
  objectImageUploadMaxSide,
} from "@lanbort/contracts";
import { encodeWhole, readPhoto } from "@/components/photo";
import type { PhotoProblem } from "@/presentation/photos";

/**
 * A photo ready to upload, redrawn here whatever it was: upright, no larger
 * than the server keeps, and without anything from the camera. What is shown
 * as its preview is exactly what is sent. The server re-encodes it again.
 */
export async function prepareImage(
  file: File,
): Promise<
  | { readonly ok: true; readonly blob: Blob }
  | { readonly ok: false; readonly problem: PhotoProblem }
> {
  const read = await readPhoto(file, objectImageUploadMaxSide);
  if (!read.ok) return read;

  try {
    const blob = await encodeWhole(read.photo, objectImageMaxUploadBytes);
    return blob ? { ok: true, blob } : { ok: false, problem: "undecodable" };
  } finally {
    read.photo.close();
  }
}

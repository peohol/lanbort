import { profilePictureMaxSide } from "@lanbort/contracts";
import type { ImageProcessor, ImageServices } from "@lanbort/domain";
import { createSupabaseFileStore, normalizeImage } from "@lanbort/storage";
import { serverEnv } from "./env";

const services = new Map<string, ImageServices>();

/**
 * Storage and image processing for one private bucket, or undefined when
 * this environment has no storage key configured; image routes then answer
 * `unavailable` and nothing else is affected.
 */
function imageServices(
  bucket: string,
  process: ImageProcessor,
): ImageServices | undefined {
  const env = serverEnv();

  if (!env.SUPABASE_SECRET_KEY) {
    return undefined;
  }

  let found = services.get(bucket);

  if (!found) {
    found = {
      store: createSupabaseFileStore({
        url: env.SUPABASE_URL,
        secretKey: env.SUPABASE_SECRET_KEY,
        bucket,
      }),
      process,
    };
    services.set(bucket, found);
  }

  return found;
}

/** Object images, in the bucket the object core migration created. */
export const objectImageServices = () =>
  imageServices("object-images", normalizeImage);

/** Profile pictures, in their own bucket and never larger than shown. */
export const profilePictureServices = () =>
  imageServices("profile-pictures", (bytes) =>
    normalizeImage(bytes, { maxSide: profilePictureMaxSide }),
  );

/** An image file as the response, shown in the page, never downloaded. */
export function imageFileResponse(image: {
  bytes: Uint8Array;
  contentType: string;
}): Response {
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "content-disposition": "inline",
    },
  });
}

import type { ObjectImageServices } from "@lanbort/domain";
import { createSupabaseFileStore, normalizeImage } from "@lanbort/storage";
import { serverEnv } from "./env";

/** The private bucket created by the object core migration. */
const objectImageBucket = "object-images";

let services: ObjectImageServices | undefined;

/**
 * Storage and image processing for object images, or undefined when this
 * environment has no storage key configured; image routes then answer
 * `unavailable` and nothing else is affected.
 */
export function objectImageServices(): ObjectImageServices | undefined {
  const env = serverEnv();

  if (!env.SUPABASE_SECRET_KEY) {
    return undefined;
  }

  services ??= {
    store: createSupabaseFileStore({
      url: env.SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
      bucket: objectImageBucket,
    }),
    process: normalizeImage,
  };

  return services;
}

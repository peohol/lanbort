import { createClient } from "@supabase/supabase-js";

/**
 * Private file storage for server code. Lånbort's only adapter to the storage
 * provider (ADR-0007, docs/architecture/10): callers see keys and bytes, never
 * the vendor API, URLs or credentials. The browser never talks to the
 * provider; files reach it only through authorized API routes.
 */
export interface FileStore {
  /** Creates or replaces the file at `key`. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The file's bytes, or null if there is none. */
  get(key: string): Promise<Uint8Array | null>;
  /** Removes the file; removing a missing file succeeds. */
  remove(key: string): Promise<void>;
}

/** The provider failed or is unreachable. Carries no provider details. */
export class StorageUnavailableError extends Error {
  constructor(operation: string) {
    super(`File storage ${operation} failed`);
    this.name = "StorageUnavailableError";
  }
}

export interface SupabaseFileStoreConfig {
  url: string;
  /** Server-only secret key. Never sent to the browser. */
  secretKey: string;
  /** A private bucket, created by a migration. */
  bucket: string;
}

/** Supabase Storage answers 400 or 404 for a file that does not exist. */
function isMissing(error: unknown): boolean {
  const status =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;

  return (
    status === 400 || status === 404 || status === "400" || status === "404"
  );
}

export function createSupabaseFileStore(
  config: SupabaseFileStoreConfig,
): FileStore {
  const bucket = createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(config.bucket);

  return {
    async put(key, bytes, contentType) {
      const { error } = await bucket.upload(key, bytes, {
        contentType,
        upsert: true,
      });

      if (error) {
        throw new StorageUnavailableError("upload");
      }
    },

    async get(key) {
      const { data, error } = await bucket.download(key);

      if (error) {
        if (isMissing(error)) {
          return null;
        }
        throw new StorageUnavailableError("download");
      }

      return new Uint8Array(await data.arrayBuffer());
    },

    async remove(key) {
      const { error } = await bucket.remove([key]);

      if (error) {
        throw new StorageUnavailableError("remove");
      }
    },
  };
}

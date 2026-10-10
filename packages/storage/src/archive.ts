import { createClient } from "@supabase/supabase-js";
import { StorageUnavailableError } from "./object-store";

/** A file in any bucket, as a backup sees it. */
export interface StoredFile {
  readonly bucket: string;
  readonly key: string;
  readonly contentType: string;
  readonly size: number;
}

/**
 * Every bucket's files, for backup and restore of the files the database
 * does not hold (WP-72, docs/implementation/backup-restore.md). Operational
 * tooling only: the app itself reaches files through `FileStore`.
 */
export interface StorageArchive {
  files(): Promise<StoredFile[]>;
  get(bucket: string, key: string): Promise<Uint8Array>;
  /** Creates or replaces the file. The bucket must exist. */
  put(file: StoredFile, bytes: Uint8Array): Promise<void>;
}

export interface SupabaseStorageArchiveConfig {
  url: string;
  /** Server-only secret key. */
  secretKey: string;
}

const pageSize = 1000;

export function createSupabaseStorageArchive(
  config: SupabaseStorageArchiveConfig,
): StorageArchive {
  const storage = createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;

  // Folders are listed as entries without an id; files have one.
  async function filesUnder(bucket: string, prefix: string) {
    const found: StoredFile[] = [];

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new StorageUnavailableError("list");
      }

      for (const entry of data) {
        const key = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

        if (entry.id === null) {
          found.push(...(await filesUnder(bucket, key)));
        } else {
          const metadata = (entry.metadata ?? {}) as {
            mimetype?: string;
            size?: number;
          };
          found.push({
            bucket,
            key,
            contentType: metadata.mimetype ?? "application/octet-stream",
            size: metadata.size ?? 0,
          });
        }
      }

      if (data.length < pageSize) {
        return found;
      }
    }
  }

  return {
    async files() {
      const { data, error } = await storage.listBuckets();

      if (error) {
        throw new StorageUnavailableError("list");
      }

      const files: StoredFile[] = [];
      for (const bucket of data.map((entry) => entry.id).sort()) {
        files.push(...(await filesUnder(bucket, "")));
      }
      return files;
    },

    async get(bucket, key) {
      const { data, error } = await storage.from(bucket).download(key);

      if (error) {
        throw new StorageUnavailableError("download");
      }

      return new Uint8Array(await data.arrayBuffer());
    },

    async put(file, bytes) {
      const { error } = await storage
        .from(file.bucket)
        .upload(file.key, bytes, {
          contentType: file.contentType,
          upsert: true,
        });

      if (error) {
        throw new StorageUnavailableError("upload");
      }
    },
  };
}

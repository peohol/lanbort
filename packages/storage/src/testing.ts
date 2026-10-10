import type { StorageArchive, StoredFile } from "./archive";
import type { FileStore } from "./object-store";

/** An in-memory file store for tests. Never used by production code. */
export class MemoryFileStore implements FileStore {
  readonly files = new Map<
    string,
    { bytes: Uint8Array; contentType: string }
  >();

  async put(key: string, bytes: Uint8Array, contentType: string) {
    this.files.set(key, { bytes, contentType });
  }

  async get(key: string) {
    return this.files.get(key)?.bytes ?? null;
  }

  async remove(key: string) {
    this.files.delete(key);
  }
}

/** An in-memory archive of several buckets for tests. */
export class MemoryStorageArchive implements StorageArchive {
  readonly stored = new Map<string, { file: StoredFile; bytes: Uint8Array }>();

  constructor(readonly buckets: readonly string[]) {}

  async files() {
    return [...this.stored.values()].map(({ file }) => file);
  }

  async get(bucket: string, key: string) {
    const stored = this.stored.get(`${bucket}/${key}`);
    if (!stored) throw new Error(`No file ${bucket}/${key}`);
    return stored.bytes;
  }

  async put(file: StoredFile, bytes: Uint8Array) {
    if (!this.buckets.includes(file.bucket)) {
      throw new Error(`No bucket ${file.bucket}`);
    }
    this.stored.set(`${file.bucket}/${file.key}`, {
      file: { ...file, size: bytes.length },
      bytes,
    });
  }
}

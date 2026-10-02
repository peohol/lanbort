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

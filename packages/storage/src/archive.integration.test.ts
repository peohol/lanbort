import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSupabaseStorageArchive } from "./archive";
import { createSupabaseFileStore } from "./object-store";

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
}

const archive = createSupabaseStorageArchive({ url, secretKey });
const bucket = "object-images";
const store = createSupabaseFileStore({ url, secretKey, bucket });

describe("Supabase storage archive (local stack)", () => {
  it("lists files in every bucket, also in nested folders", async () => {
    const key = `test/${randomUUID()}/nested/${randomUUID()}.webp`;
    await store.put(key, new Uint8Array([1, 2, 3]), "image/webp");

    const files = await archive.files();

    expect(files).toContainEqual({
      bucket,
      key,
      contentType: "image/webp",
      size: 3,
    });
    expect(new Set(files.map((file) => file.bucket))).toContain(bucket);
    await store.remove(key);
  });

  it("reads and writes a file in a named bucket", async () => {
    const key = `test/${randomUUID()}.webp`;
    const file = { bucket, key, contentType: "image/webp", size: 2 };

    await archive.put(file, new Uint8Array([7, 8]));
    expect(await archive.get(bucket, key)).toEqual(new Uint8Array([7, 8]));

    await archive.put(file, new Uint8Array([9]));
    expect(await archive.get(bucket, key)).toEqual(new Uint8Array([9]));
    await store.remove(key);
  });
});

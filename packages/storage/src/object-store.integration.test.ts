import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSupabaseFileStore,
  StorageUnavailableError,
} from "./object-store";

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
}

const bucket = "object-images";
const store = createSupabaseFileStore({ url, secretKey, bucket });
const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);

describe("Supabase file store (local stack)", () => {
  it("stores, replaces, reads and removes a file", async () => {
    const key = `test/${randomUUID()}.webp`;

    await store.put(key, bytes, "image/webp");
    expect(await store.get(key)).toEqual(bytes);

    await store.put(key, new Uint8Array([9]), "image/webp");
    expect(await store.get(key)).toEqual(new Uint8Array([9]));

    await store.remove(key);
    expect(await store.get(key)).toBeNull();
  });

  it("treats a missing file as absent and its removal as done", async () => {
    const key = `test/${randomUUID()}.webp`;

    expect(await store.get(key)).toBeNull();
    await expect(store.remove(key)).resolves.toBeUndefined();
  });

  it("only accepts the image type the bucket allows", async () => {
    await expect(
      store.put(`test/${randomUUID()}.html`, bytes, "text/html"),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it("keeps the bucket private: no public or anonymous reads", async () => {
    const key = `test/${randomUUID()}.webp`;
    await store.put(key, bytes, "image/webp");

    const publicUrl = await fetch(
      `${url}/storage/v1/object/public/${bucket}/${key}`,
    );
    const anonymous = await fetch(`${url}/storage/v1/object/${bucket}/${key}`);

    expect(publicUrl.ok).toBe(false);
    expect(anonymous.ok).toBe(false);
    await store.remove(key);
  });

  it("fails without revealing provider details on a bad key", async () => {
    const broken = createSupabaseFileStore({
      url,
      secretKey: "sb_secret_not-a-real-key",
      bucket,
    });

    const error = await broken
      .put(`test/${randomUUID()}.webp`, bytes, "image/webp")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageUnavailableError);
    expect((error as Error).message).toBe("File storage upload failed");
  });
});

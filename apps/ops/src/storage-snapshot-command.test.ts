import { MemoryStorageArchive } from "@lanbort/storage/testing";
import { describe, expect, it } from "vitest";
import {
  runStorageSnapshotCommand,
  type SnapshotIo,
} from "./storage-snapshot-command";

function memoryIo(): SnapshotIo & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();

  return {
    files,
    readFile: async (path) => {
      const content = files.get(path);
      if (!content) throw new Error(`ENOENT ${path}`);
      return content;
    },
    writeFile: async (path, content) => {
      if (files.has(path)) throw new Error(`EEXIST ${path}`);
      files.set(path, content);
    },
  };
}

const bytes = (...values: number[]) => new Uint8Array(values);

async function source() {
  const archive = new MemoryStorageArchive([
    "object-images",
    "profile-pictures",
  ]);
  await archive.put(
    {
      bucket: "object-images",
      key: "o1/a.webp",
      contentType: "image/webp",
      size: 0,
    },
    bytes(1, 2, 3),
  );
  await archive.put(
    {
      bucket: "object-images",
      key: "o2/b.webp",
      contentType: "image/webp",
      size: 0,
    },
    bytes(4),
  );
  await archive.put(
    {
      bucket: "profile-pictures",
      key: "u1.webp",
      contentType: "image/webp",
      size: 0,
    },
    bytes(5, 6),
  );
  return archive;
}

describe("ops:storage", () => {
  it("exports every file and imports it into empty buckets, unchanged", async () => {
    const io = memoryIo();
    const exported = await runStorageSnapshotCommand(
      await source(),
      ["export", "--to", "snap"],
      io,
    );

    expect(exported).toEqual({
      exitCode: 0,
      message: "Exported 3 files (object-images: 2, profile-pictures: 1).",
    });

    const target = new MemoryStorageArchive([
      "object-images",
      "profile-pictures",
    ]);
    const imported = await runStorageSnapshotCommand(
      target,
      ["import", "--from", "snap"],
      io,
    );

    expect(imported.exitCode).toBe(0);
    expect(imported.message).toBe(
      "Imported 3 files (object-images: 2, profile-pictures: 1).",
    );
    expect(await target.get("object-images", "o1/a.webp")).toEqual(
      bytes(1, 2, 3),
    );
    expect(await target.get("profile-pictures", "u1.webp")).toEqual(
      bytes(5, 6),
    );
  });

  it("never names a file in its output", async () => {
    const io = memoryIo();
    const exported = await runStorageSnapshotCommand(
      await source(),
      ["export", "--to", "snap"],
      io,
    );

    expect(exported.message).not.toMatch(/webp|o1|u1/);
  });

  it("never overwrites an earlier snapshot", async () => {
    const io = memoryIo();
    await runStorageSnapshotCommand(
      await source(),
      ["export", "--to", "snap"],
      io,
    );

    await expect(
      runStorageSnapshotCommand(await source(), ["export", "--to", "snap"], io),
    ).rejects.toThrow(/EEXIST/);
  });

  it("refuses a damaged file instead of importing it", async () => {
    const io = memoryIo();
    await runStorageSnapshotCommand(
      await source(),
      ["export", "--to", "snap"],
      io,
    );
    io.files.set("snap/files/object-images/o1/a.webp", bytes(9, 9, 9));

    const target = new MemoryStorageArchive([
      "object-images",
      "profile-pictures",
    ]);
    const imported = await runStorageSnapshotCommand(
      target,
      ["import", "--from", "snap"],
      io,
    );

    expect(imported.exitCode).toBe(1);
    expect(imported.message).toContain("1 damaged in the snapshot");
    expect((await target.files()).length).toBe(2);
  });

  it("refuses a file name that would leave the snapshot", async () => {
    const archive = new MemoryStorageArchive(["object-images"]);
    await archive.put(
      {
        bucket: "object-images",
        key: "../escape",
        contentType: "image/webp",
        size: 0,
      },
      bytes(1),
    );

    await expect(
      runStorageSnapshotCommand(
        archive,
        ["export", "--to", "snap"],
        memoryIo(),
      ),
    ).rejects.toThrow(/cannot be stored safely/);
  });

  it("fails when a bucket is missing in the target", async () => {
    const io = memoryIo();
    await runStorageSnapshotCommand(
      await source(),
      ["export", "--to", "snap"],
      io,
    );

    await expect(
      runStorageSnapshotCommand(
        new MemoryStorageArchive(["object-images"]),
        ["import", "--from", "snap"],
        io,
      ),
    ).rejects.toThrow(/No bucket profile-pictures/);
  });

  it("explains its use on anything else", async () => {
    for (const argv of [
      [],
      ["export"],
      ["import", "--to", "x"],
      ["export", "--to", "a", "b"],
    ]) {
      expect(
        (
          await runStorageSnapshotCommand(
            new MemoryStorageArchive([]),
            argv,
            memoryIo(),
          )
        ).exitCode,
      ).toBe(2);
    }
  });
});

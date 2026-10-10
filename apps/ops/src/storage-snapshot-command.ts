import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import type { StorageArchive, StoredFile } from "@lanbort/storage";
import type { CommandOutcome } from "./restore-command";

export const usage = `Copies the files in Supabase Storage, which a database backup does not
hold (WP-72, docs/implementation/backup-restore.md).

  pnpm ops:storage export --to <dir>
      Reads every file in every bucket into <dir>, with a manifest of
      checksums. Never writes to the storage it reads.
  pnpm ops:storage import --from <dir>
      Writes the files in <dir> to the storage (the buckets must exist, as
      after a database restore) and checks each one by reading it back.

SUPABASE_URL and SUPABASE_SECRET_KEY name the storage. Output holds counts
only, never file names. Exit code 0 means every file is in place.
`;

export interface ManifestEntry extends StoredFile {
  readonly sha256: string;
}

/** Where the command reads and writes files; fakes in tests. */
export interface SnapshotIo {
  readFile(path: string): Promise<Uint8Array>;
  /** Fails if the file exists: a snapshot is never overwritten. */
  writeFile(path: string, content: Uint8Array): Promise<void>;
}

const manifestName = "manifest.jsonl";
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * Keys come from the storage being read. A key that could leave the
 * snapshot directory is refused rather than written.
 */
function filePath(dir: string, { bucket, key }: StoredFile): string {
  const parts = [bucket, ...key.split("/")];

  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("A bucket or file name cannot be stored safely.");
  }

  return [dir, "files", ...parts].join("/");
}

function countLine(verb: string, files: readonly StoredFile[]): string {
  const perBucket = new Map<string, number>();

  for (const { bucket } of files) {
    perBucket.set(bucket, (perBucket.get(bucket) ?? 0) + 1);
  }

  const buckets = [...perBucket]
    .map(([bucket, count]) => `${bucket}: ${count}`)
    .join(", ");

  return `${verb} ${files.length} ${files.length === 1 ? "file" : "files"}${buckets ? ` (${buckets})` : ""}.`;
}

async function exportFiles(
  archive: StorageArchive,
  dir: string,
  io: SnapshotIo,
): Promise<CommandOutcome> {
  const files = await archive.files();
  const manifest: ManifestEntry[] = [];

  for (const file of files) {
    const bytes = await archive.get(file.bucket, file.key);
    await io.writeFile(filePath(dir, file), bytes);
    manifest.push({ ...file, size: bytes.length, sha256: sha256(bytes) });
  }

  await io.writeFile(
    `${dir}/${manifestName}`,
    new TextEncoder().encode(
      manifest.map((entry) => `${JSON.stringify(entry)}\n`).join(""),
    ),
  );

  return { exitCode: 0, message: countLine("Exported", manifest) };
}

async function importFiles(
  archive: StorageArchive,
  dir: string,
  io: SnapshotIo,
): Promise<CommandOutcome> {
  const manifest = new TextDecoder()
    .decode(await io.readFile(`${dir}/${manifestName}`))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ManifestEntry);
  let damaged = 0;
  let mismatched = 0;

  for (const entry of manifest) {
    const bytes = await io.readFile(filePath(dir, entry));

    if (sha256(bytes) !== entry.sha256) {
      damaged += 1;
      continue;
    }

    await archive.put(entry, bytes);

    if (sha256(await archive.get(entry.bucket, entry.key)) !== entry.sha256) {
      mismatched += 1;
    }
  }

  const lines = [countLine("Imported", manifest)];

  if (damaged > 0) {
    lines.push(`${damaged} damaged in the snapshot and not imported.`);
  }
  if (mismatched > 0) {
    lines.push(`${mismatched} read back differently after import.`);
  }

  return damaged + mismatched === 0
    ? { exitCode: 0, message: lines.join("\n") }
    : { exitCode: 1, message: lines.join("\n") };
}

export async function runStorageSnapshotCommand(
  archive: StorageArchive,
  argv: readonly string[],
  io: SnapshotIo,
): Promise<CommandOutcome> {
  let parsed;

  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: { to: { type: "string" }, from: { type: "string" } },
    });
  } catch {
    return { exitCode: 2, message: usage };
  }

  const [action, ...rest] = parsed.positionals;
  const { to, from } = parsed.values;

  if (rest.length === 0 && action === "export" && to && !from) {
    return exportFiles(archive, to, io);
  }
  if (rest.length === 0 && action === "import" && from && !to) {
    return importFiles(archive, from, io);
  }

  return { exitCode: 2, message: usage };
}

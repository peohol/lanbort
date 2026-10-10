import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createSupabaseStorageArchive } from "@lanbort/storage";
import { runStorageSnapshotCommand } from "./storage-snapshot-command";

// Locally the repository's .env is used; explicit variables win.
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY are not set.");
  process.exit(2);
}

// pnpm runs the script in apps/ops; paths are meant from where it was called.
const here = (path: string) => resolve(process.env.INIT_CWD ?? ".", path);

const outcome = await runStorageSnapshotCommand(
  createSupabaseStorageArchive({ url, secretKey }),
  process.argv.slice(2),
  {
    readFile: async (path) => new Uint8Array(await readFile(here(path))),
    writeFile: async (path, content) => {
      await mkdir(dirname(here(path)), { recursive: true, mode: 0o700 });
      await writeFile(here(path), content, { flag: "wx", mode: 0o600 });
    },
  },
);

(outcome.exitCode === 0 ? console.log : console.error)(outcome.message);
process.exitCode = outcome.exitCode;

// Copies MapLibre's worker, and the module it imports, from the installed
// package to public/maplibre/<version>/, where the map loads it from the
// app's own origin (src/map/provider.ts). Runs before every dev and build,
// so the worker always matches the installed library.
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const manifest = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(manifest, "utf8"));
const source = join(dirname(manifest), "dist");
const publicDir = fileURLToPath(
  new URL("../public/maplibre/", import.meta.url),
);
const target = join(publicDir, version);

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  cpSync(join(source, file), join(target, file));
}

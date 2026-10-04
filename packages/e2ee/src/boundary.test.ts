import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..");

/**
 * Code that runs on the server may never import the client-side crypto
 * package (ADR-0010): the server relays ciphertext and public keys, and
 * never holds anything that can decrypt a private message. That is every
 * package and app except this one, and in the web app every module except
 * client components (`"use client"`), since App Router pages, layouts, route
 * handlers and the proxy all run on the server. Helpers that only client
 * components use carry the directive too.
 */
const serverSources = () => [
  ...readdirSync(join(root, "packages"))
    .filter((name) => name !== "e2ee")
    .map((name) => `packages/${name}/src`),
  ...readdirSync(join(root, "apps")).map((name) => `apps/${name}/src`),
];

const isClientComponent = (source: string) =>
  /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(source);

const importsCrypto = (source: string) =>
  /["']@lanbort\/e2ee["'/]|["']ts-mls["'/]/.test(source);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry)) yield path;
  }
}

describe("server boundary (ADR-0010)", () => {
  it("keeps the crypto package out of every server module", () => {
    const offenders = serverSources()
      .flatMap((dir) => [...sourceFiles(join(root, dir))])
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return importsCrypto(source) && !isClientComponent(source);
      })
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });
});

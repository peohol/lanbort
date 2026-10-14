import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { iconColours, logo, logoSvg } from "./logo";

describe("logo", () => {
  it("gives the tab's icon the light theme's tomat, text and surface", () => {
    const css = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    const light = css.slice(css.indexOf(":root {"));
    const token = (name: string) =>
      light.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1];

    expect(iconColours).toEqual({
      stem: token("--color-accent"),
      bowl: token("--color-text"),
      background: token("--color-surface"),
    });
  });

  it("draws the same mark in the tab as in the app", () => {
    const svg = logoSvg();

    expect(svg).toContain(`d="${logo.stem}" stroke="${iconColours.stem}"`);
    expect(svg).toContain(`d="${logo.bowl}" stroke="${iconColours.bowl}"`);
    expect(svg).toContain(`fill="${iconColours.background}"`);
    expect(logoSvg({ radius: 0 })).toContain('rx="0"');
  });
});

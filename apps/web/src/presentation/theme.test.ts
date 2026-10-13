import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTheme, themeAttribute, themeCookieString, themes } from "./theme";

describe("theme", () => {
  it("reads a chosen theme, and anything else as the device's", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme("blue")).toBe("system");
  });

  it("puts only a chosen theme on the page", () => {
    expect(themeAttribute("system")).toBeUndefined();
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
  });

  it("keeps a chosen theme for a year, and forgets it for the device's", () => {
    expect(themeCookieString("dark", true)).toBe(
      "lanbort-tema=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(themeCookieString("light", false)).toBe(
      "lanbort-tema=light; Path=/; Max-Age=31536000; SameSite=Lax",
    );
    expect(themeCookieString("system", true)).toBe(
      "lanbort-tema=; Path=/; Max-Age=0; SameSite=Lax; Secure",
    );
    for (const theme of themes) {
      expect(parseTheme(themeCookieString(theme, false).split(/[=;]/)[1])).toBe(
        theme,
      );
    }
  });

  it("gives a chosen dark theme the same colours as a dark device", () => {
    const css = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    const tokens = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start).toBeGreaterThan(-1);
      const body = css.slice(start, css.indexOf("}", start));
      return [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
        ([, name, value]) => `${name}: ${value}`,
      );
    };
    const chosen = tokens(':root[data-theme="dark"]');

    expect(chosen.length).toBeGreaterThan(20);
    expect(tokens(':root:not([data-theme="light"])')).toEqual(chosen);
  });
});

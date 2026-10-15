import { describe, expect, it } from "vitest";
import { deviceName, distinctNames, suggestedName } from "./device-names";

describe("suggestedName", () => {
  it.each([
    [{ kind: "mobile", system: "ios", browser: "safari" }, "iPhone · Safari"],
    [
      { kind: "computer", system: "windows", browser: "edge" },
      "Windows-PC · Edge",
    ],
    [{ kind: "tablet", system: "android", browser: null }, "Android-nettbrett"],
    [{ kind: "tablet", system: null, browser: "chrome" }, "Nettbrett · Chrome"],
    [{ kind: null, system: "linux", browser: null }, "Linux"],
  ] as const)("names %o «%s»", (description, name) => {
    expect(suggestedName(description)).toBe(name);
  });

  it("makes up nothing when nothing is known, not even from the browser", () => {
    expect(
      suggestedName({ kind: null, system: null, browser: "firefox" }),
    ).toBeNull();
    expect(deviceName({ deviceId: "a1b2c3d4-0000", label: null })).toBe(
      "Enhet A1B2",
    );
  });
});

describe("distinctNames", () => {
  const pc = { kind: "computer", system: "windows", browser: "edge" } as const;

  it("tells two devices called alike apart by their ids, and no others", () => {
    const names = distinctNames([
      { deviceId: "aaaa1111", label: { name: null, ...pc } },
      { deviceId: "bbbb2222", label: { name: "windows-pc · edge", ...pc } },
      { deviceId: "cccc3333", label: { name: "Jobb-PC", ...pc } },
    ]);
    expect([...names.values()]).toEqual([
      "Windows-PC · Edge (AAAA)",
      "windows-pc · edge (BBBB)",
      "Jobb-PC",
    ]);
  });
});

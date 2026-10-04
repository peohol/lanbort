import type { FoundObject } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  describeAvailability,
  describeFoundIn,
  prepareEnvironmentSearch,
  prepareObjectSearch,
  readFinnForm,
} from "./search";

const category = "tools";
const id = "00000000-0000-4000-8000-000000000001";

const found = (details: Partial<FoundObject>) =>
  ({
    availableForNewLoans: true,
    effectiveAvailability: [{ start: "2026-10-04", end: "2026-10-20" }],
    foundIn: [],
    ...details,
  }) as FoundObject;

describe("Finn's form", () => {
  it("reads the address the form submits", () => {
    expect(
      readFinnForm({ q: "  drill ", kategori: category, fra: "2026-10-05" }),
    ).toEqual({
      tab: "objects",
      q: "drill",
      category,
      from: "2026-10-05",
      to: "",
      type: "",
    });
    expect(readFinnForm({ vis: "miljoer", q: ["sykkel", "x"] })).toMatchObject({
      tab: "environments",
      q: "sykkel",
    });
  });

  it("searches only when asked something", () => {
    expect(prepareObjectSearch(readFinnForm({ fra: "2026-10-05" }))).toBe(null);
    expect(prepareEnvironmentSearch(readFinnForm({ type: "open" }))).toBe(null);
  });

  it("searches things by text or category, within a whole period", () => {
    expect(prepareObjectSearch(readFinnForm({ kategori: category }))).toEqual({
      input: { categoryId: category },
    });
    expect(
      prepareObjectSearch(
        readFinnForm({ q: "drill", fra: "2026-10-05", til: "2026-10-07" }),
      ),
    ).toEqual({
      input: {
        q: "drill",
        availableFrom: "2026-10-05",
        availableTo: "2026-10-07",
      },
    });
  });

  it("says in words what to change", () => {
    expect(prepareObjectSearch(readFinnForm({ q: "d" }))).toEqual({
      problem: "Skriv minst to tegn.",
    });
    expect(prepareEnvironmentSearch(readFinnForm({ q: "d" }))).toEqual({
      problem: "Skriv minst to tegn.",
    });
    expect(prepareObjectSearch(readFinnForm({ kategori: "Verktøy" }))).toEqual({
      problem: "Velg en kategori fra listen.",
    });
    for (const period of [
      { fra: "2026-10-05" },
      { fra: "2026-10-07", til: "2026-10-05" },
    ]) {
      expect(
        prepareObjectSearch(readFinnForm({ q: "drill", ...period })),
      ).toHaveProperty("problem", expect.stringContaining("første og siste"));
    }
  });

  it("searches environments of one type or both", () => {
    expect(
      prepareEnvironmentSearch(readFinnForm({ q: "sykkel", type: "closed" })),
    ).toEqual({ input: { q: "sykkel", type: "closed" } });
    expect(prepareEnvironmentSearch(readFinnForm({ q: "sykkel" }))).toEqual({
      input: { q: "sykkel" },
    });
  });
});

describe("found things in the user's words", () => {
  it("says when a thing can be borrowed, not what blocks it", () => {
    expect(describeAvailability(found({}), "2026-10-04")).toBe("Ledig nå");
    expect(
      describeAvailability(
        found({
          effectiveAvailability: [{ start: "2026-10-10", end: "2026-10-20" }],
        }),
        "2026-10-04",
      ),
    ).toBe("Ledig fra lørdag 10. oktober");
    expect(
      describeAvailability(
        found({ availableForNewLoans: false }),
        "2026-10-04",
      ),
    ).toBe("Ikke ledig for nye lån nå");
    expect(
      describeAvailability(found({ effectiveAvailability: [] }), "2026-10-04"),
    ).toBe("Ikke ledig for nye lån nå");
  });

  it("names the user's environments it is found in", () => {
    const place = (environmentName: string) => ({
      environmentId: id,
      environmentName,
      publicationId: id,
    });
    expect(
      describeFoundIn(found({ foundIn: [place("Gata"), place("Hytta")] })),
    ).toBe("I Gata, Hytta");
  });
});

import type { AvailabilityInterval } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  availabilityLine,
  availabilityStatus,
  categoryLabel,
  describeAvailability,
  formatInterval,
  freeDays,
  freeThrough,
  listSeparator,
  ownersLabel,
  ownThingStatus,
  requestAvailability,
  seenBecause,
} from "./objects";

const found = (details: {
  availableForNewLoans?: boolean;
  effectiveAvailability?: AvailabilityInterval[];
}) => ({
  availableForNewLoans: true,
  effectiveAvailability: [{ start: "2026-10-04", end: "2026-10-20" }],
  ...details,
});

describe("a thing in the user's words", () => {
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

  it("says once when a thing can be asked for, its periods only when there are several", () => {
    expect(
      requestAvailability(
        found({ effectiveAvailability: [{ start: "2026-10-12", end: null }] }),
        "2026-10-04",
      ),
    ).toBe("Ledig fra mandag 12. oktober.");
    expect(
      requestAvailability(
        found({
          effectiveAvailability: [
            { start: "2026-10-04", end: "2026-10-06" },
            { start: "2026-10-12", end: null },
          ],
        }),
        "2026-10-04",
      ),
    ).toBe(
      "Ledig nå. Ledige perioder: søndag 4. oktober – tirsdag 6. oktober, Fra mandag 12. oktober.",
    );
  });

  it("gives availability a tone that matches its words", () => {
    expect(availabilityStatus(found({}), "2026-10-04").tone).toBe("positive");
    expect(
      availabilityStatus(
        found({
          effectiveAvailability: [{ start: "2026-10-10", end: null }],
        }),
        "2026-10-04",
      ).tone,
    ).toBe("waiting");
    expect(
      availabilityStatus(found({ availableForNewLoans: false }), "2026-10-04")
        .tone,
    ).toBe("neutral");
  });

  it("says an interval as people say it, open or bounded", () => {
    expect(formatInterval({ start: "2026-10-10", end: null })).toBe(
      "Fra lørdag 10. oktober",
    );
    expect(formatInterval({ start: "2026-10-10", end: "2026-10-10" })).toBe(
      "lørdag 10. oktober",
    );
    expect(formatInterval({ start: "2026-10-10", end: "2026-10-12" })).toBe(
      "lørdag 10. oktober – mandag 12. oktober",
    );
  });

  it("names a category by its label", () => {
    const categories = [{ id: "tools", parentId: null, label: "Verktøy" }];
    expect(categoryLabel(categories, "tools")).toBe("Verktøy");
    expect(categoryLabel(categories, "other")).toBe("other");
  });
});

describe("one of the user's own things in a list", () => {
  const own = (details: Partial<Parameters<typeof ownThingStatus>[0]>) => ({
    status: "active" as const,
    availability: [{ start: "2026-10-01", end: null }],
    availableForNewLoans: true,
    frozenForNewLoans: false,
    restrictions: [],
    lentOut: false,
    ...details,
  });
  const today = "2026-10-06";
  const label = (details: Parameters<typeof own>[0]) =>
    ownThingStatus(own(details), today).label;

  it("says whether it can be lent out, is lent out, blocked or archived", () => {
    expect(label({})).toBe("Kan lånes ut");
    expect(label({ lentOut: true })).toBe("Utlånt");
    expect(label({ status: "archived", lentOut: true })).toBe("Arkivert");
    expect(label({ frozenForNewLoans: true })).toBe("Sperret for nye lån");
    expect(
      label({
        restrictions: [
          {
            id: "r",
            setByUserId: "u",
            period: null,
            createdAt: "2026-10-01T00:00:00Z",
          },
        ],
      }),
    ).toBe("Sperret for nye lån");
  });

  it("tells an owner when it has no time left to be lent in", () => {
    expect(label({ availability: [], availableForNewLoans: false })).toBe(
      "Mangler ledig tid",
    );
    expect(
      label({
        availability: [{ start: "2026-09-01", end: "2026-09-30" }],
        availableForNewLoans: false,
      }),
    ).toBe("Mangler ledig tid");
    expect(label({ availableForNewLoans: false })).toBe("Ikke ledig nå");
  });
});

describe("owners of a thing in an environment (PS-ENV-015)", () => {
  const owner = (realName: string) => ({
    realName,
    profileId: null,
    pictureId: null,
  });
  const said = (names: string[]) =>
    names
      .map((name, index) => listSeparator(index, names.length) + name)
      .join("");

  it("lists names as they are said", () => {
    expect(said(["Anna"])).toBe("Anna");
    expect(said(["Anna", "Bo"])).toBe("Anna og Bo");
    expect(said(["Anna", "Bo", "Cleo"])).toBe("Anna, Bo og Cleo");
  });

  it("heads one owner or several", () => {
    expect(ownersLabel([owner("Anna")])).toBe("Eier");
    expect(ownersLabel([owner("Anna"), owner("Bo")])).toBe("Eiere");
  });
});

describe("availabilityLine", () => {
  it("says «any time» for one open period that has begun", () => {
    expect(
      availabilityLine([{ start: "2026-10-01", end: null }], "2026-10-09"),
    ).toBe("Når som helst, fra torsdag 1. oktober");
  });

  it("lists periods otherwise", () => {
    expect(
      availabilityLine(
        [
          { start: "2026-10-12", end: "2026-10-14" },
          { start: "2026-11-01", end: null },
        ],
        "2026-10-09",
      ),
    ).toBe("mandag 12. oktober – onsdag 14. oktober, Fra søndag 1. november");
    expect(availabilityLine([], "2026-10-09")).toBe("");
  });
});

describe("the week strip on a thing's page", () => {
  const object = found({
    effectiveAvailability: [
      { start: "2026-10-08", end: "2026-10-12" },
      { start: "2026-10-14", end: null },
    ],
  });

  it("marks the days ahead that are free", () => {
    const days = freeDays(object, "2026-10-08");

    expect(days.map(({ date }) => date.slice(8))).toEqual([
      "08",
      "09",
      "10",
      "11",
      "12",
      "13",
      "14",
    ]);
    expect(days.map(({ free }) => free)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      true,
    ]);
    expect(freeThrough(object, days)).toBe("2026-10-12");
  });

  it("frees nothing while the thing takes no new loans, and says no end", () => {
    const closed = { ...object, availableForNewLoans: false };
    const days = freeDays(closed, "2026-10-08");

    expect(days.some(({ free }) => free)).toBe(false);
    expect(freeThrough(closed, days)).toBeNull();
    expect(freeThrough(object, freeDays(object, "2026-10-14"))).toBeNull();
  });
});

describe("why the reader sees a thing", () => {
  it("names the environment, or the owner's friends", () => {
    expect(seenBecause({ name: "Lia", member: true })).toBe(
      "Du ser tingen fordi du er medlem i Lia.",
    );
    expect(seenBecause({ name: "Lia", member: false })).toBe(
      "Du ser tingen fordi den er publisert i Lia.",
    );
    expect(seenBecause(null)).toBe(
      "Du ser tingen fordi eieren viser den for venner.",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  filterThings,
  freeBy,
  groupByCategory,
  type ListedThing,
  readThingFilter,
  thingFilterHref,
  toggleCategory,
} from "./thing-list";

const today = "2026-10-15";

const thing = (
  title: string,
  categoryId = "verktoy",
  start: string | null = today,
): ListedThing => ({
  title,
  categoryId,
  availableForNewLoans: start !== null,
  effectiveAvailability: start === null ? [] : [{ start, end: null }],
});

const categories = [
  { id: "verktoy", parentId: null, label: "Verktøy" },
  { id: "hage", parentId: null, label: "Hage og uteområde" },
  { id: "kjokken", parentId: null, label: "Kjøkken og husholdning" },
  { id: "sag", parentId: "verktoy", label: "Sager" },
];

const titles = (things: readonly ListedThing[]) =>
  things.map((each) => each.title);

describe("things grouped by category (UX-IA-021)", () => {
  it("follows the categories' order, leaving out empty ones", () => {
    const groups = groupByCategory(
      [thing("Kanne", "kjokken"), thing("Drill"), thing("Sirkelsag", "sag")],
      categories,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Verktøy",
      "Sager",
      "Kjøkken og husholdning",
    ]);
  });

  it("orders by the first letter or digit, numbers by value and æøå last", () => {
    const [group] = groupByCategory(
      [
        thing("Øks"),
        thing("«Ny» sag"),
        thing("10 klemmer"),
        thing("åre"),
        thing("2 stiger"),
        thing("Ærfugl"),
        thing("bor"),
      ],
      categories,
    );

    expect(titles(group!.things)).toEqual([
      "2 stiger",
      "10 klemmer",
      "bor",
      "«Ny» sag",
      "Ærfugl",
      "Øks",
      "åre",
    ]);
  });

  it("puts things in a category no longer offered last, together", () => {
    const groups = groupByCategory(
      [thing("Gammel", "utgatt"), thing("Drill")],
      categories,
    );

    expect(groups.map((group) => [group.label, titles(group.things)])).toEqual([
      ["Verktøy", ["Drill"]],
      ["Andre ting", ["Gammel"]],
    ]);
  });
});

describe("filtering a list of things", () => {
  it("keeps what is free now, or now and within two weeks", () => {
    const now = thing("Nå");
    const soon = thing("Snart", "verktoy", "2026-10-29");
    const later = thing("Senere", "verktoy", "2026-10-30");
    const never = thing("Aldri", "verktoy", null);
    const all = [now, soon, later, never];

    expect(all.filter((each) => freeBy(each, undefined, today))).toEqual(all);
    expect(all.filter((each) => freeBy(each, "na", today))).toEqual([now]);
    expect(all.filter((each) => freeBy(each, "snart", today))).toEqual([
      now,
      soon,
    ]);
  });

  it("keeps the chosen categories, or all when none is chosen", () => {
    const things = [
      thing("Drill"),
      thing("Rake", "hage"),
      thing("Kanne", "kjokken"),
    ];

    expect(
      titles(
        filterThings(
          things,
          { categoryIds: ["hage", "kjokken"], availability: undefined },
          today,
        ),
      ),
    ).toEqual(["Rake", "Kanne"]);
    expect(
      filterThings(things, { categoryIds: [], availability: undefined }, today),
    ).toEqual(things);
  });
});

describe("the filter in the address", () => {
  it("reads several categories and one known choice of time", () => {
    expect(
      readThingFilter({ kategorier: ["hage", "hage", "sag"], ledig: "snart" }),
    ).toEqual({ categoryIds: ["hage", "sag"], availability: "snart" });
    expect(readThingFilter({ ledig: "i-morgen" })).toEqual({
      categoryIds: [],
      availability: undefined,
    });
  });

  it("keeps the rest of the address and replaces only the filter", () => {
    const query = { q: "sag", kategorier: "hage", ledig: "na" };
    const chosen = readThingFilter(query);

    expect(
      thingFilterHref("/miljoer/1", query, toggleCategory(chosen, "sag")),
    ).toBe("/miljoer/1?q=sag&kategorier=hage&kategorier=sag&ledig=na");
    expect(
      thingFilterHref("/miljoer/1", query, {
        ...toggleCategory(chosen, "hage"),
        availability: undefined,
      }),
    ).toBe("/miljoer/1?q=sag");
    expect(
      thingFilterHref(
        "/finn",
        {},
        { categoryIds: [], availability: undefined },
      ),
    ).toBe("/finn");
  });
});

import { MemoryPlaceSearch } from "@lanbort/places/testing";
import { describe, expect, it } from "vitest";
import { describePlace, locate } from "./places";
import { readFinnForm } from "./search";

const bergen = {
  name: "Bergen",
  kind: "By",
  municipality: "Bergen",
  latitude: 60.39323,
  longitude: 5.3245,
};
const places = () =>
  new MemoryPlaceSearch([
    bergen,
    { ...bergen, kind: "Kommune", latitude: 60.392, longitude: 5.32802 },
    {
      name: "Bergen",
      kind: "Gard",
      municipality: "Hjartdal",
      latitude: 59.6111,
      longitude: 8.92095,
    },
  ]);

describe("the place Finn searches near (WP-62)", () => {
  it("is nothing until a place is given", async () => {
    expect(await locate(readFinnForm({ q: "drill" }), places())).toBeNull();
  });

  it("uses the best match, coarse, and offers the other places once each", async () => {
    const search = places();
    const result = await locate(
      readFinnForm({ sted: "Bergen", avstand: "25" }),
      search,
    );

    expect(search.searched).toEqual(["Bergen"]);
    expect(result).toEqual({
      location: {
        near: { latitude: 60.39, longitude: 5.32, radiusKm: 25 },
        label: "Bergen (by)",
        alternatives: [
          {
            label: "Bergen (gard i Hjartdal)",
            name: "Bergen",
            point: "59.61,8.92",
          },
        ],
      },
    });
  });

  it("searches ten kilometres around unless told otherwise", async () => {
    expect(
      await locate(readFinnForm({ sted: "bergen" }), places()),
    ).toMatchObject({ location: { near: { radiusKm: 10 } } });
  });

  it("uses a point already chosen without asking again, still coarse", async () => {
    const search = places();

    expect(
      await locate(
        readFinnForm({
          sted: "Bergen",
          punkt: "59.61111,8.92095",
          punktsted: "Bergen",
        }),
        search,
      ),
    ).toEqual({
      location: {
        near: { latitude: 59.61, longitude: 8.92, radiusKm: 10 },
        label: "Bergen",
        alternatives: [],
      },
    });
    expect(
      await locate(
        readFinnForm({ punkt: "59.92,10.76", punktsted: "" }),
        search,
      ),
    ).toMatchObject({ location: { label: "der du er" } });
    expect(search.searched).toEqual([]);
  });

  it("explains in words what to change", async () => {
    const down = places();
    down.fail();

    for (const [params, problem] of [
      [{ sted: "Ingensteds" }, "Fant ikke noe sted som heter «Ingensteds»."],
      [{ sted: "B" }, "Skriv minst to tegn i stedet."],
      [{ sted: "Bergen", avstand: "3" }, "Velg en avstand fra listen."],
      [{ punkt: "91,10", punktsted: "" }, "Velg stedet på nytt."],
      [{ punkt: "nord", punktsted: "" }, "Velg stedet på nytt."],
    ] as const) {
      expect(await locate(readFinnForm(params), places())).toEqual({ problem });
    }
    expect(await locate(readFinnForm({ sted: "Bergen" }), down)).toEqual({
      problem:
        "Stedssøket svarer ikke akkurat nå. Prøv igjen om litt, eller søk uten sted.",
    });
  });

  it("tells places with one name apart", () => {
    expect(describePlace(bergen)).toBe("Bergen (by)");
    expect(
      describePlace({ ...bergen, kind: "Administrativ bydel", name: "Årstad" }),
    ).toBe("Årstad (administrativ bydel i Bergen)");
    expect(describePlace({ ...bergen, municipality: null })).toBe(
      "Bergen (by)",
    );
  });
});

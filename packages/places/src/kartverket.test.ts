import { describe, expect, it } from "vitest";
import { createKartverketPlaceSearch } from "./kartverket";
import { PlaceSearchError } from "./places";

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: URL[] = [];
  const fetch = (async (url: URL) => {
    calls.push(url);
    return respond();
  }) as unknown as typeof globalThis.fetch;

  return { calls, fetch };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Trimmed from a real answer for «Grünerløkka». */
const grunerlokka = {
  metadata: { totaltAntallTreff: 2 },
  navn: [
    {
      skrivemåte: "Grünerløkka",
      navneobjekttype: "Administrativ bydel",
      kommuner: [{ kommunenavn: "Oslo", kommunenummer: "0301" }],
      fylker: [{ fylkesnavn: "Oslo", fylkesnummer: "03" }],
      representasjonspunkt: { nord: 59.92011, øst: 10.75738 },
      stedsnummer: 570687,
    },
    {
      skrivemåte: "Grünerløkka",
      navneobjekttype: "Tettbebyggelse",
      representasjonspunkt: { nord: 59.9223, øst: 10.75819 },
    },
  ],
};

describe("Kartverket place search", () => {
  it("asks for place names in latitude and longitude, and keeps only what places need", async () => {
    const { calls, fetch } = fakeFetch(() => json(200, grunerlokka));
    const places = await createKartverketPlaceSearch({ fetch }).search(
      "Grünerløkka",
    );

    expect(places).toEqual([
      {
        name: "Grünerløkka",
        kind: "Administrativ bydel",
        municipality: "Oslo",
        latitude: 59.92011,
        longitude: 10.75738,
      },
      {
        name: "Grünerløkka",
        kind: "Tettbebyggelse",
        municipality: null,
        latitude: 59.9223,
        longitude: 10.75819,
      },
    ]);
    const [url] = calls as [URL];
    expect(url.origin + url.pathname).toBe(
      "https://ws.geonorge.no/stedsnavn/v1/navn",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      sok: "Grünerløkka",
      treffPerSide: "5",
      side: "1",
      utkoordsys: "4258",
    });
  });

  it("answers no places when nothing matches", async () => {
    const { fetch } = fakeFetch(() => json(200, { navn: [] }));
    await expect(
      createKartverketPlaceSearch({ fetch }).search("Ingensteds"),
    ).resolves.toEqual([]);
  });

  it.each([
    ["the provider is down", () => json(503, {}), "unavailable"],
    ["the provider is busy", () => json(429, {}), "unavailable"],
    ["the request is refused", () => json(400, {}), "rejected"],
    [
      "the answer is not as documented",
      () => json(200, { navn: [{}] }),
      "invalid_response",
    ],
    [
      "the answer is not JSON",
      () => new Response("<html>"),
      "invalid_response",
    ],
    [
      "the network fails",
      () => Promise.reject(new TypeError("fetch failed")),
      "unavailable",
    ],
  ] as const)("fails with a code only when %s", async (_, respond, code) => {
    const { fetch } = fakeFetch(respond);
    const search = createKartverketPlaceSearch({ fetch }).search("Oslo");

    await expect(search).rejects.toBeInstanceOf(PlaceSearchError);
    await expect(search).rejects.toMatchObject({
      code,
      message: `Place search failed: ${code}`,
    });
  });
});

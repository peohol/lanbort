import { z } from "zod";
import { type Place, type PlaceSearch, PlaceSearchError } from "./places";

export interface KartverketPlaceSearchConfig {
  /** For tests; the global fetch otherwise. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** How many places one search returns at most. */
  readonly limit?: number;
}

/** Kartverket's open place-name API (Sentralt stedsnavnregister). */
const endpoint = "https://ws.geonorge.no/stedsnavn/v1/navn";

/** Latitude and longitude (ETRS89, as GPS within a metre). */
const latitudeLongitude = "4258";

/** Only the fields used; the API returns more. */
const responseSchema = z.object({
  navn: z.array(
    z.object({
      skrivemåte: z.string().min(1),
      navneobjekttype: z.string().min(1),
      kommuner: z
        .array(z.object({ kommunenavn: z.string().min(1) }))
        .optional(),
      representasjonspunkt: z.object({
        nord: z.number().min(-90).max(90),
        øst: z.number().min(-180).max(180),
      }),
    }),
  ),
});

/**
 * Searches Kartverket's place names, Lånbort's first place provider
 * (ADR-0008). Place names, not addresses: an area is found by the
 * neighbourhood, town or municipality it is known by (PS-NFR-008).
 */
export function createKartverketPlaceSearch(
  config: KartverketPlaceSearchConfig = {},
): PlaceSearch {
  const get = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 5_000;
  const limit = config.limit ?? 5;

  return {
    async search(text) {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({
        sok: text,
        treffPerSide: String(limit),
        side: "1",
        utkoordsys: latitudeLongitude,
      }).toString();

      let response: Response;

      try {
        response = await get(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new PlaceSearchError("unavailable");
      }

      if (!response.ok) {
        throw new PlaceSearchError(
          response.status >= 500 || response.status === 429
            ? "unavailable"
            : "rejected",
        );
      }

      const parsed = responseSchema.safeParse(
        await response.json().catch(() => undefined),
      );

      if (!parsed.success) {
        throw new PlaceSearchError("invalid_response");
      }

      return parsed.data.navn.slice(0, limit).map((place): Place => ({
        name: place.skrivemåte,
        kind: place.navneobjekttype,
        municipality: place.kommuner?.[0]?.kommunenavn ?? null,
        latitude: place.representasjonspunkt.nord,
        longitude: place.representasjonspunkt.øst,
      }));
    },
  };
}

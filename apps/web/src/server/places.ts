import { createKartverketPlaceSearch, type PlaceSearch } from "@lanbort/places";

let places: PlaceSearch | undefined;

/**
 * Place names for searching near a place (WP-62, ADR-0008). Kartverket's
 * place names are open, so there is no secret to configure.
 */
export function placeSearch(): PlaceSearch {
  places ??= createKartverketPlaceSearch();

  return places;
}

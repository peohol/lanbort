import { consumeRateLimit, rateLimits, userScope } from "@lanbort/domain";
import { createKartverketPlaceSearch, type PlaceSearch } from "@lanbort/places";
import { runtime } from "./runtime";

let places: PlaceSearch | undefined;

/**
 * Place names for searching near a place (WP-62, ADR-0008), for one
 * signed-in user within their budget (WP-73), so nobody can use Lånbort to
 * query the provider in bulk. Kartverket's place names are open, so there
 * is no secret to configure.
 */
export function placeSearchFor(userId: string): PlaceSearch {
  places ??= createKartverketPlaceSearch();
  const provider = places;

  return {
    async search(text) {
      await consumeRateLimit(
        runtime.domain(),
        rateLimits.placeSearch,
        userScope(userId),
      );
      return provider.search(text);
    },
  };
}

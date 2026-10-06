import type { PlaceOption } from "@lanbort/contracts";
import { PlaceSearchError } from "@lanbort/places";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { placeSearchFor } from "@/server/places";
import { distinctChoices } from "@/presentation/places";

/**
 * `?sted=`: places by name, to set an environment's approximate area
 * (WP-62, WP-84). Only the text typed is sent on, and every point is
 * coarse before it leaves the server (PS-NFR-008).
 */
export const GET = route.user(async ({ request, actor }) => {
  const text = request.nextUrl.searchParams.get("sted")?.trim() ?? "";

  if (text.length < 2 || text.length > 100) {
    return errorResponse("invalid_input");
  }

  try {
    const found = await placeSearchFor(actor.userId).search(text);
    const places: PlaceOption[] = distinctChoices(found).map(
      ({ label, at }) => ({ label, ...at }),
    );

    return Response.json({ places });
  } catch (error) {
    if (error instanceof PlaceSearchError) {
      return errorResponse("unavailable");
    }

    throw error;
  }
});

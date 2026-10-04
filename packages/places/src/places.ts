/**
 * Place search for server code (ADR-0008, WP-62): turns what a user typed
 * into named places with a representative point. Callers see places and an
 * outcome, never the provider's API or URLs. Only the typed text is sent,
 * never who is asking or why.
 */
export interface Place {
  /** As the place is written, e.g. «Grünerløkka». */
  readonly name: string;
  /** What kind of place, in the provider's words, e.g. «Administrativ bydel». */
  readonly kind: string;
  /** The municipality it lies in, when the provider says. */
  readonly municipality: string | null;
  readonly latitude: number;
  readonly longitude: number;
}

export interface PlaceSearch {
  /** The best matches first; none when nothing matches. */
  search(text: string): Promise<readonly Place[]>;
}

/**
 * The provider gave no answer to use. Carries only a machine code, never the
 * text searched or the provider's own error text.
 */
export class PlaceSearchError extends Error {
  constructor(readonly code: "unavailable" | "rejected" | "invalid_response") {
    super(`Place search failed: ${code}`);
    this.name = "PlaceSearchError";
  }
}

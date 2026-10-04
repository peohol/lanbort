import { type Place, type PlaceSearch, PlaceSearchError } from "./places";

/**
 * Answers from a fixed list of places, by the start of their name, ignoring
 * case. Never used by production code. {@link fail} makes every search fail.
 */
export class MemoryPlaceSearch implements PlaceSearch {
  /** Every text searched, in order. */
  readonly searched: string[] = [];
  private failure: PlaceSearchError | undefined;

  constructor(private readonly places: readonly Place[]) {}

  fail(code: PlaceSearchError["code"] = "unavailable"): void {
    this.failure = new PlaceSearchError(code);
  }

  async search(text: string): Promise<readonly Place[]> {
    this.searched.push(text);

    if (this.failure) {
      throw this.failure;
    }

    const wanted = text.trim().toLocaleLowerCase("nb");

    return this.places.filter((place) =>
      place.name.toLocaleLowerCase("nb").startsWith(wanted),
    );
  }
}

export { PlaceSearchError };

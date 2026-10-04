import {
  type AreaRadiusKm,
  areaRadiusKmOptions,
  coarseCoordinate,
  type GeoArea,
  geoAreaSchema,
} from "@lanbort/contracts";
import {
  type Place,
  type PlaceSearch,
  PlaceSearchError,
} from "@lanbort/places";
import type { FinnForm } from "./search";

/** How far around a place Finn looks unless the user says otherwise. */
export const defaultDistanceKm: AreaRadiusKm = 10;

export const distanceOptions = areaRadiusKmOptions;

/** Another place with the same name, to search near instead. */
export interface PlaceChoice {
  readonly label: string;
  readonly name: string;
  /** `lat,lon`, already no more precise than the search uses. */
  readonly point: string;
}

/** Where Finn searches near, and in words, which place that is. */
export interface Location {
  readonly near: GeoArea;
  readonly label: string;
  readonly alternatives: readonly PlaceChoice[];
}

/**
 * The place a search is near (WP-62), why there is none, or nothing when
 * no place was given. A place named in words is looked up with the place
 * search, the best match is used and the others are offered; only the text
 * typed is sent, and every point is coarse before it goes further
 * (PS-NFR-008).
 */
export async function locate(
  form: FinnForm,
  places: PlaceSearch,
): Promise<{ location: Location } | { problem: string } | null> {
  if (!form.place && !form.point) {
    return null;
  }

  const radiusKm = form.distance ? Number(form.distance) : defaultDistanceKm;

  if (!distanceOptions.some((option) => option === radiusKm)) {
    return { problem: "Velg en avstand fra listen." };
  }

  if (form.point) {
    const [latitude, longitude] = form.point.split(",");
    const near = geoAreaSchema.safeParse({ latitude, longitude, radiusKm });

    return near.success
      ? {
          location: {
            near: near.data,
            label: form.place || "der du er",
            alternatives: [],
          },
        }
      : { problem: "Velg stedet på nytt." };
  }

  if (form.place.length < 2) {
    return { problem: "Skriv minst to tegn i stedet." };
  }

  let found: readonly Place[];

  try {
    found = await places.search(form.place);
  } catch (error) {
    if (!(error instanceof PlaceSearchError)) throw error;

    return {
      problem:
        "Stedssøket svarer ikke akkurat nå. Prøv igjen om litt, eller søk uten sted.",
    };
  }

  const choices = distinctChoices(found);
  const [best, ...others] = choices;

  if (!best) {
    return { problem: `Fant ikke noe sted som heter «${form.place}».` };
  }

  return {
    location: {
      near: geoAreaSchema.parse({ ...best.at, radiusKm }),
      label: best.label,
      alternatives: others.map(({ label, name, point }) => ({
        label,
        name,
        point,
      })),
    },
  };
}

/**
 * Places in order, leaving out any within about two kilometres of one
 * before it: the same spot twice («Bergen», the town and the municipality)
 * is no choice.
 */
function distinctChoices(found: readonly Place[]) {
  const kept: (PlaceChoice & {
    at: { latitude: number; longitude: number };
  })[] = [];

  for (const place of found) {
    const at = {
      latitude: coarseCoordinate(place.latitude),
      longitude: coarseCoordinate(place.longitude),
    };
    const sameSpot = kept.some(
      (choice) =>
        Math.abs(choice.at.latitude - at.latitude) <= 0.02 &&
        Math.abs(choice.at.longitude - at.longitude) <= 0.04,
    );

    if (!sameSpot) {
      kept.push({
        label: describePlace(place),
        name: place.name,
        point: `${at.latitude},${at.longitude}`,
        at,
      });
    }
  }

  return kept;
}

/** «Bergen (gard i Hjartdal)»: enough to tell places with one name apart. */
export function describePlace(place: Place): string {
  const kind = place.kind.toLocaleLowerCase("nb");
  const within =
    place.municipality && place.municipality !== place.name
      ? ` i ${place.municipality}`
      : "";

  return `${place.name} (${kind}${within})`;
}

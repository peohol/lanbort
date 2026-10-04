import { z } from "zod";

/**
 * PS-NFR-008: a place is never kept or searched more precisely than
 * hundredths of a degree, about a kilometre. The database rounds the same
 * way, so a more precise point cannot be stored whatever a client sends.
 */
const coordinateScale = 100;

export const coarseCoordinate = (value: number): number =>
  Math.round(value * coordinateScale) / coordinateScale;

/** The sizes an approximate area, or the distance searched, may have. */
export const areaRadiusKmOptions = [1, 2, 5, 10, 25, 50, 100] as const;

/** Numbers also arrive as text, from the address of a search. */
const numeric = z.union([
  z.number(),
  z.string().trim().min(1).transform(Number),
]);

const coordinate = (limit: number) =>
  numeric.pipe(z.number().min(-limit).max(limit).transform(coarseCoordinate));

export const latitudeSchema = coordinate(90);
export const longitudeSchema = coordinate(180);
export const areaRadiusKmSchema = numeric.pipe(z.literal(areaRadiusKmOptions));

/**
 * An approximate area (vision 08, «Geografisk informasjon og presisjon»): a
 * centre and how far around it, never an address.
 */
export const geoAreaSchema = z.strictObject({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  radiusKm: areaRadiusKmSchema,
});

/**
 * An area to search within, as flat parameters of a search's address
 * (`latitude`, `longitude`, `radiusKm`): all three, or none.
 */
export const nearSearchShape = {
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  radiusKm: areaRadiusKmSchema.optional(),
};

type NearSearch = {
  latitude?: number | undefined;
  longitude?: number | undefined;
  radiusKm?: GeoArea["radiusKm"] | undefined;
};

export const completeNearSearch = ({
  latitude,
  longitude,
  radiusKm,
}: NearSearch) =>
  [latitude, longitude, radiusKm].every((value) => value === undefined) ||
  [latitude, longitude, radiusKm].every((value) => value !== undefined);

/** The area a search is within, if it has one. */
export function nearOf({
  latitude,
  longitude,
  radiusKm,
}: NearSearch): GeoArea | undefined {
  return latitude === undefined ||
    longitude === undefined ||
    radiusKm === undefined
    ? undefined
    : { latitude, longitude, radiusKm };
}

export type GeoArea = z.infer<typeof geoAreaSchema>;
export type AreaRadiusKm = GeoArea["radiusKm"];

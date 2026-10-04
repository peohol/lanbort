import type { GeoArea } from "@lanbort/contracts";

/** [longitude, latitude], as maps and GeoJSON order them. */
export type Position = [number, number];

const earthRadiusKm = 6371.0088;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** The point `km` away from the centre in the direction `bearing` (radians). */
function destination(area: GeoArea, km: number, bearing: number): Position {
  const latitude = toRadians(area.latitude);
  const longitude = toRadians(area.longitude);
  const angle = km / earthRadiusKm;
  const reached = Math.asin(
    Math.sin(latitude) * Math.cos(angle) +
      Math.cos(latitude) * Math.sin(angle) * Math.cos(bearing),
  );
  const across =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angle) * Math.cos(latitude),
      Math.cos(angle) - Math.sin(latitude) * Math.sin(reached),
    );

  return [toDegrees(across), toDegrees(reached)];
}

/** An approximate area as a closed ring of points around its centre. */
export function circle(area: GeoArea, steps = 64): Position[] {
  const ring = Array.from({ length: steps }, (_, step) =>
    destination(area, area.radiusKm, (2 * Math.PI * step) / steps),
  );

  return [...ring, ring[0] as Position];
}

/** South-west and north-east corners around every area. */
export function boundsOf(
  areas: readonly GeoArea[],
): [Position, Position] | null {
  const points = areas.flatMap((area) => circle(area, 16));

  if (points.length === 0) {
    return null;
  }

  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

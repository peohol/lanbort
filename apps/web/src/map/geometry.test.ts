import { describe, expect, it } from "vitest";
import { boundsOf, circle } from "./geometry";

const grunerlokka = { latitude: 59.92, longitude: 10.76, radiusKm: 2 } as const;

describe("map geometry", () => {
  it("draws an area as a closed ring at its radius", () => {
    const ring = circle(grunerlokka, 8);

    expect(ring).toHaveLength(9);
    expect(ring[8]).toEqual(ring[0]);
    // Due north: 2 km is about 0.018 degrees of latitude.
    expect(ring[0]?.[0]).toBeCloseTo(10.76, 6);
    expect(ring[0]?.[1]).toBeCloseTo(59.938, 3);
    // Due east, a degree of longitude is shorter this far north.
    expect(ring[2]?.[0]).toBeCloseTo(10.796, 3);
    expect(ring[2]?.[1]).toBeCloseTo(59.92, 3);
  });

  it("bounds every area, or nothing without areas", () => {
    expect(boundsOf([])).toBeNull();

    const [[west, south], [east, north]] = boundsOf([
      grunerlokka,
      { latitude: 60.39, longitude: 5.32, radiusKm: 10 },
    ])!;

    expect(west).toBeLessThan(5.32 - 0.17);
    expect(east).toBeGreaterThan(10.79);
    expect(south).toBeLessThan(59.91);
    expect(north).toBeGreaterThan(60.47);
  });
});

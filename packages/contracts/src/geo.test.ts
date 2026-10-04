import { describe, expect, it } from "vitest";
import { environmentSearchQuerySchema } from "./search";
import { geoAreaSchema } from "./geo";

describe("approximate areas (WP-62, PS-NFR-008)", () => {
  it("are never more precise than hundredths of a degree", () => {
    expect(
      geoAreaSchema.parse({
        latitude: 59.920113,
        longitude: "10.757381",
        radiusKm: "2",
      }),
    ).toEqual({ latitude: 59.92, longitude: 10.76, radiusKm: 2 });
  });

  it("have a centre on the earth and one of the given sizes", () => {
    for (const area of [
      { latitude: 90.01, longitude: 0, radiusKm: 1 },
      { latitude: 0, longitude: -181, radiusKm: 1 },
      { latitude: 0, longitude: 0, radiusKm: 3 },
      { latitude: "", longitude: 0, radiusKm: 1 },
      { latitude: "nord", longitude: 0, radiusKm: 1 },
    ]) {
      expect(geoAreaSchema.safeParse(area).success).toBe(false);
    }
  });

  it("are searched with all three parameters, or none", () => {
    expect(
      environmentSearchQuerySchema.safeParse({ latitude: "59.92", radiusKm: 5 })
        .success,
    ).toBe(false);
    expect(
      environmentSearchQuerySchema.parse({
        latitude: "59.92",
        longitude: "10.76",
        radiusKm: "5",
      }),
    ).toEqual({ latitude: 59.92, longitude: 10.76, radiusKm: 5 });
  });
});

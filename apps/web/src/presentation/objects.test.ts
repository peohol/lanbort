import type { AvailabilityInterval } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { categoryLabel, describeAvailability, formatInterval } from "./objects";

const found = (details: {
  availableForNewLoans?: boolean;
  effectiveAvailability?: AvailabilityInterval[];
}) => ({
  availableForNewLoans: true,
  effectiveAvailability: [{ start: "2026-10-04", end: "2026-10-20" }],
  ...details,
});

describe("a thing in the user's words", () => {
  it("says when a thing can be borrowed, not what blocks it", () => {
    expect(describeAvailability(found({}), "2026-10-04")).toBe("Ledig nå");
    expect(
      describeAvailability(
        found({
          effectiveAvailability: [{ start: "2026-10-10", end: "2026-10-20" }],
        }),
        "2026-10-04",
      ),
    ).toBe("Ledig fra lørdag 10. oktober");
    expect(
      describeAvailability(
        found({ availableForNewLoans: false }),
        "2026-10-04",
      ),
    ).toBe("Ikke ledig for nye lån nå");
    expect(
      describeAvailability(found({ effectiveAvailability: [] }), "2026-10-04"),
    ).toBe("Ikke ledig for nye lån nå");
  });

  it("says an interval as people say it, open or bounded", () => {
    expect(formatInterval({ start: "2026-10-10", end: null })).toBe(
      "Fra lørdag 10. oktober",
    );
    expect(formatInterval({ start: "2026-10-10", end: "2026-10-10" })).toBe(
      "lørdag 10. oktober",
    );
    expect(formatInterval({ start: "2026-10-10", end: "2026-10-12" })).toBe(
      "lørdag 10. oktober – mandag 12. oktober",
    );
  });

  it("names a category by its label", () => {
    const categories = [{ id: "tools", parentId: null, label: "Verktøy" }];
    expect(categoryLabel(categories, "tools")).toBe("Verktøy");
    expect(categoryLabel(categories, "other")).toBe("other");
  });
});

import type { AvailabilityInterval } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  describeAvailability,
  formatInterval,
  ownThingStatus,
} from "./objects";

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

describe("one of the user's own things in a list", () => {
  const own = (details: Partial<Parameters<typeof ownThingStatus>[0]>) => ({
    status: "active" as const,
    availability: [{ start: "2026-10-01", end: null }],
    availableForNewLoans: true,
    frozenForNewLoans: false,
    restrictions: [],
    ...details,
  });
  const today = "2026-10-06";
  const label = (details: Parameters<typeof own>[0], lentOut = false) =>
    ownThingStatus(own(details), today, lentOut).label;

  it("says whether it can be lent out, is lent out, blocked or archived", () => {
    expect(label({})).toBe("Kan lånes ut");
    expect(label({}, true)).toBe("Utlånt");
    expect(label({ status: "archived" }, true)).toBe("Arkivert");
    expect(label({ frozenForNewLoans: true })).toBe("Sperret for nye lån");
    expect(
      label({
        restrictions: [
          {
            id: "r",
            setByUserId: "u",
            period: null,
            createdAt: "2026-10-01T00:00:00Z",
          },
        ],
      }),
    ).toBe("Sperret for nye lån");
  });

  it("tells an owner when it has no time left to be lent in", () => {
    expect(label({ availability: [], availableForNewLoans: false })).toBe(
      "Mangler ledig tid",
    );
    expect(
      label({
        availability: [{ start: "2026-09-01", end: "2026-09-30" }],
        availableForNewLoans: false,
      }),
    ).toBe("Mangler ledig tid");
    expect(label({ availableForNewLoans: false })).toBe("Ikke ledig nå");
  });
});

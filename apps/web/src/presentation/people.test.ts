import type { Person } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  describeDimension,
  describeRelation,
  dimensionLabel,
  personName,
} from "./people";

const person = (relation: Person["relation"]): Person => ({
  userId: "00000000-0000-4000-8000-000000000001",
  realName: "Kari",
  pictureId: null,
  relation,
  trustProfile: true,
});

const relation = (
  friendship: NonNullable<Person["relation"]>["friendship"],
  blockedByMe = false,
) => ({
  userId: "00000000-0000-4000-8000-000000000001",
  friendship,
  blockedByMe,
});

describe("people", () => {
  it("names a deleted account as a former user", () => {
    expect(personName({ realName: null })).toBe("Tidligere bruker");
    expect(personName({ realName: "Kari" })).toBe("Kari");
  });

  it("says the relation as a situation, a block before anything else", () => {
    expect(describeRelation(person(null)).tag).toBe("Deg");
    expect(describeRelation(person(relation("friends")))).toMatchObject({
      tag: "Venner",
      tone: "positive",
    });
    expect(describeRelation(person(relation("incoming_pending"))).status).toBe(
      "Kari vil bli venn med deg.",
    );
    expect(describeRelation(person(relation("outgoing_pending"))).status).toBe(
      "Venter på svar fra Kari.",
    );
    expect(describeRelation(person(relation("none"))).tag).toBeNull();
    expect(describeRelation(person(relation("none", true)))).toMatchObject({
      tag: "Blokkert",
      tone: "danger",
    });
  });

  it("labels known dimensions and falls back to the code", () => {
    expect(dimensionLabel("communication")).toBe("Kommunikasjon");
    expect(dimensionLabel("new_dimension")).toBe("new_dimension");
  });

  it("shows the basis of a mean, and says when it rests on little", () => {
    expect(
      describeDimension({
        dimension: "communication",
        count: 2,
        mean: 4.5,
        distribution: [0, 0, 0, 1, 1],
        setAside: 1,
      }),
    ).toEqual({
      summary: "4,5 av 5 fra 2 vurderinger",
      spread: "Fordeling: 1 × 5, 1 × 4",
      note: "Få vurderinger, så snittet sier lite. 1 vurdering er holdt utenfor fordi returen ble bestridt etter publisering.",
    });
    expect(
      describeDimension({
        dimension: "communication",
        count: 6,
        mean: 5,
        distribution: [0, 0, 0, 0, 6],
        setAside: 0,
      }),
    ).toEqual({
      summary: "5,0 av 5 fra 6 vurderinger",
      spread: "Fordeling: 6 × 5",
      note: null,
    });
    expect(
      describeDimension({
        dimension: "communication",
        count: 0,
        mean: null,
        distribution: [0, 0, 0, 0, 0],
        setAside: 0,
      }),
    ).toEqual({ summary: "Ingen vurderinger ennå", spread: null, note: null });
  });
});

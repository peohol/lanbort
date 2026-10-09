import type { Person } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  describeDimension,
  describeRelation,
  dimensionLabel,
  personName,
  rolesInOrder,
  whyVisible,
} from "./people";

const person = (relation: Person["relation"]): Person => ({
  userId: "00000000-0000-4000-8000-000000000001",
  realName: "Kari",
  pictureId: null,
  relation,
  relationSince: null,
  sharedEnvironments: [],
  trustProfile: true,
});

const relation = (
  friendship: NonNullable<Person["relation"]>["friendship"],
  blockedByMe = false,
  canRequest = friendship === "none" && !blockedByMe,
) => ({
  userId: "00000000-0000-4000-8000-000000000001",
  friendship,
  blockedByMe,
  canRequest,
});

describe("people", () => {
  it("names a deleted account as a former user", () => {
    expect(personName({ realName: null })).toBe("Tidligere bruker");
    expect(personName({ realName: "Kari" })).toBe("Kari");
  });

  it("says the relation as a situation, a block before anything else", () => {
    expect(describeRelation(person(null)).tag?.text).toBe("Deg");
    expect(describeRelation(person(relation("friends")))).toMatchObject({
      tag: { text: "Venn", tone: "positive" },
      status: "Dere er venner",
      detail: "Dere kan låne direkte av hverandre.",
    });
    expect(
      describeRelation({
        ...person(relation("friends")),
        relationSince: "2026-03-14T10:00:00Z",
      }).detail,
    ).toBe("Siden 14. mars 2026. Dere kan låne direkte av hverandre.");
    expect(
      describeRelation(person(relation("incoming_pending"))),
    ).toMatchObject({ tone: "attention", status: "Kari vil bli venn med deg" });
    expect(
      describeRelation(person(relation("outgoing_pending"))),
    ).toMatchObject({
      tone: "waiting",
      status: "Venneforespørselen er sendt",
      detail:
        "Kari finner den i Hjem og i varslene. Dere blir venner når Kari godtar.",
    });
    expect(describeRelation(person(relation("none")))).toMatchObject({
      tag: null,
      status: "Dere er ikke venner",
    });
    // A request that cannot be sent now is said without a reason (PS-USR-012).
    const held = describeRelation(person(relation("none", false, false)));
    expect(held.detail).toBe("Du kan ikke sende Kari en venneforespørsel nå.");
    expect(JSON.stringify(held)).not.toMatch(/avsl/i);
    expect(describeRelation(person(relation("none", true)))).toMatchObject({
      tag: { text: "Blokkert", tone: "danger" },
      status: "Du har blokkert Kari",
    });
  });

  it("says why the reader sees the person, never for a block", () => {
    const shared = (names: string[]) =>
      names.map((name, index) => ({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        name,
      }));

    expect(
      whyVisible({
        ...person(relation("friends")),
        sharedEnvironments: shared(["Lia", "Tåsen"]),
      }),
    ).toBe("Du ser Kari fordi dere er venner og begge er med i Lia og Tåsen.");
    expect(
      whyVisible({
        ...person(relation("none")),
        sharedEnvironments: shared(["Lia"]),
      }),
    ).toBe("Du ser Kari fordi dere begge er med i Lia.");
    expect(whyVisible(person(relation("friends")))).toBe(
      "Du ser Kari fordi dere er venner.",
    );
    expect(whyVisible(person(relation("incoming_pending")))).toBe(
      "Du ser Kari fordi Kari vil bli venn med deg.",
    );
    expect(whyVisible(person(relation("none", true)))).toBeNull();
    expect(whyVisible(person(null))).toBeNull();
  });

  it("puts the role the page is opened in first, and keeps both (UX-PRIV-012)", () => {
    expect(rolesInOrder(null)).toEqual(["borrower", "lender"]);
    expect(rolesInOrder("borrower")).toEqual(["borrower", "lender"]);
    expect(rolesInOrder("lender")).toEqual(["lender", "borrower"]);
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
    // Said once for the role, not again for each dimension.
    expect(
      describeDimension(
        {
          dimension: "communication",
          count: 2,
          mean: 4.5,
          distribution: [0, 0, 0, 1, 1],
          setAside: 0,
        },
        { fewSaid: true },
      ).note,
    ).toBeNull();
  });
});

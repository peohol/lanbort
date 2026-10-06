import type {
  CoOwnerLoan,
  EnvironmentSummary,
  Loan,
  ObjectPublication,
  ObjectRevision,
  OwnObject,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  coOwnerLoanSteps,
  nextLoan,
  ownerStatus,
  personName,
  publishableEnvironments,
  restrictionReach,
  revertible,
} from "./object-owners";

const me = "00000000-0000-4000-8000-000000000001";
const kari = "00000000-0000-4000-8000-000000000002";
const gone = "00000000-0000-4000-8000-000000000003";
const at = "2026-10-01T10:00:00.000Z";

const thing = (details: Partial<OwnObject> = {}): OwnObject => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  title: "Stige",
  categoryId: "annet",
  description: "Aluminiumsstige.",
  loanTerms: null,
  status: "active",
  version: 3,
  availability: [{ start: "2026-10-01", end: null }],
  effectiveAvailability: [{ start: "2026-10-04", end: null }],
  availableForNewLoans: true,
  images: [],
  owners: [
    { userId: me, realName: "Anna Berg", since: at },
    { userId: kari, realName: "Kari Nord", since: at },
  ],
  restrictions: [],
  frozenForNewLoans: false,
  lentOut: false,
  deletionConsents: [],
  pendingInvitations: [],
  createdAt: at,
  updatedAt: at,
  ...details,
});

describe("the owners' view of a thing", () => {
  it("names the user, the other owners, and those who are gone", () => {
    const object = thing();
    expect(personName(object, me, me)).toBe("deg");
    expect(personName(object, me, me, true)).toBe("du");
    expect(personName(object, kari, me)).toBe("Kari Nord");
    expect(personName(object, gone, me)).toBe("en tidligere eier");
    expect(
      personName(
        thing({ owners: [{ userId: kari, realName: null, since: at }] }),
        kari,
        me,
      ),
    ).toBe("en tidligere bruker");
  });

  it("tells the owners what stops new loans (UX-EXC-006)", () => {
    expect(ownerStatus(thing(), me, "2026-10-04")).toEqual({
      status: "Ledig nå",
      tone: "positive",
      why: null,
    });
    expect(
      ownerStatus(thing({ status: "archived" }), me, "2026-10-04"),
    ).toMatchObject({ status: "Arkivert" });
    expect(
      ownerStatus(thing({ lentOut: true }), me, "2026-10-04"),
    ).toMatchObject({ status: "Utlånt", tone: "waiting" });
    expect(
      ownerStatus(thing({ frozenForNewLoans: true }), me, "2026-10-04"),
    ).toMatchObject({ status: "Kan ikke lånes ut nå", tone: "warning" });
    expect(
      ownerStatus(
        thing({
          restrictions: [
            { id: gone, setByUserId: kari, period: null, createdAt: at },
          ],
        }),
        me,
        "2026-10-04",
      ).why,
    ).toBe("Kari Nord har stanset alle nye lån.");
    expect(
      ownerStatus(thing({ availability: [] }), me, "2026-10-04"),
    ).toMatchObject({ status: "Kan ikke lånes ut ennå" });
  });

  it("says a restriction's reach in words", () => {
    expect(
      restrictionReach({
        id: gone,
        setByUserId: me,
        period: null,
        createdAt: at,
      }),
    ).toBe("på alle datoer");
    expect(
      restrictionReach({
        id: gone,
        setByUserId: me,
        period: { start: "2026-10-10", end: "2026-10-12" },
        createdAt: at,
      }),
    ).toBe("lørdag 10. oktober – mandag 12. oktober");
  });

  it("puts a loan under way before the next one agreed", () => {
    const loan = (id: string, status: Loan["status"], start: string) =>
      ({ id, status, period: { start, end: start } }) as Loan;
    const later = loan("a", "reserved", "2026-10-20");
    const sooner = loan("b", "reserved", "2026-10-10");
    expect(nextLoan([later, sooner])?.id).toBe("b");
    expect(nextLoan([sooner, loan("c", "active", "2026-10-01")])?.id).toBe("c");
    expect(nextLoan([])).toBeNull();
  });

  it("offers only environments it can be published in now", () => {
    const environment = (id: string, state = "active") =>
      ({ id, membershipState: state }) as EnvironmentSummary;
    const publication = (id: string, status: ObjectPublication["status"]) =>
      ({ status, environment: { id } }) as ObjectPublication;
    expect(
      publishableEnvironments(
        [
          environment("free"),
          environment("passive", "passive"),
          environment("published"),
          environment("rejected"),
          environment("withdrawn"),
        ],
        [
          publication("published", "active"),
          publication("rejected", "rejected"),
          publication("withdrawn", "unpublished"),
        ],
      ).map(({ id }) => id),
    ).toEqual(["free", "withdrawn"]);
  });

  it("brings back only an earlier version that differs (PS-OBJ-013)", () => {
    const object = thing();
    const revision = (version: number, title: string) =>
      ({
        version,
        content: {
          title,
          categoryId: object.categoryId,
          description: object.description,
          loanTerms: object.loanTerms,
          status: "active",
          availability: object.availability,
          imageIds: [],
        },
      }) as unknown as ObjectRevision;
    expect(revertible(revision(2, "Gammel stige"), object)).toBe(true);
    expect(revertible(revision(2, "Stige"), object)).toBe(false);
    expect(revertible(revision(3, "Gammel stige"), object)).toBe(false);
  });

  it("gives a co-owner who is not a party only the steps they may take", () => {
    const loan = (details: Partial<CoOwnerLoan>): CoOwnerLoan => ({
      loanId: "l",
      objectId: "o",
      status: "awaiting_return",
      agreementVersion: 2,
      title: "Stige",
      period: { start: "2026-10-01", end: "2026-10-03" },
      transfer: null,
      mayTakeOver: false,
      mayConfirmReceipt: false,
      mayConfirmControl: false,
      pending: null,
      ...details,
    });
    const labels = (details: Partial<CoOwnerLoan>) =>
      coOwnerLoanSteps(loan(details)).map((step) => step.label);

    expect(labels({})).toEqual([]);
    expect(labels({ mayConfirmControl: true, status: "ended" })).toEqual([
      "Jeg har Stige igjen",
    ]);
    expect(coOwnerLoanSteps(loan({ mayConfirmReceipt: true }))[0]).toEqual({
      label: "Jeg har fått tilbake Stige",
      path: "/api/loans/l/return",
      body: { agreementVersion: 2, outcome: "received" },
    });
    expect(
      labels({
        mayConfirmReceipt: true,
        pending: { outcome: "received", effectiveAt: at },
      }),
    ).toEqual(["Angre bekreftelsen"]);
    expect(labels({ mayTakeOver: true })).toEqual([
      "Overta som ansvarlig utlåner",
    ]);
    const transfer = {
      id: "t",
      kind: "voluntary" as const,
      fromUserId: kari,
      toUserId: me,
      needsBorrowerConsent: false,
      recipientAccepted: false,
      borrowerConsented: false,
      proposedAt: at,
    };
    expect(labels({ transfer })).toEqual([
      "Bli ansvarlig utlåner",
      "Ikke bli ansvarlig utlåner",
    ]);
    expect(
      labels({
        transfer: {
          ...transfer,
          kind: "takeover",
          fromUserId: kari,
          recipientAccepted: true,
          needsBorrowerConsent: true,
        },
      }),
    ).toEqual(["Trekk tilbake overtakelsen"]);
  });
});

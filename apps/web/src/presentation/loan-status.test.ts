import type { Loan, LoanActions } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  describeLoanStatus,
  loanProgress,
  loanSteps,
  loanTitle,
  personName,
  followingEnd,
  proposalDefaults,
} from "./loan-status";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-10-03T12:00:00.000Z";

const noActions: LoanActions = {
  handover: [],
  return: [],
  undoReturn: false,
  amendment: [],
  responsibility: [],
  confirmControl: false,
  proposeAmendment: null,
  withdrawAmendment: false,
  cancel: false,
  offerResponsibility: [],
  withdrawResponsibility: false,
  requestMediation: false,
};

function loan(changes: Partial<Loan> = {}): Loan {
  return {
    id,
    requestId: id,
    origin: { kind: "direct" },
    objectId: id,
    images: [],
    role: "borrower",
    borrowerUserId: id,
    responsibleLenderId: id,
    status: "reserved",
    ending: null,
    period: { start: "2026-10-05", end: "2026-10-07" },
    agreement: {
      version: 2,
      agreedAt: at,
      objectVersion: 1,
      title: "Tilhenger",
      categoryId: "annet",
      description: "",
      loanTerms: null,
      responsibilityDeclarationVersion: null,
    },
    amendment: null,
    handover: { borrower: null, lender: null, answerDueAt: null },
    return: { borrower: null, lender: null, pending: null },
    responsibilityTransfer: null,
    control: null,
    approvedAt: at,
    parties: {
      borrower: { realName: "Ola", profileId: null, pictureId: null },
      lender: { realName: "Kari", profileId: null, pictureId: null },
    },
    mediation: null,
    actions: noActions,
    ...changes,
  };
}

/** A day well before the example period, and its handover day. */
const before = "2026-10-01";

const situation = (changes: Partial<Loan>, today = before) =>
  describeLoanStatus(loan(changes), today);

const headline = (changes: Partial<Loan>, today = before) =>
  situation(changes, today).headline;

describe("the loan's situation (UX-INT-004, KF7)", () => {
  it("names the loan from the reader's side", () => {
    expect(loanTitle(loan())).toBe("Tilhenger fra Kari");
    expect(loanTitle(loan({ role: "lender" }))).toBe("Tilhenger til Ola");
  });

  it("says what is agreed, and what the handover day asks", () => {
    expect(situation({})).toMatchObject({
      label: "Avtalt",
      tone: "positive",
      headline: "Tilhenger er reservert for deg",
      body: [expect.stringMatching(/^Du henter Tilhenger mandag 5\. oktober/)],
    });
    expect(situation({ role: "lender" }, "2026-10-05")).toMatchObject({
      label: "I dag",
      tone: "attention",
      headline: "I dag gir du Tilhenger til Ola",
    });
  });

  it("names who the loan waits for, from the caller's side", () => {
    const notHanded = {
      outcome: "not_handed_over",
      reportedAt: at,
    } as const;
    const due = "2026-10-09T10:00:00.000Z";

    expect(
      situation({
        status: "awaiting_handover",
        handover: { borrower: notHanded, lender: null, answerDueAt: due },
      }),
    ).toMatchObject({
      label: "Venter på Kari",
      tone: "waiting",
      headline: "Venter på at Kari forteller om overleveringen",
    });
    expect(
      situation({
        role: "lender",
        status: "awaiting_handover",
        handover: { borrower: notHanded, lender: null, answerDueAt: due },
      }),
    ).toMatchObject({
      label: "Venter på deg",
      tone: "attention",
      headline: "Ola sier at overleveringen ikke skjedde",
    });
    expect(headline({ status: "awaiting_handover" })).toBe(
      "Ble Tilhenger overlevert?",
    );
    expect(
      situation({
        role: "lender",
        status: "awaiting_return",
        return: {
          borrower: {
            outcome: "returned",
            reportedAt: at,
            reportedAs: "party",
          },
          lender: null,
          pending: null,
        },
      }),
    ).toMatchObject({
      label: "Venter på deg",
      headline: "Ola har meldt Tilhenger returnert",
    });
  });

  it("puts an open proposal first, and says who answers it", () => {
    const amendment = {
      id,
      period: { start: "2026-10-05", end: "2026-10-08" },
      proposedBy: "borrower" as const,
      proposedAt: at,
    };

    expect(situation({ status: "active", amendment })).toMatchObject({
      label: "Venter på Kari",
      headline: "Du har foreslått ny returdag: torsdag 8. oktober",
    });
    expect(
      situation({
        role: "lender",
        amendment: {
          ...amendment,
          period: { start: "2026-10-06", end: "2026-10-08" },
        },
        actions: { ...noActions, amendment: ["accept", "decline"] },
      }),
    ).toMatchObject({
      label: "Venter på deg",
      tone: "attention",
      headline: expect.stringMatching(/^Ola foreslår ny periode: tirsdag 6/),
    });
  });

  it("shows a change of lender to the borrower only when they must answer", () => {
    const transfer = {
      id,
      kind: "voluntary" as const,
      fromUserId: id,
      toUserId: id,
      needsBorrowerConsent: false,
      recipientAccepted: false,
      borrowerConsented: false,
      proposedAt: at,
    };

    expect(headline({ responsibilityTransfer: transfer })).toBe(
      "Tilhenger er reservert for deg",
    );
    expect(headline({ role: "lender", responsibilityTransfer: transfer })).toBe(
      "Du har spurt en medeier om å bli ansvarlig utlåner",
    );
    expect(
      headline({
        responsibilityTransfer: { ...transfer, needsBorrowerConsent: true },
      }),
    ).toBe("Kari vil gi ansvaret for lånet til en medeier");
  });

  it("says a waiting confirmation can still be undone, while it can", () => {
    const waiting = {
      status: "active" as const,
      return: {
        borrower: null,
        lender: null,
        pending: { outcome: "returned" as const, effectiveAt: at },
      },
    };

    expect(
      situation({ ...waiting, actions: { ...noActions, undoReturn: true } }),
    ).toMatchObject({
      headline: "Du har meldt Tilhenger returnert",
      body: [expect.stringMatching(/^Du kan angre til /)],
    });
    expect(situation(waiting).body).toEqual([]);
  });

  it("tells who ended it, and what an unresolved loan still waits for", () => {
    const ending = {
      reason: "cancelled" as const,
      endedBy: "lender" as const,
      endedAt: at,
    };

    expect(situation({ status: "ended", ending })).toMatchObject({
      label: "Kansellert",
      headline: "Kari kansellerte lånet",
    });
    const unresolved = {
      status: "ended" as const,
      ending: { reason: "unresolved" as const, endedBy: null, endedAt: at },
      control: { confirmedAt: null },
    };
    expect(headline({ ...unresolved, role: "lender" })).toBe(
      "Bekreft når du har Tilhenger igjen",
    );
    expect(situation(unresolved).body).toContain(
      "Venter på at Kari bekrefter å ha Tilhenger igjen.",
    );
  });

  it("retells a disagreement without taking sides (UX-EXC-002)", () => {
    expect(
      situation({
        status: "disputed",
        return: {
          borrower: {
            outcome: "returned",
            reportedAt: at,
            reportedAs: "party",
          },
          lender: {
            outcome: "not_received",
            reportedAt: at,
            reportedAs: "party",
          },
          pending: null,
        },
      }),
    ).toEqual({
      label: "Uenighet",
      tone: "warning",
      headline: "Dere har sagt ulike ting om returen",
      body: [
        "Du sa at Tilhenger er levert tilbake.",
        "Kari sa at Tilhenger ikke er kommet tilbake.",
        "Lånbort tar ikke stilling til hvem som har rett.",
      ],
    });
  });

  it("never names a deleted account (UX-PRIV-010)", () => {
    expect(personName({ realName: null })).toBe("Tidligere bruker");
    expect(
      headline({
        status: "active",
        role: "lender",
        parties: {
          borrower: { realName: null, profileId: null, pictureId: null },
          lender: { realName: "Kari", profileId: null, pictureId: null },
        },
      }),
    ).toBe("Tilhenger er hos Tidligere bruker til onsdag 7. oktober");
  });

  it("never shows an internal status", () => {
    const statuses = [
      "reserved",
      "awaiting_handover",
      "active",
      "awaiting_return",
      "late",
      "disputed",
    ] as const;

    for (const status of statuses) {
      const { label, headline: text, body } = situation({ status });
      expect([label, text, ...body].join(" ")).not.toMatch(/_/);
    }
  });
});

describe("the loan's steps (KF7)", () => {
  it("names the step it is at, and a deviation by its own word", () => {
    expect(loanProgress(loan())).toEqual({ current: 1, label: "Reservert" });
    expect(loanProgress(loan({ status: "awaiting_handover" }))).toEqual({
      current: 1,
      label: "Overlevering avklares",
    });
    expect(loanProgress(loan({ status: "late" }))).toEqual({
      current: 3,
      label: "Forsinket",
    });
    expect(
      loanProgress(
        loan({
          status: "ended",
          ending: { reason: "returned", endedBy: "lender", endedAt: at },
        }),
      ),
    ).toEqual({ current: 4, label: "Gjennomført" });
    expect(
      loanProgress(
        loan({
          status: "ended",
          ending: { reason: "cancelled", endedBy: "lender", endedAt: at },
        }),
      ),
    ).toEqual({ current: 1, label: "Kansellert" });
  });

  it("keeps an unresolved loan at the step that was not settled", () => {
    const unresolved = {
      status: "ended" as const,
      ending: { reason: "unresolved" as const, endedBy: null, endedAt: at },
    };

    expect(loanProgress(loan(unresolved))).toEqual({
      current: 1,
      label: "Avsluttet uavklart",
    });
    expect(
      loanProgress(
        loan({
          ...unresolved,
          return: {
            borrower: {
              outcome: "returned",
              reportedAt: at,
              reportedAs: "party",
            },
            lender: null,
            pending: null,
          },
        }),
      ),
    ).toEqual({ current: 3, label: "Avsluttet uavklart" });
  });
});

describe("the steps offered (UX-INT-001, UX-INT-003)", () => {
  it("offers a clarification's answers alike, on the current agreement", () => {
    const steps = loanSteps(
      loan({
        status: "awaiting_handover",
        actions: { ...noActions, handover: ["handed_over", "not_handed_over"] },
      }),
    );

    expect(steps.primary).toEqual([
      {
        label: "Jeg har fått Tilhenger",
        path: `/api/loans/${id}/handover`,
        body: { agreementVersion: 2, outcome: "handed_over" },
      },
      {
        label: "Overleveringen skjedde ikke",
        path: `/api/loans/${id}/handover`,
        body: { agreementVersion: 2, outcome: "not_handed_over" },
      },
    ]);
    expect(steps.secondary).toEqual([]);
  });

  it("keeps contradicting a settled handover and a confirmed return apart", () => {
    const active = loanSteps(
      loan({
        status: "active",
        actions: {
          ...noActions,
          handover: ["not_handed_over"],
          return: ["returned"],
        },
      }),
    );
    expect(active.primary).toEqual([
      expect.objectContaining({ label: "Meld returnert", primary: true }),
    ]);
    expect(active.secondary.map(({ label }) => label)).toEqual([
      "Overleveringen skjedde ikke",
    ]);

    const ended = loanSteps(
      loan({
        status: "ended",
        actions: { ...noActions, return: ["still_has"] },
      }),
    );
    expect(ended.primary).toEqual([]);
    expect(ended.secondary.map(({ label }) => label)).toEqual([
      "Jeg har fortsatt Tilhenger",
    ]);
  });

  it("lets the lender end the loan at once while the receipt waits", () => {
    const waiting = (outcome: "returned" | "received") =>
      loanSteps(
        loan({
          status: "awaiting_return",
          role: outcome === "received" ? "lender" : "borrower",
          return: {
            borrower: null,
            lender: null,
            pending: { outcome, effectiveAt: at },
          },
          actions: { ...noActions, undoReturn: true },
        }),
      ).primary;

    expect(waiting("received")).toEqual([
      { label: "Angre", path: `/api/loans/${id}/return/undo`, body: {} },
      {
        label: "Avslutt lånet nå",
        path: `/api/loans/${id}/return`,
        body: { agreementVersion: 2, outcome: "received", immediately: true },
      },
    ]);
    expect(waiting("returned").map(({ label }) => label)).toEqual(["Angre"]);
  });

  it("answers the open proposal and transfer by their own ids", () => {
    const transferId = "00000000-0000-4000-8000-000000000002";
    const steps = loanSteps(
      loan({
        status: "active",
        amendment: {
          id,
          period: { start: "2026-10-05", end: "2026-10-09" },
          proposedBy: "lender",
          proposedAt: at,
        },
        responsibilityTransfer: {
          id: transferId,
          kind: "takeover",
          fromUserId: id,
          toUserId: transferId,
          needsBorrowerConsent: true,
          recipientAccepted: true,
          borrowerConsented: false,
          proposedAt: at,
        },
        actions: {
          ...noActions,
          amendment: ["decline"],
          responsibility: ["accept", "decline"],
        },
      }),
    );

    expect(steps.primary.map(({ path }) => path)).toEqual([
      `/api/loans/${id}/amendments/${id}/decline`,
      `/api/loans/${id}/responsibility/${transferId}/accept`,
      `/api/loans/${id}/responsibility/${transferId}/decline`,
    ]);
    expect(steps.primary[0]?.label).toBe("Si nei til forslaget");
  });

  it("names the day a proposal is accepted for, and the one kept", () => {
    const steps = loanSteps(
      loan({
        status: "active",
        amendment: {
          id,
          period: { start: "2026-10-05", end: "2026-10-09" },
          proposedBy: "lender",
          proposedAt: at,
        },
        actions: { ...noActions, amendment: ["accept", "decline"] },
      }),
    );

    expect(steps.primary.map(({ label, primary }) => [label, primary])).toEqual(
      [
        ["Godta ny returdag 9. oktober", true],
        ["Behold 7. oktober", false],
      ],
    );
  });

  it("keeps taking one's own proposal or offer back among the rarer steps", () => {
    const transferId = "00000000-0000-4000-8000-000000000002";
    const steps = loanSteps(
      loan({
        role: "lender",
        amendment: {
          id,
          period: { start: "2026-10-05", end: "2026-10-09" },
          proposedBy: "lender",
          proposedAt: at,
        },
        responsibilityTransfer: {
          id: transferId,
          kind: "voluntary",
          fromUserId: id,
          toUserId: transferId,
          needsBorrowerConsent: false,
          recipientAccepted: false,
          borrowerConsented: false,
          proposedAt: at,
        },
        actions: {
          ...noActions,
          withdrawAmendment: true,
          withdrawResponsibility: true,
        },
      }),
    );

    expect(steps.primary).toEqual([]);
    expect(steps.secondary).toEqual([
      {
        label: "Trekk forslaget",
        path: `/api/loans/${id}/amendments/${id}/withdraw`,
        body: {},
      },
      {
        label: "Trekk tilbudet om ansvaret",
        path: `/api/loans/${id}/responsibility/${transferId}/withdraw`,
        body: {},
      },
    ]);
  });

  it("leaves an early return to the lender among the rarer steps", () => {
    const steps = loanSteps(
      loan({
        role: "lender",
        status: "active",
        actions: { ...noActions, return: ["received"] },
      }),
    );

    expect(steps.primary).toEqual([]);
    expect(steps.secondary.map(({ label }) => label)).toEqual([
      "Jeg har fått tilbake Tilhenger",
    ]);
  });

  it("offers nothing the domain did not offer", () => {
    expect(loanSteps(loan({ status: "awaiting_return" }))).toEqual({
      primary: [],
      secondary: [],
    });
  });
});

describe("where a proposal starts from (PS-LOAN-010)", () => {
  const period = { start: "2026-10-05", end: "2026-10-07" };

  it("keeps the agreed period while its handover is ahead", () => {
    expect(proposalDefaults(period, "period", "2026-10-04")).toEqual(period);
  });

  it("moves a passed handover day to today, keeping the length", () => {
    expect(proposalDefaults(period, "period", "2026-10-09")).toEqual({
      start: "2026-10-09",
      end: "2026-10-11",
    });
  });

  it("moves the return day with a new handover day, keeping the length", () => {
    expect(followingEnd(period, "2026-10-20")).toBe("2026-10-22");
    expect(followingEnd(period, "2026-10-04")).toBe("2026-10-06");
    expect(followingEnd(period, "")).toBe(period.end);
  });

  it("moves only the return day after the handover, to tomorrow at the earliest", () => {
    expect(proposalDefaults(period, "return_day", "2026-10-08")).toEqual({
      start: "2026-10-05",
      end: "2026-10-09",
    });
    expect(proposalDefaults(period, "return_day", "2026-10-06")).toEqual(
      period,
    );
  });
});

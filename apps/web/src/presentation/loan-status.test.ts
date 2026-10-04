import type { Loan, LoanActions } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { describeLoanStatus, loanSteps, personName } from "./loan-status";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-10-03T12:00:00.000Z";

const noActions: LoanActions = {
  handover: [],
  return: [],
  undoReturn: false,
  amendment: [],
  responsibility: [],
  confirmControl: false,
};

function loan(changes: Partial<Loan> = {}): Loan {
  return {
    id,
    requestId: id,
    objectId: id,
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
    parties: { borrower: { realName: "Ola" }, lender: { realName: "Kari" } },
    actions: noActions,
    ...changes,
  };
}

const textOf = (changes: Partial<Loan>) =>
  describeLoanStatus(loan(changes)).text;

describe("the loan's status (UX-INT-004)", () => {
  it("names who the loan waits for, from the caller's side", () => {
    const said = { outcome: "handed_over", reportedAt: at } as const;

    expect(
      textOf({
        status: "awaiting_handover",
        handover: { borrower: said, lender: null, answerDueAt: null },
      }),
    ).toBe("Venter på at Kari forteller om overleveringen");
    expect(
      textOf({
        role: "lender",
        status: "awaiting_return",
        return: {
          borrower: null,
          lender: { outcome: "received", reportedAt: at, reportedAs: "party" },
          pending: null,
        },
      }),
    ).toBe("Venter på at Ola forteller om returen");
    expect(textOf({ status: "awaiting_handover" })).toBe(
      "Fortell om Tilhenger ble overlevert",
    );
  });

  it("puts an open proposal first, and says who answers it", () => {
    const amendment = {
      id,
      period: { start: "2026-10-06", end: "2026-10-08" },
      proposedBy: "borrower" as const,
      proposedAt: at,
    };

    expect(textOf({ status: "active", amendment })).toMatch(
      /^Venter på at Kari svarer på forslaget om ny periode/,
    );
    expect(textOf({ role: "lender", amendment })).toMatch(
      /^Ola foreslår ny periode/,
    );
  });

  it("says a waiting confirmation can still be undone", () => {
    expect(
      describeLoanStatus(
        loan({
          status: "active",
          return: {
            borrower: null,
            lender: null,
            pending: { outcome: "returned", effectiveAt: at },
          },
        }),
      ),
    ).toEqual({
      text: "Du har bekreftet returen",
      when: expect.stringMatching(/^Du kan angre til /),
    });
  });

  it("tells who ended it, and what an unresolved loan still waits for", () => {
    const ending = {
      reason: "cancelled" as const,
      endedBy: "lender" as const,
      endedAt: at,
    };

    expect(textOf({ status: "ended", ending })).toBe(
      "Avlyst før overlevering av Kari",
    );
    const unresolved = {
      status: "ended" as const,
      ending: { reason: "unresolved" as const, endedBy: null, endedAt: at },
      control: { confirmedAt: null },
    };
    expect(textOf({ ...unresolved, role: "lender" })).toBe(
      "Avsluttet uten avklaring. Bekreft når du har Tilhenger igjen",
    );
    expect(textOf(unresolved)).toBe(
      "Avsluttet uten avklaring. Venter på at Kari bekrefter å ha Tilhenger igjen",
    );
  });

  it("never names a deleted account (UX-PRIV-010)", () => {
    expect(personName({ realName: null })).toBe("Tidligere bruker");
    expect(
      textOf({
        status: "active",
        role: "lender",
        parties: { borrower: { realName: null }, lender: { realName: "Kari" } },
      }),
    ).toBe("Utlånt til Tidligere bruker");
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
      expect(textOf({ status })).not.toMatch(/_/);
    }
  });
});

describe("the steps offered (UX-INT-001, UX-INT-003)", () => {
  it("turns what the domain offers into commands on the current agreement", () => {
    const steps = loanSteps(
      loan({
        status: "awaiting_handover",
        actions: { ...noActions, handover: ["handed_over", "not_handed_over"] },
      }),
    );

    expect(steps.primary).toEqual([
      {
        label: "Tilhenger er overlevert",
        path: `/api/loans/${id}/handover`,
        body: { agreementVersion: 2, outcome: "handed_over" },
      },
      {
        label: "Tilhenger ble ikke overlevert",
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
    expect(active.primary.map(({ label }) => label)).toEqual([
      "Jeg har levert tilbake Tilhenger",
    ]);
    expect(active.secondary.map(({ label }) => label)).toEqual([
      "Tilhenger ble ikke overlevert",
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
    expect(steps.primary[0]?.label).toBe("Behold avtalt periode");
  });

  it("offers nothing the domain did not offer", () => {
    expect(loanSteps(loan({ status: "awaiting_return" }))).toEqual({
      primary: [],
      secondary: [],
    });
  });
});

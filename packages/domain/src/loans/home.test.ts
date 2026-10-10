import type { CoOwnerLoan, Loan, LoanRequest } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { coOwnerLoanHomeItem, loanHomeItem, loanRequestHomeItem } from "./home";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-10-03T12:00:00.000Z";
const statement = { outcome: "returned", reportedAt: at, reportedAs: "party" };

function loan(changes: Partial<Loan> = {}): Loan {
  return {
    id,
    requestId: id,
    objectId: id,
    images: [],
    role: "borrower",
    borrowerUserId: id,
    responsibleLenderId: id,
    status: "reserved",
    ending: null,
    period: { start: "2026-10-05", end: "2026-10-07" },
    agreement: {
      version: 1,
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
    origin: {
      kind: "environment",
      environment: { id, type: "closed", name: "Borettslaget Lia" },
    },
    parties: {
      borrower: { realName: "Ola", profileId: null },
      lender: { realName: "Kari", profileId: null },
    },
    mediation: null,
    actions: { confirmControl: false },
    ...changes,
  } as Loan;
}

const kindOf = (changes: Partial<Loan>) => loanHomeItem(loan(changes))?.kind;

describe("what a loan asks of its party", () => {
  it("shows the next day of a loan under way", () => {
    expect(loanHomeItem(loan())).toMatchObject({
      kind: "loan.handover",
      day: "2026-10-05",
      title: "Tilhenger",
      role: "borrower",
    });
    expect(loanHomeItem(loan({ status: "active" }))).toMatchObject({
      kind: "loan.return",
      day: "2026-10-07",
    });
  });

  it("names the other party and the environment it came through", () => {
    expect(loanHomeItem(loan())).toMatchObject({
      person: "Kari",
      via: "Borettslaget Lia",
      period: { start: "2026-10-05", end: "2026-10-07" },
    });
    expect(
      loanHomeItem(
        loan({
          role: "lender",
          origin: { kind: "environment", environment: null },
        }),
      ),
    ).toMatchObject({ person: "Ola", via: null });
  });

  it("waits for the administrators while they mediate", () => {
    const mediation = { caseId: id, open: true };

    expect(kindOf({ status: "disputed", mediation })).toBe("loan.mediation");
    expect(kindOf({ status: "late", mediation })).toBe("loan.mediation");
    expect(
      kindOf({ status: "disputed", mediation: { caseId: id, open: false } }),
    ).toBe("loan.disputed");
    // What the party has to do still waits for them.
    expect(
      kindOf({ status: "awaiting_return", role: "lender", mediation }),
    ).toBe("loan.confirm_return");
  });

  it("asks only the side that did not propose a change", () => {
    const amendment = {
      id,
      period: { start: "2026-10-06", end: "2026-10-08" },
      proposedBy: "lender" as const,
      proposedByYou: true,
      proposedAt: at,
    };

    expect(kindOf({ amendment })).toBe("loan.answer_amendment");
    expect(kindOf({ amendment, role: "lender" })).toBe("loan.handover");
  });

  it("asks the borrower to consent to a later co-owner taking over", () => {
    const transfer = {
      id,
      kind: "voluntary" as const,
      fromUserId: id,
      toUserId: id,
      needsBorrowerConsent: true,
      recipientAccepted: true,
      borrowerConsented: false,
      proposedAt: at,
    };

    expect(kindOf({ responsibilityTransfer: transfer })).toBe(
      "loan.answer_responsibility",
    );
    expect(
      kindOf({
        responsibilityTransfer: { ...transfer, borrowerConsented: true },
      }),
    ).toBe("loan.handover");
    expect(kindOf({ responsibilityTransfer: transfer, role: "lender" })).toBe(
      "loan.handover",
    );
  });

  it("asks for the statement only the party itself has not given", () => {
    const status = "awaiting_handover";
    const said = { outcome: "not_handed_over", reportedAt: at };

    expect(kindOf({ status })).toBe("loan.report_handover");
    expect(
      kindOf({
        status,
        handover: { borrower: said, lender: null, answerDueAt: at },
      } as Partial<Loan>),
    ).toBe("loan.awaiting_handover");
    expect(
      loanHomeItem(
        loan({
          status,
          role: "lender",
          handover: { borrower: said, lender: null, answerDueAt: at },
        } as Partial<Loan>),
      ),
    ).toMatchObject({ kind: "loan.report_handover", dueAt: at });
  });

  it("asks the borrower to report and the lender to confirm the return", () => {
    const status = "awaiting_return";

    expect(kindOf({ status })).toBe("loan.report_return");
    expect(kindOf({ status, role: "lender" })).toBe("loan.confirm_return");
    expect(
      kindOf({
        status,
        return: { borrower: statement, lender: null, pending: null },
      } as Partial<Loan>),
    ).toBe("loan.awaiting_return");
    expect(
      kindOf({
        status,
        role: "lender",
        return: {
          borrower: null,
          lender: null,
          pending: { outcome: "received", effectiveAt: at },
        },
      } as Partial<Loan>),
    ).toBe("loan.awaiting_return");
  });

  it("marks late and disputed loans as unresolved, and drops ended ones", () => {
    expect(kindOf({ status: "late" })).toBe("loan.late");
    expect(kindOf({ status: "disputed" })).toBe("loan.disputed");
    expect(loanHomeItem(loan({ status: "ended" }))).toBeNull();
  });

  it("asks the lender to confirm having the object back after an unresolved end", () => {
    const ended = {
      status: "ended",
      role: "lender",
      control: { confirmedAt: null },
    } as const;

    expect(
      kindOf({
        ...ended,
        actions: { confirmControl: true } as Loan["actions"],
      }),
    ).toBe("loan.confirm_control");
    expect(kindOf(ended)).toBeUndefined();
  });
});

function request(changes: Partial<LoanRequest> = {}): LoanRequest {
  return {
    id,
    role: "lender",
    status: "requested",
    object: { title: "Tilhenger", categoryId: "annet" },
    images: [],
    responsibility: null,
    borrower: { realName: "Per Lien", profileId: null },
    origin: { kind: "direct" },
    start: { kind: "date", date: "2026-10-14" },
    end: { kind: "duration", days: 2 },
    ...changes,
  } as LoanRequest;
}

describe("what an open request asks", () => {
  it("asks the lender to answer, never the borrower who waits", () => {
    expect(loanRequestHomeItem(request())?.kind).toBe("loan_request.answer");
    expect(loanRequestHomeItem(request({ role: "borrower" }))).toBeNull();
  });

  it("names the borrower to the lender, and the days asked for", () => {
    expect(loanRequestHomeItem(request())).toMatchObject({
      person: "Per Lien",
      via: null,
      period: { start: "2026-10-14", end: "2026-10-15" },
    });
    expect(
      loanRequestHomeItem(
        request({
          start: { kind: "asap" },
          origin: {
            kind: "environment",
            environment: { id, type: "open", name: "Nabodeling" },
          },
        }),
      ),
    ).toMatchObject({ period: null, via: "Nabodeling" });
  });

  it("asks the borrower to confirm changed terms", () => {
    expect(
      loanRequestHomeItem(
        request({ role: "borrower", status: "awaiting_terms_confirmation" }),
      )?.kind,
    ).toBe("loan_request.confirm_terms");
    expect(
      loanRequestHomeItem(request({ status: "awaiting_terms_confirmation" })),
    ).toBeNull();
  });

  it("asks a party who has not accepted the declaration", () => {
    const responsibility = {
      version: 1,
      acceptedByBorrower: false,
      acceptedByLender: true,
      acceptedByYou: false,
    };

    expect(
      loanRequestHomeItem(request({ role: "borrower", responsibility }))?.kind,
    ).toBe("loan_request.accept_responsibility");
    expect(
      loanRequestHomeItem(
        request({ role: "borrower", status: "ended", responsibility }),
      ),
    ).toBeNull();
    expect(loanRequestHomeItem(request({ status: "on_hold" }))).toBeNull();
  });
});

function coOwnerLoan(changes: Partial<CoOwnerLoan> = {}): CoOwnerLoan {
  return {
    loanId: id,
    objectId: id,
    status: "active",
    agreementVersion: 1,
    title: "Tilhenger",
    images: [],
    period: { start: "2026-10-05", end: "2026-10-07" },
    transfer: null,
    mayTakeOver: false,
    mayConfirmReceipt: false,
    mayConfirmControl: false,
    pending: null,
    ...changes,
  };
}

describe("what a loan asks of a co-owner", () => {
  it("asks the recipient of an offer, not the co-owner whose takeover waits", () => {
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

    expect(coOwnerLoanHomeItem(coOwnerLoan({ transfer }))?.kind).toBe(
      "loan.answer_responsibility",
    );
    expect(
      coOwnerLoanHomeItem(
        coOwnerLoan({
          transfer: { ...transfer, kind: "takeover", recipientAccepted: true },
        }),
      ),
    ).toBeNull();
  });

  it("offers taking over or the receipt only while they may", () => {
    expect(coOwnerLoanHomeItem(coOwnerLoan({ mayTakeOver: true }))?.kind).toBe(
      "loan.take_over_responsibility",
    );
    expect(
      coOwnerLoanHomeItem(coOwnerLoan({ mayConfirmReceipt: true }))?.kind,
    ).toBe("loan.confirm_return");
    expect(
      coOwnerLoanHomeItem(
        coOwnerLoan({
          mayConfirmReceipt: true,
          pending: { outcome: "received", effectiveAt: at },
        }),
      ),
    ).toBeNull();
  });
});

describe("the thing's picture (PS-OBJ-021)", () => {
  const imageId = "00000000-0000-4000-8000-0000000000a1";
  const images = [{ id: imageId, width: 800, height: 600 }];

  it("is read the way the reader sees the thing", () => {
    expect(loanHomeItem(loan({ images }))?.picture).toEqual({
      through: "loan",
      loanId: id,
      imageId,
    });
    expect(loanRequestHomeItem(request({ images }))?.picture).toEqual({
      through: "loan_request",
      requestId: id,
      imageId,
    });
    expect(
      coOwnerLoanHomeItem(coOwnerLoan({ images, mayTakeOver: true }))?.picture,
    ).toEqual({ through: "owner", objectId: id, imageId });
  });

  it("is left out when the thing has none", () => {
    expect(loanHomeItem(loan())?.picture).toBeNull();
    expect(loanRequestHomeItem(request())?.picture).toBeNull();
  });
});

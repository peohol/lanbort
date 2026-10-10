import type { Loan, LoanActions, LoanRequest } from "@lanbort/contracts";

/** Examples of a loan and a request as the API gives them, for tests. */
export const fixtureId = "00000000-0000-4000-8000-000000000001";
export const fixtureAt = "2026-10-03T12:00:00.000Z";

export const noLoanActions: LoanActions = {
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

export function loanFixture(changes: Partial<Loan> = {}): Loan {
  return {
    id: fixtureId,
    requestId: fixtureId,
    origin: { kind: "direct" },
    objectId: fixtureId,
    images: [],
    role: "borrower",
    borrowerUserId: fixtureId,
    responsibleLenderId: fixtureId,
    status: "reserved",
    ending: null,
    period: { start: "2026-10-05", end: "2026-10-07" },
    agreement: {
      version: 2,
      agreedAt: fixtureAt,
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
    approvedAt: fixtureAt,
    parties: {
      borrower: { realName: "Ola", profileId: null, pictureId: null },
      lender: { realName: "Kari", profileId: null, pictureId: null },
    },
    mediation: null,
    actions: noLoanActions,
    ...changes,
  };
}

export const loanRequestFixture = (
  changes: Partial<LoanRequest> = {},
): LoanRequest => ({
  id: "00000000-0000-4000-8000-000000000001",
  objectId: "00000000-0000-4000-8000-000000000002",
  role: "borrower",
  borrowerUserId: "00000000-0000-4000-8000-000000000003",
  borrower: { realName: "Ola Hansen", profileId: null, pictureId: null },
  origin: { kind: "direct" },
  start: { kind: "asap" },
  end: { kind: "duration", days: 2 },
  message: null,
  status: "requested",
  endReason: null,
  object: { title: "Stige", categoryId: "annet" },
  images: [],
  confirmedTerms: { version: 1, loanTerms: null },
  pendingTerms: null,
  responsibility: null,
  loanId: null,
  createdAt: "2026-10-08T18:43:00.000Z",
  statusChangedAt: "2026-10-08T18:43:00.000Z",
  ...changes,
});

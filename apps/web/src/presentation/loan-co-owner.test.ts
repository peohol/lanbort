import type { CoOwnerLoanView } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  coOwnerLoanTitle,
  coOwnerProgress,
  coOwnerSteps,
  describeCoOwnerLoan,
} from "./loan-co-owner";

const id = "00000000-0000-4000-8000-000000000001";
const transferId = "00000000-0000-4000-8000-000000000002";
const at = "2026-10-03T12:00:00.000Z";
const today = "2026-10-04";

const person = (realName: string) => ({
  realName,
  profileId: null,
  pictureId: null,
});

function view(changes: Partial<CoOwnerLoanView> = {}): CoOwnerLoanView {
  return {
    id,
    objectId: id,
    status: "reserved",
    ending: null,
    period: { start: "2026-10-05", end: "2026-10-07" },
    title: "stige",
    categoryId: "tools",
    loanTerms: null,
    parties: { borrower: person("Ola Hansen"), lender: person("Kari Vik") },
    responsibilityTransfer: null,
    actions: { responsibility: [], confirmControl: false },
    ...changes,
  } as CoOwnerLoanView;
}

const offer = (changes: object = {}) => ({
  id: transferId,
  kind: "voluntary" as const,
  fromUserId: id,
  toUserId: id,
  needsBorrowerConsent: false,
  recipientAccepted: false,
  borrowerConsented: false,
  proposedAt: at,
  ...changes,
});

describe("a loan as a co-owner sees it", () => {
  it("is named from the owners' side", () => {
    expect(coOwnerLoanTitle(view())).toBe("stige til Ola Hansen");
  });

  it("says what the parties are at, about them rather than to them", () => {
    const situation = describeCoOwnerLoan(view({ status: "active" }), today);
    expect(situation.label).toBe("Hos Ola Hansen");
    expect(situation.headline).toBe(
      "Stige er hos Ola Hansen til onsdag 7. oktober",
    );
    expect(situation.body.join(" ")).toContain("Kari Vik er ansvarlig");
  });

  it("asks only the one offered the lender's role, with both answers", () => {
    const offered = view({
      responsibilityTransfer: offer(),
      actions: { responsibility: ["accept", "decline"], confirmControl: false },
    });

    const situation = describeCoOwnerLoan(offered, today);
    expect(situation.label).toBe("Venter på deg");
    expect(situation.headline).toBe(
      "Kari Vik spør om du vil bli ansvarlig utlåner",
    );
    expect(coOwnerSteps(offered)).toEqual([
      expect.objectContaining({
        label: "Bli ansvarlig utlåner",
        path: `/api/loans/${id}/responsibility/${transferId}/accept`,
        primary: true,
      }),
      expect.objectContaining({
        label: "Si nei",
        path: `/api/loans/${id}/responsibility/${transferId}/decline`,
        next: "/lan",
      }),
    ]);
  });

  it("waits for the borrower once a later co-owner accepted", () => {
    const accepted = view({
      responsibilityTransfer: offer({
        needsBorrowerConsent: true,
        recipientAccepted: true,
      }),
    });

    expect(describeCoOwnerLoan(accepted, today).label).toBe(
      "Venter på Ola Hansen",
    );
    expect(coOwnerSteps(accepted)).toEqual([]);
  });

  it("offers to confirm having it back after an unresolved ending", () => {
    const unresolved = view({
      status: "ended",
      ending: { reason: "unresolved", endedAt: at },
      actions: { responsibility: [], confirmControl: true },
    });

    expect(describeCoOwnerLoan(unresolved, today).headline).toBe(
      "Bekreft når du har stige igjen",
    );
    expect(coOwnerSteps(unresolved)).toEqual([
      expect.objectContaining({
        label: "Jeg har stige igjen",
        path: `/api/loans/${id}/control`,
        primary: true,
      }),
    ]);
  });

  it("shows no step where it would tell what a party said", () => {
    expect(coOwnerProgress(view())).toEqual({ current: 1, label: "Reservert" });
    expect(coOwnerProgress(view({ status: "disputed" }))).toBeNull();
    expect(
      coOwnerProgress(
        view({
          status: "ended",
          ending: { reason: "unresolved", endedAt: at },
        }),
      ),
    ).toBeNull();
    expect(
      coOwnerProgress(
        view({ status: "ended", ending: { reason: "returned", endedAt: at } }),
      ),
    ).toEqual({ current: 4, label: "Gjennomført" });
  });
});

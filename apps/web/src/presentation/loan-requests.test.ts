import type { LoanRequest } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  describeLoanRequest,
  originLabel,
  requestProgress,
} from "./loan-requests";

const request = (changes: Partial<LoanRequest> = {}): LoanRequest => ({
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

describe("describeLoanRequest", () => {
  it("says whom it waits on, to each side", () => {
    expect(describeLoanRequest(request())).toMatchObject({
      label: "Venter på eieren",
      text: "Venter på svar fra eieren",
      tone: "waiting",
    });
    expect(describeLoanRequest(request({ role: "lender" }))).toMatchObject({
      label: "Venter på deg",
      text: "Ola Hansen vil låne. Venter på svaret ditt",
    });
  });

  it("tells the borrower nothing is agreed before an answer", () => {
    expect(describeLoanRequest(request()).body).toMatch(
      /Ingenting er avtalt før eieren godkjenner/,
    );
  });
});

describe("requestProgress", () => {
  it("is asked for until approved, then reserved", () => {
    expect(requestProgress(request())).toEqual({
      current: 0,
      label: "Forespurt",
    });
    expect(requestProgress(request({ status: "approved" }))).toEqual({
      current: 1,
      label: "Reservert",
    });
    expect(
      requestProgress(request({ status: "ended", endReason: "withdrawn" })),
    ).toEqual({ current: 0, label: "Avsluttet" });
  });
});

describe("originLabel", () => {
  it("names an environment only while the reader may see it", () => {
    expect(originLabel({ kind: "direct" })).toBe("Direkte mellom venner");
    expect(
      originLabel({
        kind: "environment",
        environment: {
          id: "00000000-0000-4000-8000-000000000004",
          type: "open",
          name: "Gården",
        },
      }),
    ).toBe("Via Gården");
    expect(originLabel({ kind: "environment", environment: null })).toBe(
      "Via et miljø",
    );
  });
});

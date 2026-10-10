import { describe, expect, it } from "vitest";
import {
  describeLoanRequest,
  originLabel,
  requestProgress,
} from "./loan-requests";
import { loanRequestFixture as request } from "./loan-fixtures";

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

  it("says a request whose time has begun cannot be approved", () => {
    const passed = request({ start: { kind: "date", date: "2026-10-12" } });

    expect(describeLoanRequest(passed, "2026-10-12").label).toBe(
      "Venter på eieren",
    );
    expect(describeLoanRequest(passed, "2026-10-13")).toMatchObject({
      label: "Tiden har passert",
      tone: "warning",
      body: expect.stringMatching(/Trekk forespørselen/),
    });
    expect(
      describeLoanRequest({ ...passed, role: "lender" }, "2026-10-13"),
    ).toMatchObject({
      label: "Venter på deg",
      text: "Tiden Ola Hansen ba om har begynt, så den kan ikke godkjennes. Avslå forespørselen",
    });
    // «As soon as possible», but only until a day that is over.
    expect(
      describeLoanRequest(
        request({ end: { kind: "date", date: "2026-10-12" } }),
        "2026-10-13",
      ).label,
    ).toBe("Tiden har passert");
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

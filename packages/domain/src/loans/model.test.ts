import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import {
  desiredPeriod,
  endedStanding,
  fitsAvailability,
  isOpen,
  openStanding,
  presentedStatus,
  validateDesiredPeriod,
} from "./model";

const today = "2026-10-03";
const asap = { kind: "asap" } as const;
const on = (date: string) => ({ kind: "date", date }) as const;
const days = (count: number) => ({ kind: "duration", days: count }) as const;

describe("isOpen", () => {
  it("counts a request waiting for its terms as open", () => {
    expect(isOpen("requested")).toBe(true);
    expect(isOpen("awaiting_terms_confirmation")).toBe(true);
    expect(isOpen("ended")).toBe(false);
  });
});

describe("presentedStatus", () => {
  const requested = { status: "requested", endReason: null } as const;
  const awaiting = {
    status: "awaiting_terms_confirmation",
    endReason: null,
  } as const;

  it("keeps a recorded ending", () => {
    expect(
      presentedStatus(
        { status: "ended", endReason: "withdrawn" },
        endedStanding("access_lost"),
      ),
    ).toEqual({ status: "ended", endReason: "withdrawn" });
  });

  it("ends a request at once when its access is gone (PS-LOAN-002)", () => {
    expect(presentedStatus(awaiting, endedStanding("access_lost"))).toEqual({
      status: "ended",
      endReason: "access_lost",
    });
  });

  it("puts the borrower's confirmation before an environment's hold", () => {
    expect(presentedStatus(awaiting, { kind: "on_hold" }).status).toBe(
      "awaiting_terms_confirmation",
    );
    expect(presentedStatus(requested, { kind: "on_hold" }).status).toBe(
      "on_hold",
    );
    expect(presentedStatus(requested, openStanding).status).toBe("requested");
  });
});

describe("validateDesiredPeriod", () => {
  const fieldsOf = (run: () => void) => {
    try {
      run();
      return null;
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      return (error as DomainError).fields;
    }
  };

  it("accepts as soon as possible, today and later starts", () => {
    expect(fieldsOf(() => validateDesiredPeriod(asap, days(3), today))).toBe(
      null,
    );
    expect(
      fieldsOf(() => validateDesiredPeriod(on(today), on(today), today)),
    ).toBe(null);
    expect(
      fieldsOf(() => validateDesiredPeriod(asap, on("2026-10-10"), today)),
    ).toBe(null);
  });

  it("refuses a start that has passed", () => {
    expect(
      fieldsOf(() => validateDesiredPeriod(on("2026-10-02"), days(1), today)),
    ).toEqual(["start"]);
  });

  it("refuses an end before the start, or before today", () => {
    expect(
      fieldsOf(() =>
        validateDesiredPeriod(on("2026-10-10"), on("2026-10-09"), today),
      ),
    ).toEqual(["end"]);
    expect(
      fieldsOf(() => validateDesiredPeriod(asap, on("2026-10-02"), today)),
    ).toEqual(["end"]);
  });
});

describe("desiredPeriod", () => {
  it("counts an inclusive end and a duration as half-open days", () => {
    expect(desiredPeriod(on("2026-10-05"), on("2026-10-07"), today)).toEqual({
      from: "2026-10-05",
      until: "2026-10-08",
    });
    expect(desiredPeriod(asap, days(2), today)).toEqual({
      from: today,
      until: "2026-10-05",
    });
  });
});

describe("fitsAvailability", () => {
  const effective = [
    { from: "2026-10-03", until: "2026-10-10" },
    { from: "2026-10-20", until: null },
  ];

  it("needs a dated request to lie within one available interval", () => {
    expect(
      fitsAvailability(on("2026-10-04"), on("2026-10-09"), effective, today),
    ).toBe(true);
    expect(fitsAvailability(on("2026-10-08"), days(5), effective, today)).toBe(
      false,
    );
    expect(
      fitsAvailability(on("2026-11-01"), days(400), effective, today),
    ).toBe(true);
  });

  it("needs some available day for as soon as possible, before a desired end", () => {
    expect(fitsAvailability(asap, days(30), effective, today)).toBe(true);
    expect(fitsAvailability(asap, days(1), [], today)).toBe(false);
    expect(
      fitsAvailability(
        asap,
        on("2026-10-15"),
        [{ from: "2026-10-20", until: null }],
        today,
      ),
    ).toBe(false);
  });
});

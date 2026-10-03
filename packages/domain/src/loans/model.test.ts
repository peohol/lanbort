import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import {
  amendmentFits,
  beforeHandover,
  collidingRequests,
  earliestPeriod,
  endedStanding,
  fromApiPeriod,
  isOpen,
  openStanding,
  presentedStatus,
  samePeriod,
  toApiPeriod,
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

  it("counts an approved request as final", () => {
    expect(isOpen("approved")).toBe(false);
    expect(
      presentedStatus({ status: "approved", endReason: null }, openStanding),
    ).toEqual({ status: "approved", endReason: null });
    // Access lost after approval does not undo it (PS-LOAN-002).
    expect(
      presentedStatus(
        { status: "approved", endReason: null },
        endedStanding("access_lost"),
      ),
    ).toEqual({ status: "approved", endReason: null });
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

describe("earliestPeriod", () => {
  const effective = [
    { from: "2026-10-03", until: "2026-10-10" },
    { from: "2026-10-20", until: null },
  ];

  it("needs a dated request to lie within one available interval", () => {
    expect(
      earliestPeriod(on("2026-10-05"), on("2026-10-07"), effective, today),
    ).toEqual({ from: "2026-10-05", until: "2026-10-08" });
    expect(earliestPeriod(on("2026-10-08"), days(5), effective, today)).toBe(
      null,
    );
    expect(
      earliestPeriod(on("2026-11-01"), days(400), effective, today),
    ).toEqual({ from: "2026-11-01", until: "2027-12-06" });
  });

  it("starts as soon as possible where the whole duration fits", () => {
    expect(earliestPeriod(asap, days(2), effective, today)).toEqual({
      from: today,
      until: "2026-10-05",
    });
    // The first interval is too short for eight days; the next one is not.
    expect(earliestPeriod(asap, days(8), effective, today)).toEqual({
      from: "2026-10-20",
      until: "2026-10-28",
    });
    expect(earliestPeriod(asap, days(8), [effective[0]!], today)).toBeNull();
    expect(earliestPeriod(asap, days(1), [], today)).toBeNull();
  });

  it("needs every day up to a desired last day without a break", () => {
    expect(earliestPeriod(asap, on("2026-10-09"), effective, today)).toEqual({
      from: today,
      until: "2026-10-10",
    });
    // Available days before and after, but a break in between.
    expect(earliestPeriod(asap, on("2026-10-15"), effective, today)).toBeNull();
    expect(earliestPeriod(asap, on("2026-10-25"), effective, today)).toEqual({
      from: "2026-10-20",
      until: "2026-10-26",
    });
    expect(
      earliestPeriod(
        asap,
        on("2026-10-15"),
        [{ from: "2026-10-20", until: null }],
        today,
      ),
    ).toBeNull();
  });

  it("never starts before today", () => {
    expect(
      earliestPeriod(
        asap,
        days(2),
        [{ from: "2026-10-01", until: "2026-10-05" }],
        today,
      ),
    ).toEqual({ from: today, until: "2026-10-05" });
  });
});

describe("collidingRequests (PS-LOAN-007)", () => {
  const effective = [{ from: "2026-10-03", until: null }];
  const reserved = { from: "2026-10-06", until: "2026-10-10" };
  const request = (
    name: string,
    start: { kind: "asap" } | { kind: "date"; date: string },
    end: { kind: "date"; date: string } | { kind: "duration"; days: number },
  ) => ({ name, start, end });
  const names = (requests: readonly { name: string }[]) =>
    requests.map((r) => r.name);

  it("ends dated requests that overlap the reservation, and only those", () => {
    const requests = [
      request("before", on("2026-10-03"), on("2026-10-05")),
      request("touching end", on("2026-10-10"), days(2)),
      request("overlapping start", on("2026-10-04"), on("2026-10-06")),
      request("inside", on("2026-10-07"), days(1)),
      request("overlapping end", on("2026-10-09"), days(5)),
    ];

    expect(
      names(collidingRequests(requests, reserved, effective, today)),
    ).toEqual(["overlapping start", "inside", "overlapping end"]);
  });

  it("keeps «as soon as possible» open while it still fits somewhere", () => {
    const requests = [
      request("fits before", asap, days(3)),
      request("fits after", asap, days(5)),
      request("no longer fits by its last day", asap, on("2026-10-08")),
    ];

    expect(
      names(collidingRequests(requests, reserved, effective, today)),
    ).toEqual(["no longer fits by its last day"]);
  });

  it("does not blame the reservation for what did not fit before it", () => {
    const short = [{ from: "2026-10-03", until: "2026-10-12" }];

    expect(
      collidingRequests(
        [request("never fitted", asap, days(20))],
        reserved,
        short,
        today,
      ),
    ).toEqual([]);
  });
});

describe("toApiPeriod", () => {
  it("shows the last day inclusive", () => {
    expect(toApiPeriod({ from: "2026-10-06", until: "2026-10-10" })).toEqual({
      start: "2026-10-06",
      end: "2026-10-09",
    });
  });
});

describe("fromApiPeriod", () => {
  it("is the inverse of toApiPeriod", () => {
    const period = { from: "2026-10-06", until: "2026-10-10" };

    expect(fromApiPeriod(toApiPeriod(period))).toEqual(period);
    expect(samePeriod(fromApiPeriod(toApiPeriod(period)), period)).toBe(true);
    expect(samePeriod(period, { ...period, until: "2026-10-11" })).toBe(false);
  });
});

describe("beforeHandover (PS-LOAN-011)", () => {
  const period = { from: "2026-10-06", until: "2026-10-10" };

  it("lasts until the handover day is over", () => {
    expect(beforeHandover(period, "2026-10-03")).toBe(true);
    expect(beforeHandover(period, "2026-10-06")).toBe(true);
    expect(beforeHandover(period, "2026-10-07")).toBe(false);
  });
});

describe("amendmentFits (PS-LOAN-010, scenario 26)", () => {
  // Anne's loan holds 6–9 October; Kari's holds 12–14 October.
  const current = { from: "2026-10-06", until: "2026-10-10" };
  const effective = [
    { from: today, until: "2026-10-06" },
    { from: "2026-10-10", until: "2026-10-12" },
    { from: "2026-10-15", until: null },
  ];

  it("extends into days that are actually available", () => {
    expect(
      amendmentFits(
        current,
        { from: "2026-10-06", until: "2026-10-12" },
        effective,
        today,
      ),
    ).toBe(true);
  });

  it("never reaches into another loan's reservation", () => {
    expect(
      amendmentFits(
        current,
        { from: "2026-10-06", until: "2026-10-13" },
        effective,
        today,
      ),
    ).toBe(false);
  });

  it("keeps or gives back its own days without checking them", () => {
    expect(
      amendmentFits(
        current,
        { from: "2026-10-07", until: "2026-10-09" },
        [],
        today,
      ),
    ).toBe(true);
  });

  it("moves to another free period, and the start earlier", () => {
    expect(
      amendmentFits(
        current,
        { from: "2026-10-15", until: "2026-10-20" },
        effective,
        today,
      ),
    ).toBe(true);
    expect(
      amendmentFits(
        current,
        { from: "2026-10-04", until: "2026-10-10" },
        effective,
        today,
      ),
    ).toBe(true);
  });

  it("does not start in the past", () => {
    expect(
      amendmentFits(
        current,
        { from: "2026-10-02", until: "2026-10-10" },
        [{ from: "2026-10-01", until: null }],
        today,
      ),
    ).toBe(false);
  });
});

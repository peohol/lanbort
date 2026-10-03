import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import {
  amendmentFits,
  beforeHandover,
  collidingRequests,
  earliestPeriod,
  endedStanding,
  fromApiPeriod,
  type HandoverReading,
  type HandoverStatement,
  handoverAnswerDue,
  handoverRefusal,
  handoverVerdict,
  isOpen,
  mediationOffered,
  noHandoverStatements,
  openStanding,
  presentedLoanStatus,
  presentedStatus,
  repeatsLastStatement,
  type ReturnStatement,
  returnEffectiveAt,
  returnRefusal,
  returnVerdict,
  statusAfterHandover,
  statusAfterReturn,
  samePeriod,
  toApiPeriod,
  unresolvedEndable,
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
        "reserved",
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
        "reserved",
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
        "reserved",
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
        "reserved",
        current,
        { from: "2026-10-15", until: "2026-10-20" },
        effective,
        today,
      ),
    ).toBe(true);
    expect(
      amendmentFits(
        "reserved",
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
        "reserved",
        current,
        { from: "2026-10-02", until: "2026-10-10" },
        [{ from: "2026-10-01", until: null }],
        today,
      ),
    ).toBe(false);
  });

  it("keeps the start once handed over, and needs a return day still ahead", () => {
    // Handed over on 1 October; today is the 3rd.
    const lent = { from: "2026-10-01", until: "2026-10-05" };
    const open = [{ from: "2026-10-01", until: null }];
    const fits = (from: string, until: string) =>
      amendmentFits("active", lent, { from, until }, open, today);

    expect(fits("2026-10-01", "2026-10-08")).toBe(true);
    expect(fits("2026-10-01", "2026-10-04")).toBe(true);
    expect(fits("2026-10-02", "2026-10-08")).toBe(false);
    expect(fits("2026-10-01", today)).toBe(false);
    // Days it takes back that it held already are not checked again.
    expect(
      amendmentFits(
        "late",
        lent,
        { from: "2026-10-01", until: "2026-10-06" },
        [{ from: "2026-10-05", until: "2026-10-06" }],
        today,
      ),
    ).toBe(true);
  });
});

describe("the handover (PS-LOAN-012–013)", () => {
  const at = new Date("2026-10-05T10:00:00Z");
  const handedOver: HandoverStatement = {
    outcome: "handed_over",
    reportedAt: at,
    answerDueAt: null,
  };
  const notHandedOver: HandoverStatement = {
    outcome: "not_handed_over",
    reportedAt: at,
    answerDueAt: handoverAnswerDue(at),
  };
  const reading = (
    borrower: HandoverStatement | null,
    lender: HandoverStatement | null,
  ): HandoverReading => ({ borrower, lender });
  const period = { from: "2026-10-05", until: "2026-10-08" };

  it("gives the other side 72 hours to answer", () => {
    expect(handoverAnswerDue(at).toISOString()).toBe(
      "2026-10-08T10:00:00.000Z",
    );
  });

  it("reads the statements without counting silence as anything", () => {
    expect(handoverVerdict(noHandoverStatements, at)).toBe("none");
    expect(handoverVerdict(reading(handedOver, null), at)).toBe("handed_over");
    expect(handoverVerdict(reading(null, handedOver), at)).toBe("handed_over");
    expect(handoverVerdict(reading(handedOver, handedOver), at)).toBe(
      "handed_over",
    );
    expect(handoverVerdict(reading(handedOver, notHandedOver), at)).toBe(
      "disputed",
    );
    expect(handoverVerdict(reading(notHandedOver, handedOver), at)).toBe(
      "disputed",
    );
    expect(handoverVerdict(reading(notHandedOver, notHandedOver), at)).toBe(
      "not_handed_over",
    );
  });

  it("lets an unanswered «not handed over» stand only after its deadline", () => {
    const due = handoverAnswerDue(at);
    const before = new Date(due.getTime() - 1);

    expect(handoverVerdict(reading(null, notHandedOver), before)).toBe(
      "awaiting_answer",
    );
    expect(handoverVerdict(reading(null, notHandedOver), due)).toBe(
      "unanswered",
    );
    expect(handoverVerdict(reading(notHandedOver, null), due)).toBe(
      "unanswered",
    );
  });

  it("leads to the stored status", () => {
    expect(statusAfterHandover("none")).toBe("reserved");
    expect(statusAfterHandover("awaiting_answer")).toBe("reserved");
    expect(statusAfterHandover("handed_over")).toBe("active");
    expect(statusAfterHandover("disputed")).toBe("disputed");
    expect(statusAfterHandover("not_handed_over")).toBe("ended");
    expect(statusAfterHandover("unanswered")).toBe("ended");
  });

  it("shows a reserved loan as awaiting handover once its handover day is over", () => {
    expect(presentedLoanStatus("reserved", period, "2026-10-05")).toBe(
      "reserved",
    );
    expect(presentedLoanStatus("reserved", period, "2026-10-06")).toBe(
      "awaiting_handover",
    );
    expect(presentedLoanStatus("active", period, "2026-10-06")).toBe("active");
    expect(presentedLoanStatus("ended", period, "2026-10-06")).toBe("ended");
  });

  it("allows «handed over» from the handover day, «not handed over» after it", () => {
    const refusal = (outcome: "handed_over" | "not_handed_over", day: string) =>
      handoverRefusal(
        "reserved",
        period,
        noHandoverStatements,
        "borrower",
        outcome,
        day,
      );

    expect(refusal("handed_over", "2026-10-04")).not.toBeNull();
    expect(refusal("handed_over", "2026-10-05")).toBeNull();
    expect(refusal("not_handed_over", "2026-10-05")).not.toBeNull();
    expect(refusal("not_handed_over", "2026-10-06")).toBeNull();
  });

  it("lets only the silent side contradict an active loan, and either side change a dispute", () => {
    const active = reading(handedOver, null);
    const disputed = reading(handedOver, notHandedOver);
    const today = "2026-10-06";

    expect(
      handoverRefusal(
        "active",
        period,
        active,
        "lender",
        "not_handed_over",
        today,
      ),
    ).toBeNull();
    expect(
      handoverRefusal(
        "active",
        period,
        active,
        "borrower",
        "not_handed_over",
        today,
      ),
    ).not.toBeNull();
    expect(
      handoverRefusal(
        "disputed",
        period,
        disputed,
        "borrower",
        "not_handed_over",
        today,
      ),
    ).toBeNull();
    expect(
      handoverRefusal(
        "disputed",
        period,
        disputed,
        "lender",
        "handed_over",
        today,
      ),
    ).toBeNull();
    expect(
      handoverRefusal(
        "ended",
        period,
        noHandoverStatements,
        "lender",
        "handed_over",
        today,
      ),
    ).not.toBeNull();
  });
});

describe("the return (PS-LOAN-014–017)", () => {
  const at = new Date("2026-10-08T10:00:00Z");
  const said = (
    ...statements: [ReturnStatement["role"], ReturnStatement["outcome"]][]
  ): ReturnStatement[] =>
    statements.map(([role, outcome]) => ({ role, outcome, reportedAt: at }));
  // Lent 5–7 October: the return day is the 7th.
  const period = { from: "2026-10-05", until: "2026-10-08" };
  const loan = (status: Parameters<typeof returnRefusal>[0]["status"]) => ({
    status,
    endReason: status === "ended" ? "returned" : null,
    period,
  });

  it("reads the statements without counting silence or the date as anything", () => {
    expect(returnVerdict([])).toBe("none");
    expect(returnVerdict(said(["borrower", "returned"]))).toBe("returned");
    expect(returnVerdict(said(["lender", "not_received"]))).toBe(
      "not_received",
    );
    expect(returnVerdict(said(["borrower", "still_has"]))).toBe("late");
    expect(
      returnVerdict(said(["borrower", "returned"], ["lender", "not_received"])),
    ).toBe("disputed");
    // The latest statement of each side counts.
    expect(
      returnVerdict(said(["borrower", "still_has"], ["borrower", "returned"])),
    ).toBe("returned");
  });

  it("ends with the lender's receipt, whatever the borrower said before", () => {
    expect(returnVerdict(said(["lender", "received"]))).toBe("received");
    expect(
      returnVerdict(said(["borrower", "still_has"], ["lender", "received"])),
    ).toBe("received");
    expect(
      returnVerdict(
        said(
          ["lender", "not_received"],
          ["borrower", "returned"],
          ["lender", "received"],
        ),
      ),
    ).toBe("received");
  });

  it("reopens a receipt contradicted later, until a new receipt", () => {
    expect(
      returnVerdict(said(["lender", "received"], ["borrower", "still_has"])),
    ).toBe("reopened");
    expect(
      returnVerdict(
        said(
          ["lender", "received"],
          ["lender", "not_received"],
          ["borrower", "returned"],
        ),
      ),
    ).toBe("reopened");
    expect(
      returnVerdict(
        said(
          ["lender", "received"],
          ["lender", "not_received"],
          ["lender", "received"],
        ),
      ),
    ).toBe("received");
  });

  it("leads to the stored status", () => {
    expect(statusAfterReturn("none")).toBe("active");
    expect(statusAfterReturn("returned")).toBe("awaiting_return");
    expect(statusAfterReturn("not_received")).toBe("awaiting_return");
    expect(statusAfterReturn("late")).toBe("late");
    expect(statusAfterReturn("disputed")).toBe("return_disputed");
    expect(statusAfterReturn("reopened")).toBe("return_disputed");
    expect(statusAfterReturn("received")).toBe("ended");
  });

  it("shows an active loan as awaiting return once its return day is over, never as late", () => {
    expect(presentedLoanStatus("active", period, "2026-10-07")).toBe("active");
    expect(presentedLoanStatus("active", period, "2026-10-08")).toBe(
      "awaiting_return",
    );
    expect(presentedLoanStatus("late", period, "2026-10-08")).toBe("late");
    expect(presentedLoanStatus("return_disputed", period, "2026-10-08")).toBe(
      "disputed",
    );
  });

  it("allows «still has it» and an unprompted «not received» only after the return day", () => {
    const before = "2026-10-07";
    const after = "2026-10-08";

    expect(returnRefusal(loan("active"), [], "returned", before)).toBeNull();
    expect(returnRefusal(loan("active"), [], "received", before)).toBeNull();
    expect(
      returnRefusal(loan("active"), [], "still_has", before),
    ).not.toBeNull();
    expect(returnRefusal(loan("active"), [], "still_has", after)).toBeNull();
    expect(
      returnRefusal(loan("active"), [], "not_received", before),
    ).not.toBeNull();
    expect(
      returnRefusal(
        loan("awaiting_return"),
        said(["borrower", "returned"]),
        "not_received",
        before,
      ),
    ).toBeNull();
  });

  it("refuses statements before the handover, and after any other ending", () => {
    expect(
      returnRefusal(loan("reserved"), [], "received", "2026-10-06"),
    ).not.toBeNull();
    expect(
      returnRefusal(loan("disputed"), [], "received", "2026-10-06"),
    ).not.toBeNull();
    expect(
      returnRefusal(
        { status: "ended", endReason: "cancelled", period },
        [],
        "not_received",
        "2026-10-06",
      ),
    ).not.toBeNull();
  });

  it("lets only a contradiction of the receipt reopen a returned loan, at any time", () => {
    const received = said(["lender", "received"]);
    const early = "2026-10-06";

    expect(
      returnRefusal(loan("ended"), received, "not_received", early),
    ).toBeNull();
    expect(
      returnRefusal(loan("ended"), received, "still_has", early),
    ).toBeNull();
    expect(
      returnRefusal(loan("ended"), received, "returned", early),
    ).not.toBeNull();
    expect(
      returnRefusal(loan("ended"), received, "received", early),
    ).not.toBeNull();
  });

  it("treats saying the same again, with nobody speaking since, as a repeat", () => {
    const statements = said(["borrower", "returned"]);

    expect(repeatsLastStatement(statements, "borrower", "returned")).toBe(true);
    expect(repeatsLastStatement(statements, "lender", "received")).toBe(false);
    expect(
      repeatsLastStatement(
        said(["borrower", "returned"], ["lender", "not_received"]),
        "borrower",
        "returned",
      ),
    ).toBe(false);
  });

  it("gives a confirmation 30 seconds before it is made", () => {
    expect(returnEffectiveAt(at)).toEqual(new Date("2026-10-08T10:00:30Z"));
  });
});

describe("an unsettled loan (PS-LOAN-018, vision 05)", () => {
  const period = { from: "2026-10-10", until: "2026-10-13" };
  const now = new Date("2026-10-20T12:00:00Z");

  it("ends unresolved only while its handover or return is unsettled", () => {
    const endable = (
      status: Parameters<typeof unresolvedEndable>[0]["status"],
      today: string,
      handover: Parameters<typeof unresolvedEndable>[0]["handover"] = "none",
    ) => unresolvedEndable({ status, period, handover }, today);

    expect(endable("reserved", "2026-10-10")).toBe(false);
    expect(endable("reserved", "2026-10-11")).toBe(true);
    // A «not handed over» waiting for its answer has its own process.
    expect(endable("reserved", "2026-10-11", "awaiting_answer")).toBe(false);
    expect(endable("active", "2026-10-12")).toBe(false);
    expect(endable("active", "2026-10-13")).toBe(true);
    for (const status of [
      "disputed",
      "awaiting_return",
      "late",
      "return_disputed",
    ] as const) {
      expect(endable(status, "2026-10-11")).toBe(true);
    }
    expect(endable("ended", "2026-10-20")).toBe(false);
  });

  it("goes to mediation at once when disputed, and after seven days of an unclear return", () => {
    const offered = (
      status: Parameters<typeof mediationOffered>[0]["status"],
      statusChangedAt: string,
      today: string,
    ) =>
      mediationOffered(
        { status, statusChangedAt: new Date(statusChangedAt), period },
        now,
        today,
      );

    expect(offered("disputed", "2026-10-20T11:00:00Z", "2026-10-20")).toBe(
      true,
    );
    expect(
      offered("return_disputed", "2026-10-20T11:00:00Z", "2026-10-20"),
    ).toBe(true);
    expect(
      offered("awaiting_return", "2026-10-13T12:00:01Z", "2026-10-20"),
    ).toBe(false);
    expect(
      offered("awaiting_return", "2026-10-13T12:00:00Z", "2026-10-20"),
    ).toBe(true);
    // Nobody said anything: counted from the agreed return day.
    expect(offered("active", "2026-10-11T08:00:00Z", "2026-10-19")).toBe(false);
    expect(offered("active", "2026-10-11T08:00:00Z", "2026-10-20")).toBe(true);
    // The borrower says they still have it: not in question.
    expect(offered("late", "2026-10-01T00:00:00Z", "2026-10-20")).toBe(false);
    expect(offered("reserved", "2026-10-01T00:00:00Z", "2026-10-20")).toBe(
      false,
    );
  });
});

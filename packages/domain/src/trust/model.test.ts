import { describe, expect, it } from "vitest";
import { type ScoreTally, summarizeRole } from "./model";

const tally = (overrides: Partial<ScoreTally>): ScoreTally => ({
  reviewerRole: "lender",
  dimension: "communication",
  score: 5,
  restsOnReturn: false,
  reopened: false,
  count: 1,
  ...overrides,
});

describe("summarizeRole (PS-TRUST-006/008/012)", () => {
  it("shows every dimension of the side, with no data where nobody scored", () => {
    expect(
      summarizeRole("lender", ["pickup_on_time", "communication"], 0, []),
    ).toEqual({
      reviews: 0,
      dimensions: [
        {
          dimension: "pickup_on_time",
          count: 0,
          mean: null,
          distribution: [0, 0, 0, 0, 0],
          setAside: 0,
        },
        {
          dimension: "communication",
          count: 0,
          mean: null,
          distribution: [0, 0, 0, 0, 0],
          setAside: 0,
        },
      ],
    });
  });

  it("gives every reviewer the same weight: a plain mean and the spread", () => {
    const { dimensions } = summarizeRole("lender", ["communication"], 3, [
      tally({ score: 5, count: 2 }),
      tally({ score: 2, count: 1 }),
    ]);

    expect(dimensions[0]).toEqual({
      dimension: "communication",
      count: 3,
      mean: 4,
      distribution: [0, 1, 0, 0, 2],
      setAside: 0,
    });
  });

  it("rounds the mean to two decimals", () => {
    const { dimensions } = summarizeRole("lender", ["communication"], 3, [
      tally({ score: 5, count: 1 }),
      tally({ score: 4, count: 2 }),
    ]);

    expect(dimensions[0]?.mean).toBe(4.33);
  });

  it("never mixes in what the other side said", () => {
    const { dimensions } = summarizeRole("lender", ["communication"], 1, [
      tally({ score: 5 }),
      tally({ reviewerRole: "borrower", score: 1, count: 4 }),
    ]);

    expect(dimensions[0]).toMatchObject({ count: 1, mean: 5 });
  });

  it("sets aside scores on the return once the loan reopened, and only those", () => {
    const { dimensions } = summarizeRole(
      "lender",
      ["return_on_time", "communication"],
      2,
      [
        tally({ dimension: "return_on_time", restsOnReturn: true, score: 5 }),
        tally({
          dimension: "return_on_time",
          restsOnReturn: true,
          reopened: true,
          score: 1,
        }),
        tally({ reopened: true, score: 3 }),
        tally({ score: 5 }),
      ],
    );

    expect(dimensions).toEqual([
      {
        dimension: "return_on_time",
        count: 1,
        mean: 5,
        distribution: [0, 0, 0, 0, 1],
        setAside: 1,
      },
      {
        dimension: "communication",
        count: 2,
        mean: 4,
        distribution: [0, 0, 1, 0, 1],
        setAside: 0,
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  presentedWindowStatus,
  type ReviewWindowRecord,
  reviewDueAt,
  reviewRefusal,
  sameScores,
  validateReview,
  windowOver,
} from "./model";

const endedAt = new Date("2026-11-04T10:00:00.000Z");
const dueAt = new Date("2026-11-18T10:00:00.000Z");

const window = (
  status: ReviewWindowRecord["status"],
  due: Date | null = dueAt,
): ReviewWindowRecord => ({
  loanId: "loan",
  borrowerUserId: "borrower",
  lenderUserId: "lender",
  basis: "returned",
  openedAt: endedAt,
  dueAt: due,
  status,
  closedAt: status === "closed" ? endedAt : null,
});

const dimensions = [
  { code: "available_at_handover", restsOnReturn: false },
  { code: "communication", restsOnReturn: false },
];

describe("the review window (PS-TRUST-003, PS-TRUST-008)", () => {
  it("is 14 days from the ending", () => {
    expect(reviewDueAt(endedAt)).toEqual(dueAt);
  });

  it("counts as closed from its deadline on, before the job records it", () => {
    const before = new Date(dueAt.getTime() - 1);

    expect(windowOver(window("open"), before)).toBe(false);
    expect(presentedWindowStatus(window("open"), before)).toBe("open");
    expect(windowOver(window("open"), dueAt)).toBe(true);
    expect(presentedWindowStatus(window("open"), dueAt)).toBe("closed");
  });

  it("never runs out while paused", () => {
    const later = new Date(dueAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    expect(windowOver(window("paused", null), later)).toBe(false);
    expect(presentedWindowStatus(window("paused", null), later)).toBe("paused");
  });

  it("is open for reviews only while open and not over", () => {
    expect(reviewRefusal(null, endedAt)).toMatch(/not ended/);
    expect(reviewRefusal(window("open"), endedAt)).toBeNull();
    expect(reviewRefusal(window("open"), dueAt)).toMatch(/closed/);
    expect(reviewRefusal(window("paused", null), endedAt)).toMatch(/reopened/);
    expect(reviewRefusal(window("closed"), endedAt)).toMatch(/closed/);
  });
});

describe("a review's scores (PS-TRUST-001/002)", () => {
  it("covers each dimension once, in the dimensions' order", () => {
    expect(
      validateReview(
        [
          { dimension: "communication", score: 4 },
          { dimension: "available_at_handover", score: 5 },
        ],
        null,
        dimensions,
      ),
    ).toEqual([
      { dimension: "available_at_handover", score: 5 },
      { dimension: "communication", score: 4 },
    ]);
  });

  it.each([
    ["a missing dimension", [{ dimension: "communication", score: 4 }]],
    [
      "a dimension the side does not score",
      [
        { dimension: "available_at_handover", score: 5 },
        { dimension: "communication", score: 4 },
        { dimension: "return_on_time", score: 4 },
      ],
    ],
    [
      "a dimension twice",
      [
        { dimension: "available_at_handover", score: 5 },
        { dimension: "available_at_handover", score: 4 },
      ],
    ],
  ])("refuses %s", (_case, scores) => {
    expect(() => validateReview(scores, null, dimensions)).toThrow(
      expect.objectContaining({ code: "invalid_input", fields: ["scores"] }),
    );
  });

  it.each([1, 2])("needs an explanation with a %i", (score) => {
    const scores = [
      { dimension: "available_at_handover", score },
      { dimension: "communication", score: 5 },
    ];

    expect(() => validateReview(scores, null, dimensions)).toThrow(
      expect.objectContaining({ code: "invalid_input", fields: ["text"] }),
    );
    expect(validateReview(scores, "Kom ikke.", dimensions)).toHaveLength(2);
  });

  it("needs no explanation from 3 up", () => {
    expect(
      validateReview(
        [
          { dimension: "available_at_handover", score: 3 },
          { dimension: "communication", score: 3 },
        ],
        null,
        dimensions,
      ),
    ).toHaveLength(2);
  });

  it("compares scores regardless of order", () => {
    const a = [
      { dimension: "communication", score: 4 },
      { dimension: "available_at_handover", score: 5 },
    ];

    expect(sameScores(a, [...a].reverse())).toBe(true);
    expect(sameScores(a, [{ dimension: "communication", score: 4 }])).toBe(
      false,
    );
    expect(
      sameScores(a, [
        { dimension: "communication", score: 3 },
        { dimension: "available_at_handover", score: 5 },
      ]),
    ).toBe(false);
  });
});

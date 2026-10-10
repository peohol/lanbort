import type { LoanReview, LoanReviews } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { basisNote, dimensionLabel, hiddenUntil, scoreLines } from "./reviews";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-10-03T12:00:00.000Z";

function review(changes: Partial<LoanReview> = {}): LoanReview {
  return {
    id,
    authorRole: "lender",
    status: "published",
    version: 1,
    scores: [
      { dimension: "return_on_time", score: 2, contested: true },
      { dimension: "communication", score: 5, contested: false },
    ],
    text: "Kom en dag for sent.",
    moderated: { textRemoved: false, removedDimensions: [] },
    submittedAt: at,
    updatedAt: at,
    publishedAt: at,
    loanReopenedAt: null,
    response: null,
    ...changes,
  };
}

describe("reviews in words (UX-JRN-010)", () => {
  it("names each dimension, and shows a new one by its code", () => {
    expect(dimensionLabel("communication")).toBe("Kommunikasjon");
    expect(dimensionLabel("new_dimension")).toBe("new_dimension");
  });

  it("marks contested scores and what moderation took out", () => {
    expect(
      scoreLines(
        review({
          moderated: {
            textRemoved: false,
            removedDimensions: ["communication"],
          },
        }),
      ),
    ).toEqual([
      {
        dimension: "return_on_time",
        label: "Leverte tilbake til avtalt tid",
        text: "2 av 5 (omstridt etter at lånet ble åpnet igjen)",
      },
      {
        dimension: "communication",
        label: "Kommunikasjon",
        text: "Fjernet av moderering",
      },
    ]);
  });

  it("explains a shorter review after a loan that did not go the whole way", () => {
    expect(basisNote("returned")).toBeNull();
    expect(basisNote("unresolved")).toContain("uavklart");
  });

  it("says the review stays hidden until both have reviewed or the deadline", () => {
    const reviews: LoanReviews = {
      loanId: id,
      role: "borrower",
      title: "Tilhenger",
      counterpart: { realName: "Kari", profileId: null, pictureId: null },
      window: {
        status: "open",
        basis: "returned",
        dueAt: "2026-10-17T12:00:00.000Z",
        dimensions: ["communication"],
      },
      own: null,
      received: null,
    };

    expect(hiddenUntil(reviews, "Kari")).toBe(
      "Anmeldelsen din er skjult til Kari også har anmeldt deg, eller til fristen lørdag 17. oktober kl. 14:00. Da vises begge samtidig.",
    );
  });
});

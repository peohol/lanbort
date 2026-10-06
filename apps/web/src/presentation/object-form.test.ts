import { describe, expect, it } from "vitest";
import {
  changedFields,
  contentOf,
  draftOf,
  editOf,
  newDraft,
  type ObjectDraft,
  overlappingPeriods,
  rebaseDraft,
} from "./object-form";

const saved: ObjectDraft = draftOf({
  title: "Stige",
  categoryId: "verktoy",
  description: "Aluminiumsstige, 4 meter.",
  loanTerms: null,
  availability: [{ start: "2026-10-01", end: null }],
});

describe("the form for a thing", () => {
  it("starts a new thing available from today, with no end", () => {
    expect(newDraft("2026-10-06").availability).toEqual([
      { start: "2026-10-06", end: "" },
    ]);
  });

  it("sends trimmed text, no terms as null and an open period as null", () => {
    expect(
      contentOf({
        ...saved,
        title: "  Stige ",
        loanTerms: "  ",
        availability: [{ start: "2026-10-01", end: "" }],
      }),
    ).toEqual({
      title: "Stige",
      categoryId: "verktoy",
      description: "Aluminiumsstige, 4 meter.",
      loanTerms: null,
      availability: [{ start: "2026-10-01", end: null }],
    });
  });

  it("edits only what the user changed, on the version it was based on", () => {
    const draft = { ...saved, title: "Stige ", loanTerms: "Vask den." };

    expect(changedFields(saved, draft)).toEqual(["loanTerms"]);
    expect(editOf(saved, draft, 3)).toEqual({
      expectedVersion: 3,
      loanTerms: "Vask den.",
    });
  });

  it("keeps the user's changes on top of someone else's, and theirs elsewhere", () => {
    const theirs = { ...saved, title: "Lang stige", description: "Ny." };
    const mine = { ...saved, description: "Min.", loanTerms: "Vask den." };

    expect(rebaseDraft(saved, theirs, mine)).toEqual({
      ...theirs,
      description: "Min.",
      loanTerms: "Vask den.",
    });
  });

  it("points out periods that share a day, not those that only touch", () => {
    expect(
      overlappingPeriods([
        { start: "2026-10-01", end: "2026-10-10" },
        { start: "2026-10-11", end: "2026-10-20" },
        { start: "2026-11-01", end: "" },
        { start: "2026-12-01", end: "2026-12-02" },
        { start: "", end: "" },
      ]),
    ).toEqual([2, 3]);
  });
});

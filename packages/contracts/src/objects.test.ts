import { describe, expect, it } from "vitest";
import {
  availabilityMaxIntervals,
  createObjectSchema,
  updateObjectSchema,
} from "./objects";

const valid = {
  title: "  Stige ",
  categoryId: "annet",
  description: "Lang.\n\tLett.",
  availability: [{ start: "2030-01-01", end: null }],
};

const issues = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join("."));

describe("object contracts", () => {
  it("trims text, keeps line breaks and defaults the optional fields", () => {
    expect(
      createObjectSchema.parse({ ...valid, availability: undefined }),
    ).toEqual({
      title: "Stige",
      categoryId: "annet",
      description: "Lang.\n\tLett.",
      loanTerms: null,
      availability: [],
    });
  });

  it.each([
    ["a control character in the title", { title: "a\u0000b" }, "title"],
    [
      "other control characters in text",
      { description: "a\u001bb" },
      "description",
    ],
    ["an empty loan text instead of null", { loanTerms: "  " }, "loanTerms"],
    [
      "an impossible date",
      { availability: [{ start: "2030-02-30", end: null }] },
      "availability.0.start",
    ],
    [
      "a date far outside the product's range",
      { availability: [{ start: "1999-12-31", end: null }] },
      "availability.0.start",
    ],
    [
      "an end before its start",
      { availability: [{ start: "2030-02-02", end: "2030-02-01" }] },
      "availability.0.end",
    ],
    ["a category that is not an id", { categoryId: "Annet!" }, "categoryId"],
  ])("refuses %s", (_name, change, path) => {
    expect(
      issues(createObjectSchema.safeParse({ ...valid, ...change })),
    ).toEqual([path]);
  });

  it("accepts a one-day interval and limits the number of intervals", () => {
    const day = { start: "2030-01-01", end: "2030-01-01" };

    expect(
      createObjectSchema.safeParse({ ...valid, availability: [day] }).success,
    ).toBe(true);
    expect(
      issues(
        createObjectSchema.safeParse({
          ...valid,
          availability: Array.from(
            { length: availabilityMaxIntervals + 1 },
            () => day,
          ),
        }),
      ),
    ).toEqual(["availability"]);
  });

  it("requires a version and at least one change for edits", () => {
    expect(
      issues(updateObjectSchema.safeParse({ expectedVersion: 1 })),
    ).toEqual(["$"]);
    expect(issues(updateObjectSchema.safeParse({ title: "Ny" }))).toEqual([
      "expectedVersion",
    ]);
    expect(
      updateObjectSchema.parse({ expectedVersion: 3, loanTerms: null }),
    ).toEqual({ expectedVersion: 3, loanTerms: null });
  });
});

import { type HomeItemKind, homeItemKinds } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { describeHomeItem } from "./home-items";

const item = (kind: HomeItemKind, details: object = {}) => ({
  kind,
  target: { type: "loan" as const, id: "00000000-0000-4000-8000-000000000001" },
  title: "Tilhenger",
  role: null,
  day: null,
  dueAt: null,
  count: 2,
  ...details,
});

describe("Home items in the user's words", () => {
  it.each(Object.keys(homeItemKinds) as HomeItemKind[])(
    "%s has a text without internal terms",
    (kind) => {
      const { text } = describeHomeItem(item(kind));

      expect(text).not.toMatch(/[a-z]+_[a-z]+|undefined|null/);
      expect(text.length).toBeGreaterThan(10);
    },
  );

  it("says the deadline before the day", () => {
    expect(
      describeHomeItem(
        item("loan.report_handover", {
          day: "2026-10-03",
          dueAt: "2026-10-06T10:00:00.000Z",
        }),
      ).when,
    ).toBe("Frist tirsdag 6. oktober kl. 12:00");
    expect(
      describeHomeItem(item("loan.handover", { day: "2026-10-03" })).when,
    ).toBe("lørdag 3. oktober");
  });

  it("names the side of a loan under way", () => {
    expect(
      describeHomeItem(item("loan.handover", { role: "lender" })).text,
    ).toBe("Du låner bort Tilhenger");
    expect(
      describeHomeItem(item("loan.return", { role: "borrower" })).text,
    ).toBe("Du leverer tilbake Tilhenger");
  });

  it("counts administrative tasks", () => {
    expect(
      describeHomeItem(
        item("environment.review_memberships", {
          title: "Borettslaget",
          count: 1,
        }),
      ).text,
    ).toBe("1 innmelding venter i Borettslaget");
  });
});

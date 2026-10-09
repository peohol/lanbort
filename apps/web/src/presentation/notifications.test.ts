import { notificationKindSchema } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { notificationText } from "./notifications";

describe("what a notification says", () => {
  it("has a sentence for every kind", () => {
    for (const kind of notificationKindSchema.options) {
      expect(notificationText({ kind, detail: null })).toMatch(/\S/);
    }
  });

  it("explains the security impact of a new chat device", () => {
    const text = notificationText({
      kind: "chat.device_linked",
      detail: null,
    });
    expect(text).toContain("kan motta nye meldinger");
    expect(text).toContain("ikke tidligere meldinger automatisk");
    expect(text).toContain("Mine enheter");
  });

  it("says what the other party said, where the detail tells", () => {
    expect(
      notificationText({ kind: "loan.return_reported", detail: "still_has" }),
    ).toBe("Låntakeren sier at de fortsatt har objektet");
    expect(
      notificationText({ kind: "loan.return_reported", detail: "unknown" }),
    ).toBe("Den andre parten har svart om en retur");
    expect(
      notificationText({ kind: "environment.role_invited", detail: "owner" }),
    ).toBe("Du er spurt om å bli eier av et miljø");
  });
});

import {
  notificationKinds,
  setNotificationPreferenceSchema,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { dueLoanDeadline } from "./deadlines";
import { notificationRules, rulesByEventType } from "./generator";
import {
  distinctDrafts,
  effectivePreferences,
  levelOf,
  shownInApp,
} from "./model";

describe("notification levels (PS-COM-003)", () => {
  it("follow from the kind: events in an approved loan are required", () => {
    expect(levelOf("loan.cancelled")).toBe("required");
    expect(levelOf("loan.return_day_passed")).toBe("required");
    expect(levelOf("loan_request.received")).toBe("action");
    expect(levelOf("social.friend_request_accepted")).toBe("information");
    expect(
      Object.entries(notificationKinds)
        .filter(([kind]) => kind.startsWith("loan.responsibility_"))
        .map(([, level]) => level),
    ).toEqual(["action", "required", "required", "action", "action"]);
  });
});

describe("preferences (PS-COM-002–003)", () => {
  it("start from the pilot standard: everything in the app, no e-mail for action or information", () => {
    expect(effectivePreferences([])).toEqual({
      required: { in_app: true },
      action: { in_app: true, email: false },
      information: { in_app: true, email: false },
    });
  });

  it("only let information leave the app", () => {
    const choices = effectivePreferences([
      { level: "information", channel: "in_app", enabled: false },
      { level: "action", channel: "email", enabled: true },
      // Not configurable: ignored even if it were ever stored.
      { level: "required", channel: "in_app", enabled: false },
      { level: "action", channel: "in_app", enabled: false },
    ]);

    expect(choices).toEqual({
      required: { in_app: true },
      action: { in_app: true, email: true },
      information: { in_app: false, email: false },
    });
    expect(shownInApp("required", choices)).toBe(true);
    expect(shownInApp("action", choices)).toBe(true);
    expect(shownInApp("information", choices)).toBe(false);
  });

  it("refuse a choice for a channel that cannot be chosen", () => {
    const parse = (input: object) =>
      setNotificationPreferenceSchema.safeParse(input).success;

    expect(
      parse({ level: "information", channel: "in_app", enabled: false }),
    ).toBe(true);
    expect(parse({ level: "action", channel: "email", enabled: true })).toBe(
      true,
    );
    expect(
      parse({ level: "required", channel: "in_app", enabled: false }),
    ).toBe(false);
    expect(parse({ level: "action", channel: "in_app", enabled: false })).toBe(
      false,
    );
    expect(parse({ level: "required", channel: "email", enabled: false })).toBe(
      false,
    );
  });
});

describe("notification drafts", () => {
  it("tell each recipient once per kind and target", () => {
    const target = { type: "loan", id: "loan-1" } as const;
    const draft = {
      recipientId: "anna",
      kind: "loan.possession_uncertain",
      target,
    } as const;

    expect(
      distinctDrafts([
        draft,
        draft,
        { ...draft, recipientId: "bo" },
        { ...draft, target: { ...target, id: "loan-2" } },
      ]),
    ).toHaveLength(3);
  });

  it("have one rule per event type", () => {
    const rule = notificationRules[0]!;

    expect(rulesByEventType(notificationRules).size).toBe(
      notificationRules.length,
    );
    expect(() => rulesByEventType([rule, rule])).toThrow(/Two notification/);
  });
});

describe("loan deadlines", () => {
  // Days 10–12 agreed: `until` is the day after the last.
  const period = { from: "2030-06-10", until: "2030-06-13" };

  it("tell when the handover day is over without a handover", () => {
    expect(dueLoanDeadline("reserved", period, "2030-06-10")).toBeNull();
    expect(dueLoanDeadline("reserved", period, "2030-06-11")).toEqual({
      kind: "loan.handover_day_passed",
      day: "2030-06-10",
    });
  });

  it("tell on the last day and when it is over, while the loan is active", () => {
    expect(dueLoanDeadline("active", period, "2030-06-11")).toBeNull();
    expect(dueLoanDeadline("active", period, "2030-06-12")).toEqual({
      kind: "loan.return_due",
      day: "2030-06-12",
    });
    expect(dueLoanDeadline("active", period, "2030-06-13")).toEqual({
      kind: "loan.return_day_passed",
      day: "2030-06-13",
    });
  });

  it("say nothing once the parties have spoken or the loan ended", () => {
    for (const status of ["late", "return_disputed", "disputed", "ended"]) {
      expect(
        dueLoanDeadline(status as "late", period, "2030-06-20"),
      ).toBeNull();
    }
  });
});

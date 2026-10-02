import { describe, expect, it } from "vitest";
import {
  effectiveState,
  planRequirementChange,
  type RequirementRecord,
  transitionDeadlineFrom,
  unmetRequirements,
  validateAnswers,
} from "./model";

const requirement = (
  id: string,
  kind: RequirementRecord["kind"],
  introducedInRevision = 1,
): RequirementRecord => ({
  id,
  kind,
  text: `Krav ${id}`,
  introducedInRevision,
});

const accept = requirement(
  "00000000-0000-4000-8000-000000000001",
  "acceptance",
);
const info = requirement("00000000-0000-4000-8000-000000000002", "information");
const added = requirement(
  "00000000-0000-4000-8000-000000000003",
  "acceptance",
  2,
);

describe("effective membership state (PS-ENV-006)", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("is passive once an active member's transition deadline has passed", () => {
    expect(
      effectiveState({ state: "active", transitionDeadline: now }, now),
    ).toBe("passive");
    expect(
      effectiveState(
        { state: "active", transitionDeadline: transitionDeadlineFrom(now) },
        now,
      ),
    ).toBe("active");
    expect(
      effectiveState({ state: "pending", transitionDeadline: null }, now),
    ).toBe("pending");
  });

  it("gives 14 days", () => {
    expect(transitionDeadlineFrom(now).toISOString()).toBe(
      "2026-10-16T12:00:00.000Z",
    );
  });
});

describe("unmet requirements", () => {
  it("are every unanswered requirement before activation", () => {
    expect(
      unmetRequirements(
        { state: "pending", activationRevision: null },
        [accept, info],
        new Set([accept.id]),
      ),
    ).toEqual([info]);
  });

  it("are only newer requirements for an active member", () => {
    expect(
      unmetRequirements(
        { state: "active", activationRevision: 1 },
        [accept, info, added],
        new Set(),
      ),
    ).toEqual([added]);
  });
});

describe("answers", () => {
  it("must cover exactly the current requirements", () => {
    expect(
      validateAnswers(
        [accept, info],
        [
          { requirementId: info.id, answer: "H0201" },
          { requirementId: accept.id, accepted: true },
        ],
      ),
    ).toEqual([
      { requirementId: info.id, answer: "H0201" },
      { requirementId: accept.id, answer: null },
    ]);

    expect(() =>
      validateAnswers(
        [accept, info],
        [{ requirementId: accept.id, accepted: true }],
      ),
    ).toThrow(expect.objectContaining({ code: "conflict" }));
    expect(() =>
      validateAnswers([accept], [{ requirementId: info.id, answer: "x" }]),
    ).toThrow(expect.objectContaining({ code: "conflict" }));
  });

  it("must match the kind of requirement and not repeat", () => {
    expect(() =>
      validateAnswers([info], [{ requirementId: info.id, accepted: true }]),
    ).toThrow(expect.objectContaining({ code: "invalid_input" }));
    expect(() =>
      validateAnswers(
        [accept],
        [
          { requirementId: accept.id, accepted: true },
          { requirementId: accept.id, accepted: true },
        ],
      ),
    ).toThrow(
      expect.objectContaining({
        code: "invalid_input",
        fields: ["answers.1.requirementId"],
      }),
    );
  });
});

describe("planning a change of requirements", () => {
  it("keeps, adds, retires and reorders", () => {
    expect(
      planRequirementChange(
        [accept, info],
        [{ id: info.id }, { kind: "acceptance", text: "Nytt" }],
      ),
    ).toEqual({
      kept: [{ id: info.id, position: 0 }],
      added: [{ kind: "acceptance", text: "Nytt", position: 1 }],
      retiredIds: [accept.id],
      changed: true,
    });

    expect(
      planRequirementChange(
        [accept, info],
        [{ id: info.id }, { id: accept.id }],
      ).changed,
    ).toBe(true);
    expect(
      planRequirementChange(
        [accept, info],
        [{ id: accept.id }, { id: info.id }],
      ).changed,
    ).toBe(false);
  });

  it("refuses unknown or repeated requirements", () => {
    for (const drafts of [
      [{ id: added.id }],
      [{ id: accept.id }, { id: accept.id }],
    ]) {
      expect(() => planRequirementChange([accept], drafts)).toThrow(
        expect.objectContaining({ code: "invalid_input" }),
      );
    }
  });
});

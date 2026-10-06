import type { Environment, OwnMembership } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  answerCommand,
  describeTypeChange,
  leavingConsequences,
  membershipStep,
  roleName,
} from "./environments";

const environment = (
  changes: Partial<Environment> = {},
  membership: Partial<OwnMembership> | null = null,
): Environment => ({
  id: "00000000-0000-4000-8000-0000000000e1",
  type: "closed",
  state: "active",
  name: "Gården",
  description: null,
  audience: null,
  objectFocus: null,
  location: null,
  area: null,
  version: 1,
  requirementsRevision: 0,
  requiresObjectApproval: false,
  requirements: [],
  membership: membership && {
    id: "00000000-0000-4000-8000-0000000000f1",
    state: "active",
    origin: "application",
    reviewStage: null,
    passiveReason: null,
    transitionDeadline: null,
    unmetRequirementIds: [],
    answers: [],
    ...membership,
  },
  roles: [],
  continuity: null,
  roleInvitations: [],
  typeChange: null,
  ...changes,
});

describe("membershipStep", () => {
  it("lets outsiders join an open environment and apply to a closed one", () => {
    expect(membershipStep(environment({ type: "open" }))).toEqual({
      kind: "join",
    });
    expect(membershipStep(environment())).toEqual({ kind: "apply" });
    expect(membershipStep(environment({ state: "winding_down" }))).toEqual({
      kind: "closed_to_new",
    });
  });

  it("follows an application, an invitation and a request for information", () => {
    expect(
      membershipStep(
        environment({}, { state: "pending", reviewStage: "submitted" }),
      ),
    ).toEqual({ kind: "awaiting_review", reactivation: false });
    expect(
      membershipStep(
        environment(
          { type: "hidden" },
          { state: "pending", origin: "invitation" },
        ),
      ),
    ).toEqual({ kind: "accept_invitation" });
    expect(
      membershipStep(
        environment(
          {},
          { state: "pending", reviewStage: "information_requested" },
        ),
      ).kind,
    ).toBe("information_requested");
    expect(
      membershipStep(
        environment(
          { type: "open" },
          { state: "pending", reviewStage: "confirmation_required" },
        ),
      ).kind,
    ).toBe("confirm");
  });

  it("brings a passive member back directly only where no review is needed", () => {
    expect(
      membershipStep(
        environment(
          {},
          { state: "passive", passiveReason: "requirements_not_met" },
        ),
      ),
    ).toEqual({ kind: "passive", direct: false });
    expect(
      membershipStep(
        environment(
          { type: "open" },
          { state: "passive", passiveReason: "type_change_not_accepted" },
        ),
      ),
    ).toEqual({ kind: "passive", direct: true });
    expect(
      membershipStep(
        environment({}, { state: "passive", reviewStage: "submitted" }),
      ),
    ).toEqual({ kind: "awaiting_review", reactivation: true });
  });

  it("asks an active member to meet new requirements before the deadline", () => {
    const deadline = "2026-10-20T10:00:00.000Z";

    expect(
      membershipStep(
        environment(
          {},
          {
            transitionDeadline: deadline,
            unmetRequirementIds: ["00000000-0000-4000-8000-0000000000a1"],
          },
        ),
      ),
    ).toEqual({ kind: "transition", deadline });
    expect(membershipStep(environment({}, {}))).toEqual({ kind: "member" });
  });
});

describe("answerCommand", () => {
  it("names the step it takes", () => {
    const hidden = environment(
      { type: "hidden" },
      { state: "pending", origin: "invitation" },
    );

    expect(answerCommand(hidden, membershipStep(hidden))).toEqual({
      path: "/api/environments/membership/accept",
      heading: "Bli med",
      label: "Godta invitasjonen til Gården",
    });
    expect(answerCommand(environment({}, {}), { kind: "member" })).toBeNull();
  });
});

describe("what members are told", () => {
  it("says how a member gets back after leaving, by type", () => {
    expect(
      leavingConsequences(environment({ type: "hidden" })).stays,
    ).toContain("For å bli med igjen trenger du en ny invitasjon.");
  });

  it("explains a vote on hidden → closed and who is removed (UX-PRIV-008)", () => {
    const { lines, accept } = describeTypeChange({
      id: "00000000-0000-4000-8000-0000000000b1",
      toType: "closed",
      process: "vote",
      deadline: "2026-10-13T10:00:00.000Z",
      yourResponse: null,
    });

    expect(accept).toBe("Godta at miljøet blir lukket");
    expect(lines.join(" ")).toMatch(/minst 2 av 3 aktive medlemmer/);
    expect(lines.join(" ")).toMatch(/ikke har godtatt, fjernet fra miljøet/);
  });

  it("names the owner, who is also administrator, once", () => {
    expect(roleName(["owner", "administrator"])).toBe("Eier");
    expect(roleName([])).toBeNull();
  });
});

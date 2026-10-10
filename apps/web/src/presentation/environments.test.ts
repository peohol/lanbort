import type { Environment, OwnMembership } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  answerCommand,
  describeMembers,
  describeMembership,
  describeTypeChange,
  givenAnswers,
  leavingConsequences,
  membershipLabel,
  membershipStep,
  roleName,
  welcome,
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
  members: null,
  applicationRejected: false,
  membership: membership && {
    id: "00000000-0000-4000-8000-0000000000f1",
    state: "active",
    origin: "application",
    reviewStage: null,
    passiveReason: null,
    transitionDeadline: null,
    unmetRequirementIds: [],
    answers: [],
    informationQuestion: null,
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
    expect(membershipStep(environment())).toEqual({
      kind: "apply",
      rejected: false,
    });
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
      opens: "Bli med",
      label: "Godta invitasjonen til Gården",
      joins: true,
      reviewed: false,
    });
    expect(answerCommand(environment({}, {}), { kind: "member" })).toBeNull();
  });

  it("says when the administrators decide, and when the user is in at once", () => {
    const closed = environment();

    expect(answerCommand(closed, membershipStep(closed))).toMatchObject({
      label: "Send søknaden",
      joins: false,
      reviewed: true,
    });
    expect(
      answerCommand(closed, { kind: "passive", direct: true }),
    ).toMatchObject({ joins: false, reviewed: false });
    expect(
      answerCommand(environment({ type: "open" }), { kind: "join" }),
    ).toMatchObject({ joins: true, reviewed: false });
  });
});

describe("givenAnswers", () => {
  const question = {
    id: "00000000-0000-4000-8000-00000000a001",
    kind: "information",
    text: "Hvilken leilighet bor du i?",
  } as const;
  const rule = {
    id: "00000000-0000-4000-8000-00000000a002",
    kind: "acceptance",
    text: "Jeg godtar husreglene",
  } as const;

  it("shows each answer under its question and the rules once", () => {
    expect(
      givenAnswers(
        environment(
          { requirements: [question, rule] },
          {
            state: "pending",
            answers: [
              { requirementId: question.id, answer: "H0201" },
              { requirementId: rule.id, answer: null },
            ],
          },
        ),
      ),
    ).toEqual([
      { term: "Hvilken leilighet bor du i?", value: "H0201" },
      { term: "Regler", value: "Godtatt" },
    ]);
  });

  it("keeps an answer to a changed question, and the rules only once all are accepted", () => {
    expect(
      givenAnswers(
        environment(
          { requirements: [question, rule] },
          {
            state: "pending",
            answers: [
              {
                requirementId: "00000000-0000-4000-8000-00000000a003",
                answer: "Gammelt svar",
              },
            ],
          },
        ),
      ),
    ).toEqual([{ term: "Et spørsmål som er endret", value: "Gammelt svar" }]);
    expect(givenAnswers(environment())).toEqual([]);
  });
});

describe("welcome", () => {
  it("greets by first name, or without a name", () => {
    expect(welcome("Ingrid Berg")).toBe("Velkommen, Ingrid");
    expect(welcome(null)).toBe("Velkommen");
    expect(welcome("  ")).toBe("Velkommen");
  });
});

describe("membershipLabel", () => {
  it("names the type before joining and the membership after", () => {
    const outside = environment();
    expect(membershipLabel(outside, membershipStep(outside))).toBe(
      "Lukket miljø",
    );
    const waiting = environment({}, { state: "pending" });
    expect(membershipLabel(waiting, membershipStep(waiting))).toBe(
      "Venter på administratorene",
    );
    const member = environment({}, {});
    expect(membershipLabel(member, membershipStep(member))).toBe("Medlem");
  });
});

describe("a request for more information (PS-ENV-019)", () => {
  const asked = (informationQuestion: string | null) =>
    environment(
      {},
      {
        state: "pending",
        reviewStage: "information_requested",
        informationQuestion,
      },
    );

  it("asks the applicant to look over the answers when the administrators wrote nothing", () => {
    const plain = asked(null);

    expect(describeMembership(plain, membershipStep(plain))).toBe(
      "Administratorene ber om mer informasjon før de svarer. Se over svarene dine og send dem på nytt.",
    );
  });

  it("leaves the standard prompt out when their question is shown", () => {
    const question = asked("Hvilken oppgang bor du i?");

    expect(describeMembership(question, membershipStep(question))).toBe(
      "Administratorene ber om mer informasjon før de svarer.",
    );
  });
});

describe("a rejected application (PS-ENV-017)", () => {
  it("says so neutrally and leaves applying again as it was", () => {
    const rejected = environment({ applicationRejected: true });
    const step = membershipStep(rejected);

    expect(step).toEqual({ kind: "apply", rejected: true });
    expect(membershipLabel(rejected, step)).toBe("Ikke godkjent");
    expect(describeMembership(rejected, step)).toBe(
      "Søknaden ble ikke godkjent.",
    );
    expect(answerCommand(rejected, step)).toMatchObject({
      opens: "Søk på nytt",
      reviewed: true,
    });
  });

  it("gives way to joining an environment that has become open", () => {
    expect(
      membershipStep(environment({ type: "open", applicationRejected: true })),
    ).toEqual({ kind: "join" });
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

describe("about how many members (PS-ENV-016)", () => {
  it("says it in words, as the server rounded it", () => {
    expect(describeMembers({ kind: "fewer_than", count: 10 })).toBe(
      "under 10 medlemmer",
    );
    expect(describeMembers({ kind: "about", count: 140 })).toBe(
      "ca. 140 medlemmer",
    );
    expect(describeMembers({ kind: "about", count: 1200 })).toBe(
      "ca. 1\u00a0200 medlemmer",
    );
  });
});

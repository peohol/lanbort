import {
  type AdministeredMembership,
  type EnvironmentRoles,
  type HomeItemKind,
  homeItemKinds,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { environmentCasesHref } from "@/navigation/cases";
import {
  administrationHref,
  awaitsDecision,
  membershipStatus,
  membershipTask,
  ownershipRecipients,
  proposalWaitsFor,
  typeChoices,
  waitingNames,
  waitingTasks,
} from "./environment-admin";
import { administrationText } from "./home-tasks";

const membership = (
  details: Partial<AdministeredMembership>,
): AdministeredMembership => ({
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  realName: "Kari Nordmann",
  removable: false,
  state: "active",
  origin: "application",
  reviewStage: null,
  passiveReason: null,
  transitionDeadline: null,
  unmetRequirementIds: [],
  answers: [],
  informationQuestion: null,
  ...details,
});

describe("type changes an administrator is offered", () => {
  it("makes an open environment stricter at once", () => {
    expect(typeChoices("open").map(({ type, kind }) => [type, kind])).toEqual([
      ["closed", "stricter"],
      ["hidden", "stricter"],
    ]);
  });

  it("asks every member of a closed environment before it opens", () => {
    expect(typeChoices("closed").map(({ type, kind }) => [type, kind])).toEqual(
      [
        ["open", "consent"],
        ["hidden", "stricter"],
      ],
    );
  });

  it("opens a hidden environment only through a vote on closed", () => {
    const [choice, ...rest] = typeChoices("hidden");

    expect(rest).toEqual([]);
    expect(choice).toMatchObject({ type: "closed", kind: "vote" });
    // UX-PRIV-008: the deadline, the 2/3 and the removal are explained.
    expect(choice?.consequences.affects?.join(" ")).toMatch(
      /7 dager.*to tredeler av de aktive medlemmene.*fjernes/,
    );
    // PS-ENV-008: two thirds of however many are active, never a count.
    expect(proposalWaitsFor.vote).toMatch(/to tredeler av de aktive/);
    expect(
      [...(choice?.consequences.affects ?? []), proposalWaitsFor.vote].join(
        " ",
      ),
    ).not.toMatch(/\d+ av \d+/);
  });
});

describe("memberships administrators handle", () => {
  it("groups what waits for a decision apart from what waits for others", () => {
    const submitted = membership({
      state: "pending",
      reviewStage: "submitted",
    });
    const reactivation = membership({
      state: "passive",
      reviewStage: "submitted",
    });
    const asked = membership({
      state: "pending",
      reviewStage: "information_requested",
    });
    const confirming = membership({
      state: "pending",
      reviewStage: "confirmation_required",
    });
    const invited = membership({ state: "pending", origin: "invitation" });

    expect(
      [submitted, reactivation, asked, confirming, invited].map(membershipTask),
    ).toEqual([
      "application",
      "reactivation",
      "application",
      "confirmation",
      "invitation",
    ]);
    expect(
      [submitted, reactivation, asked, confirming, invited].map(awaitsDecision),
    ).toEqual([true, true, false, false, false]);
    expect(membershipStatus(asked).text).toBe(
      "Venter på mer informasjon fra søkeren",
    );
    expect(membershipTask(membership({ state: "passive" }))).toBeNull();
  });
});

describe("ownership is offered as the domain allows (PS-ENV-013)", () => {
  const holder = (
    userId: string,
    details: Partial<EnvironmentRoles["holders"][number]> = {},
  ) => ({
    userId,
    realName: null,
    roles: ["administrator" as const],
    administratorSince: "2026-10-01T00:00:00.000Z",
    canAct: true,
    ...details,
  });
  const owner = holder("owner", { roles: ["owner", "administrator"] });

  it("offers ownership only to other administrators who can act", () => {
    const active = holder("active");
    const passive = holder("passive", { canAct: false });

    expect(
      ownershipRecipients([owner, active, passive], "owner").map(
        ({ userId }) => userId,
      ),
    ).toEqual(["active"]);
  });
});

describe("Home's administration tasks", () => {
  const item = (kind: HomeItemKind) => ({
    kind,
    target: {
      type: "environment" as const,
      id: "00000000-0000-4000-8000-000000000003",
    },
    title: "Borettslaget",
    role: null,
    person: null,
    via: null,
    picture: null,
    period: null,
    day: null,
    dueAt: null,
    count: 1,
  });

  it("leads to where each task is done in the administration", () => {
    const admin = "/miljoer/00000000-0000-4000-8000-000000000003/administrer";

    expect(administrationHref(item("environment.review_memberships"))).toBe(
      `${admin}/innmeldinger`,
    );
    expect(administrationHref(item("environment.review_publications"))).toBe(
      `${admin}/ting`,
    );
    // A missing owner is answered on «Administrer miljøet» itself.
    expect(administrationHref(item("environment.claim_ownership"))).toBe(admin);
    expect(
      administrationHref(item("environment.answer_invitation")),
    ).toBeNull();
  });

  const administration = (Object.keys(homeItemKinds) as HomeItemKind[]).filter(
    (kind) => homeItemKinds[kind] === "administration",
  );
  const ownPages: readonly HomeItemKind[] = [
    "environment.review_memberships",
    "environment.review_publications",
    "environment.claim_ownership",
  ];

  it("leaves no kind of task out of «Venter på dere», each counted", () => {
    const rows = waitingTasks(
      administration.map((kind) => ({ ...item(kind), count: 2 })),
    );

    // A missing owner is the status card at the top, not a row.
    expect(rows.map(({ kind }) => kind)).toEqual(
      administration.filter((kind) => kind !== "environment.claim_ownership"),
    );
    expect(rows.every(({ count }) => count === 2)).toBe(true);
  });

  it("leads each kind of case to the queue, with what to do", () => {
    const cases = administration.filter((kind) => !ownPages.includes(kind));
    const rows = waitingTasks(cases.map(item));

    expect(cases.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.href).toBe(environmentCasesHref(item(row.kind).target.id));
      expect(row.label).toBe(administrationText(item(row.kind)));
    }
  });
});

describe("who or what waits, in a short line", () => {
  it("names one or two, and counts the rest", () => {
    expect(waitingNames([])).toBeNull();
    expect(waitingNames(["Jonas Vik"])).toBe("Jonas Vik");
    expect(waitingNames(["Jonas Vik", "Erik Sund"])).toBe(
      "Jonas Vik og Erik Sund",
    );
    expect(waitingNames(["Jonas Vik", "Erik Sund", "Mats Dahl"])).toBe(
      "Jonas Vik, Erik Sund og 1 til",
    );
  });

  it("counts also those the page did not list", () => {
    expect(waitingNames(["Sykkelhenger"], 4)).toBe("Sykkelhenger og 3 til");
  });
});

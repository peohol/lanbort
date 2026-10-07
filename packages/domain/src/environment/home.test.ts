import type {
  Environment,
  EnvironmentMemberships,
  ReviewedPublication,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { administrationHomeItems, environmentHomeItems } from "./home";

const me = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const due = "2026-10-10T00:00:00.000Z";

type Membership = NonNullable<Environment["membership"]>;

function membership(changes: Partial<Membership> = {}): Membership {
  return {
    id: me,
    state: "active",
    origin: "self_service",
    reviewStage: null,
    passiveReason: null,
    transitionDeadline: null,
    unmetRequirementIds: [],
    answers: [],
    ...changes,
  };
}

function environment(changes: Partial<Environment> = {}): Environment {
  return {
    id: me,
    type: "closed",
    state: "active",
    name: "Borettslaget",
    description: null,
    audience: null,
    objectFocus: null,
    location: null,
    area: null,
    version: 1,
    requirementsRevision: 0,
    requiresObjectApproval: false,
    requirements: [],
    membership: membership(),
    roles: [],
    continuity: null,
    roleInvitations: [],
    typeChange: null,
    ...changes,
  };
}

const kinds = (changes: Partial<Environment>) =>
  environmentHomeItems(environment(changes)).map((item) => item.kind);

describe("what an environment asks of its member", () => {
  it("asks nothing of a settled member", () => {
    expect(kinds({})).toEqual([]);
    expect(kinds({ membership: null })).toEqual([]);
  });

  it("asks an invitee to answer, and an applicant only when asked", () => {
    expect(
      kinds({
        membership: membership({ state: "pending", origin: "invitation" }),
      }),
    ).toEqual(["environment.answer_invitation"]);
    expect(
      kinds({
        membership: membership({
          state: "pending",
          origin: "application",
          reviewStage: "submitted",
        }),
      }),
    ).toEqual([]);
    expect(
      kinds({
        membership: membership({
          state: "passive",
          reviewStage: "information_requested",
        }),
      }),
    ).toEqual(["environment.answer_requirements"]);
    expect(
      kinds({
        membership: membership({
          state: "pending",
          reviewStage: "confirmation_required",
        }),
      }),
    ).toEqual(["environment.confirm_membership"]);
  });

  it("asks an active member to meet new requirements before the deadline", () => {
    const [item] = environmentHomeItems(
      environment({
        membership: membership({
          transitionDeadline: due,
          unmetRequirementIds: [other],
        }),
      }),
    );

    expect(item).toMatchObject({
      kind: "environment.answer_requirements",
      dueAt: due,
      title: "Borettslaget",
    });
  });

  it("asks about a role, an unanswered type change and a vacant ownership", () => {
    expect(
      kinds({
        roles: ["administrator"],
        roleInvitations: [{ id: other, role: "owner" }],
        typeChange: {
          id: other,
          toType: "open",
          process: "consent",
          deadline: due,
          yourResponse: null,
        },
        continuity: {
          administrationAvailable: true,
          ownershipVacancy: { claimDeadline: due, claimedByYou: false },
          windDown: null,
        },
      }),
    ).toEqual([
      "environment.answer_role_invitation",
      "environment.answer_type_change",
      "environment.claim_ownership",
    ]);
    expect(
      kinds({
        typeChange: {
          id: other,
          toType: "open",
          process: "consent",
          deadline: due,
          yourResponse: true,
        },
        continuity: {
          administrationAvailable: true,
          ownershipVacancy: { claimDeadline: due, claimedByYou: true },
          windDown: null,
        },
        roles: ["administrator"],
      }),
    ).toEqual([]);
  });
});

describe("an administrator's tasks", () => {
  const memberships = (
    ...rows: Array<{ userId: string; reviewStage: Membership["reviewStage"] }>
  ): EnvironmentMemberships => ({
    memberships: rows.map((row) => ({
      ...membership({ state: "pending", reviewStage: row.reviewStage }),
      userId: row.userId,
      realName: null,
    })),
    restrictions: [],
  });
  const publication = (objectId: string) =>
    ({ objectId }) as ReviewedPublication;

  it("counts what waits for a decision, never the administrator's own", () => {
    expect(
      administrationHomeItems(environment(), {
        userId: me,
        memberships: memberships(
          { userId: other, reviewStage: "submitted" },
          { userId: me, reviewStage: "submitted" },
          { userId: other, reviewStage: "information_requested" },
        ),
        pendingPublications: [publication(me), publication(other)],
        ownObjectIds: new Set([me]),
      }),
    ).toMatchObject([
      { kind: "environment.review_memberships", count: 1 },
      { kind: "environment.review_publications", count: 1 },
    ]);
  });

  it("shows nothing when nothing waits", () => {
    expect(
      administrationHomeItems(environment(), {
        userId: me,
        memberships: null,
        pendingPublications: [publication(me)],
        ownObjectIds: new Set([me]),
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { anonymousActor, systemActor, type UserActor } from "../actor";
import { definePolicy } from "../authorization/policy";
import { outcomeOf, type PolicyCase } from "../authorization/policy-matrix";
import {
  recentAuthenticationMaxAgeMs,
  requireNotInvolved,
  requireRecentAuthentication,
} from "../authorization/rules";
import { testUserActor } from "../testing/actors";
import { platformStewardAccess } from "./policies";

/**
 * WP-12 building blocks, proven on a representative steward action: handling
 * a platform case. Real case policies arrive with the case domain (Phase 4).
 */
interface CaseResource {
  readonly parties: readonly string[];
  readonly reported: readonly string[];
}

const handleCase = definePolicy<CaseResource, void>({
  action: "test.platform_case.handle",
  actor: [...platformStewardAccess, requireRecentAuthentication()],
  resource: [
    requireNotInvolved(({ resource }) => [
      ...resource.parties,
      ...resource.reported,
    ]),
  ],
});

const now = new Date("2026-10-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

function steward(overrides: Partial<UserActor> = {}): UserActor {
  return testUserActor({
    platformRoles: ["platform_steward"],
    authentication: {
      sessionId: "s",
      assurance: "aal2",
      methods: [
        { method: "step_up", at: ago(60_000) },
        { method: "otp", at: ago(3_600_000) },
      ],
    },
    ...overrides,
  });
}

const someCase: CaseResource = { parties: ["a", "b"], reported: [] };
const stewardOnDuty = steward();

type Case = Omit<PolicyCase<CaseResource, void>, "context" | "now">;

const cases: PolicyCase<CaseResource, void>[] = (
  [
    {
      name: "uninvolved steward with fresh stronger authentication",
      actor: stewardOnDuty,
      resource: someCase,
      expected: "allow",
    },
    {
      name: "steward who is a party to the case",
      actor: stewardOnDuty,
      resource: { parties: [stewardOnDuty.userId, "b"], reported: [] },
      expected: "conflict_of_interest",
    },
    {
      name: "steward who is reported in the case",
      actor: stewardOnDuty,
      resource: { parties: ["a"], reported: [stewardOnDuty.userId] },
      expected: "conflict_of_interest",
    },
    {
      name: "steward without stronger authentication in this session",
      actor: steward({
        authentication: {
          sessionId: "s",
          assurance: "aal1",
          methods: [{ method: "otp", at: ago(1000) }],
        },
      }),
      resource: someCase,
      expected: "stronger_authentication_required",
    },
    {
      name: "steward whose last sign-in is too old",
      actor: steward({
        authentication: {
          sessionId: "s",
          assurance: "aal2",
          methods: [
            { method: "step_up", at: ago(recentAuthenticationMaxAgeMs + 1) },
          ],
        },
      }),
      resource: someCase,
      expected: "reauthentication_required",
    },
    {
      name: "user without the role, even with stronger authentication",
      actor: steward({ platformRoles: [] }),
      resource: someCase,
      expected: "forbidden",
    },
    {
      name: "steward who has not completed registration",
      actor: steward({ accountStatus: "pending_registration" }),
      resource: someCase,
      expected: "registration_required",
    },
    {
      name: "system process",
      actor: systemActor("outbox.worker"),
      resource: someCase,
      expected: "unauthenticated",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: someCase,
      expected: "unauthenticated",
    },
  ] satisfies Case[]
).map((testCase) => ({ ...testCase, context: undefined, now }));

describe("platform steward access (WP-12)", () => {
  it.each(cases)("$name → $expected", (testCase) => {
    expect(outcomeOf(handleCase, testCase)).toBe(testCase.expected);
  });

  it("checks conflict of interest even for the strongest session", () => {
    const involved = { parties: [stewardOnDuty.userId], reported: [] };

    expect(
      outcomeOf(handleCase, {
        name: "",
        actor: stewardOnDuty,
        resource: involved,
        context: undefined,
        now: ago(-1),
        expected: "allow",
      }),
    ).toBe("conflict_of_interest");
  });
});

describe("requireRecentAuthentication", () => {
  const rule = requireRecentAuthentication(60_000);
  const at = (ms: number) =>
    testUserActor({
      authentication: {
        sessionId: "s",
        assurance: "aal1",
        methods: [{ method: "otp", at: ago(ms) }],
      },
    });

  it("accepts a sign-in exactly at the limit and rejects one just past it", () => {
    expect(rule({ actor: at(60_000), now }).allowed).toBe(true);
    expect(rule({ actor: at(60_001), now })).toEqual({
      allowed: false,
      reason: "reauthentication_required",
    });
  });
});

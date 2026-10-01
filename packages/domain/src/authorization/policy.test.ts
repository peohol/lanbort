import { describe, expect, it } from "vitest";
import { testUserActor } from "../testing/actors";
import { anonymousActor, systemActor, type UserActor } from "../actor";
import { AuthorizationError } from "../errors";
import {
  allow,
  authorize,
  definePolicy,
  deny,
  evaluate,
  type ResourceRule,
} from "./policy";
import { matrixGaps, outcomeOf, policyMatrix } from "./policy-matrix";
import { requireSystemProcess, requireUser, userRule } from "./rules";

const alice: UserActor = testUserActor({ userId: "alice" });
const bob: UserActor = testUserActor({ userId: "bob" });
const now = new Date("2026-10-01T12:00:00Z");

interface Note {
  ownerId: string;
  archived: boolean;
}

const ownsNote: ResourceRule<Note, void> = ({ actor, resource }) =>
  actor.kind === "user" && actor.userId === resource.ownerId
    ? allow
    : deny("not_found");

const notArchived: ResourceRule<Note, void> = ({ resource }) =>
  resource.archived ? deny("forbidden") : allow;

const editNote = definePolicy<Note, void>({
  action: "test.note.edit",
  actor: [requireUser],
  resource: [ownsNote, notArchived],
});

describe("policy definition", () => {
  it("refuses a policy without rules, so nothing is allowed by default", () => {
    expect(() => definePolicy({ action: "test.empty" })).toThrow(/no rules/);
  });

  it("refuses action names that are not machine identifiers", () => {
    expect(() =>
      definePolicy({ action: "Edit note", actor: [requireUser] }),
    ).toThrow(/Invalid policy action/);
  });
});

describe("policy evaluation", () => {
  const evaluateFor = (
    actor: typeof alice | typeof anonymousActor,
    note: Note,
  ) => evaluate(editNote, { actor, resource: note, context: undefined, now });

  it("allows only when every rule allows", () => {
    expect(evaluateFor(alice, { ownerId: "alice", archived: false })).toEqual(
      allow,
    );
  });

  it("denies unauthenticated actors before looking at the resource", () => {
    let resourceRuleCalls = 0;
    const policy = definePolicy<Note, void>({
      action: "test.note.read",
      actor: [requireUser],
      resource: [
        () => {
          resourceRuleCalls += 1;
          return allow;
        },
      ],
    });

    expect(
      evaluate(policy, {
        actor: anonymousActor,
        resource: { ownerId: "alice", archived: false },
        context: undefined,
        now,
      }),
    ).toEqual(deny("unauthenticated"));
    expect(resourceRuleCalls).toBe(0);
  });

  it("returns the first denial in rule order", () => {
    expect(
      evaluateFor(bob as never, { ownerId: "alice", archived: true }),
    ).toEqual(deny("not_found"));
    expect(evaluateFor(alice, { ownerId: "alice", archived: true })).toEqual(
      deny("forbidden"),
    );
  });

  it("propagates a failing rule instead of treating it as allowed", () => {
    const broken = definePolicy({
      action: "test.broken",
      actor: [
        () => {
          throw new Error("rule bug");
        },
      ],
    });

    expect(() =>
      evaluate(broken, {
        actor: alice,
        resource: undefined,
        context: undefined,
        now,
      }),
    ).toThrow("rule bug");
  });

  it("throws a typed authorization error carrying action and reason", () => {
    try {
      authorize(editNote, {
        actor: bob,
        resource: { ownerId: "alice", archived: false },
        context: undefined,
        now,
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error).toMatchObject({
        action: "test.note.edit",
        reason: "not_found",
        code: "not_found",
      });
    }
  });
});

describe("reusable rules", () => {
  it("userRule hands the rule body a signed-in user only", () => {
    const onlyAlice = userRule((actor) =>
      actor.userId === "alice" ? allow : deny("forbidden"),
    );
    const input = (actor: typeof alice | typeof anonymousActor) => ({
      actor,
      now,
    });

    expect(onlyAlice(input(alice))).toEqual(allow);
    expect(onlyAlice(input(bob))).toEqual(deny("forbidden"));
    expect(onlyAlice(input(anonymousActor))).toEqual(deny("unauthenticated"));
  });

  it("requireSystemProcess admits only the named process", () => {
    const rule = requireSystemProcess("outbox.worker");

    expect(rule({ actor: systemActor("outbox.worker"), now })).toEqual(allow);
    expect(rule({ actor: systemActor("other.job"), now })).toEqual(
      deny("forbidden"),
    );
    expect(rule({ actor: alice, now })).toEqual(deny("forbidden"));
  });
});

describe("policy matrices", () => {
  const matrix = policyMatrix(editNote, [
    {
      name: "owner edits own active note",
      actor: alice,
      resource: { ownerId: "alice", archived: false },
      context: undefined,
      expected: "allow",
    },
    {
      name: "another user cannot tell the note exists",
      actor: bob,
      resource: { ownerId: "alice", archived: false },
      context: undefined,
      expected: "not_found",
    },
    {
      name: "anonymous caller",
      actor: anonymousActor,
      resource: { ownerId: "alice", archived: false },
      context: undefined,
      expected: "unauthenticated",
    },
  ]);

  it.each(matrix.cases)("$name → $expected", (testCase) => {
    expect(outcomeOf(matrix.policy, testCase)).toBe(testCase.expected);
  });

  it("reports matrices without both allowed and denied cases", () => {
    expect(matrixGaps(matrix)).toEqual([]);
    expect(
      matrixGaps(policyMatrix(editNote, matrix.cases.slice(0, 1))),
    ).toEqual(["test.note.edit has no denied case"]);
    expect(matrixGaps(policyMatrix(editNote, matrix.cases.slice(1)))).toEqual([
      "test.note.edit has no allowed case",
    ]);
  });
});

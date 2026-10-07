import { randomUUID } from "node:crypto";
import type {
  CreateEnvironment,
  RequirementAnswer,
  RequirementDraft,
} from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { type Actor, systemActor, type UserActor } from "../actor";
import { resolveUserActor } from "../account/identity";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import { ConsumerRegistry } from "../outbox/consumer";
import { blockUser, liftUserBlock } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser, testIdentity } from "../testing/identities";
import {
  createEnvironment,
  liftRestriction,
  updateEnvironmentDetails,
  updateRequirements,
} from "./environment-commands";
import {
  acceptInvitation,
  approveMembership,
  expireTransitions,
  inviteMember,
  joinEnvironment,
  leaveEnvironment,
  rejectMembership,
  requestInformation,
  submitAnswers,
  withdrawInvitation,
} from "./membership-commands";
import { requirementTransitionDays } from "./model";
import { membershipTransitionProcess } from "./policies";
import {
  getEnvironment,
  listMemberships,
  listOwnEnvironments,
} from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());

// Tests move the clock to cross transition deadlines.
let clock = new Date();
const domain: DomainContext = {
  db,
  consumers: new ConsumerRegistry(),
  clock: () => clock,
};
const day = 86_400_000;
const later = (days: number) => new Date(clock.getTime() + days * day);

const run = <I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: unknown,
  idempotencyKey: string = randomUUID(),
) => executeCommand(domain, command, { actor, input, idempotencyKey });

const output = async <I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: unknown,
) => (await run(command, actor, input)).output;

const user = async () => (await registerTestUser(domain)).actor;

async function environment(
  owner: UserActor,
  input: Partial<CreateEnvironment> = {},
) {
  const { environmentId } = await output(createEnvironment, owner, {
    name: "Borettslaget",
    type: "open",
    ...input,
  });

  return environmentId;
}

const read = (actor: Actor, environmentId: string) =>
  executeQuery(domain, getEnvironment, { actor, input: { environmentId } });

const memberships = (actor: Actor, environmentId: string) =>
  executeQuery(domain, listMemberships, { actor, input: { environmentId } });

/** Answers every current requirement, as a client would after reading them. */
async function answersFor(actor: Actor, environmentId: string) {
  const { requirements } = await read(actor, environmentId);

  return requirements.map((requirement): RequirementAnswer =>
    requirement.kind === "information"
      ? { requirementId: requirement.id, answer: "Leilighet H0201" }
      : { requirementId: requirement.id, accepted: true },
  );
}

async function join(actor: Actor, environmentId: string) {
  return output(joinEnvironment, actor, {
    environmentId,
    answers: await answersFor(actor, environmentId),
  });
}

async function setRequirements(
  admin: Actor,
  environmentId: string,
  requirements: RequirementDraft[],
) {
  const { requirementsRevision } = await read(admin, environmentId);

  return output(updateRequirements, admin, {
    environmentId,
    requirements,
    expectedRevision: requirementsRevision,
  });
}

async function membershipEvents(membershipId: string) {
  return db
    .selectFrom("app.audit_events")
    .select(["event_type", "payload"])
    .where("resource_type", "=", "environment_membership")
    .where("resource_id", "=", membershipId)
    .orderBy("position")
    .execute();
}

const rules = {
  kind: "acceptance" as const,
  text: "Jeg godtar husreglene",
};
const apartment = {
  kind: "information" as const,
  text: "Hvilken leilighet bor du i?",
};

describe("creating environments (PS-ENV-001–003)", () => {
  it("makes the creator owner, administrator and first active member", async () => {
    const owner = await user();
    const environmentId = await environment(owner, {
      type: "closed",
      description: "For beboere",
      location: "Oslo",
      requirements: [rules],
    });

    const view = await read(owner, environmentId);
    expect(view).toMatchObject({
      type: "closed",
      name: "Borettslaget",
      description: "For beboere",
      location: "Oslo",
      audience: null,
      requirementsRevision: 1,
      roles: ["owner", "administrator"],
      membership: {
        state: "active",
        origin: "founder",
        unmetRequirementIds: [],
      },
    });
    expect(view.requirements).toEqual([{ id: expect.any(String), ...rules }]);

    const events = await db
      .selectFrom("app.audit_events")
      .select(["event_type", "payload"])
      .where("resource_id", "=", environmentId)
      .orderBy("position")
      .execute();
    expect(events).toEqual([
      { event_type: "environment.created", payload: { type: "closed" } },
      {
        event_type: "environment.role_granted",
        payload: { userId: owner.userId, role: "owner" },
      },
      {
        event_type: "environment.role_granted",
        payload: { userId: owner.userId, role: "administrator" },
      },
    ]);
  });

  it("identifies environments by id, not name (PS-ENV-002)", async () => {
    const owner = await user();
    const first = await environment(owner, { name: "Nabolaget" });
    const second = await environment(owner, { name: "Nabolaget" });

    expect(first).not.toBe(second);
  });

  it("creates once when a request is retried", async () => {
    const owner = await user();
    const key = randomUUID();
    const input = { name: "Dobbelttrykk", type: "open" };

    const results = await Promise.all([
      run(createEnvironment, owner, input, key),
      run(createEnvironment, owner, input, key),
    ]);

    expect(results[0].output).toEqual(results[1].output);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
  });

  it("requires a registered account and valid details", async () => {
    const pending = await resolveUserActor(domain, testIdentity());

    await expect(
      run(createEnvironment, pending!, { name: "X", type: "open" }),
    ).rejects.toMatchObject({ code: "registration_required" });
    await expect(
      run(createEnvironment, await user(), { name: " ", type: "secret" }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["name", "type"],
    });
  });
});

describe("open environments", () => {
  it("activate members who meet the current requirements without review", async () => {
    const owner = await user();
    const member = await user();
    const environmentId = await environment(owner, {
      requirements: [rules, apartment],
    });

    const joined = await join(member, environmentId);
    expect(joined.state).toBe("active");

    const view = await read(member, environmentId);
    expect(view.membership).toMatchObject({
      state: "active",
      origin: "self_service",
      unmetRequirementIds: [],
    });
    expect(view.membership?.answers).toHaveLength(2);
    expect(view.roles).toEqual([]);
  });

  it("refuses answers to requirements that are outdated or of the wrong kind", async () => {
    const owner = await user();
    const member = await user();
    const environmentId = await environment(owner, {
      requirements: [rules, apartment],
    });
    const [accept, info] = (await read(member, environmentId)).requirements;

    await expect(
      run(joinEnvironment, member, {
        environmentId,
        answers: [{ requirementId: accept!.id, accepted: true }],
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(joinEnvironment, member, {
        environmentId,
        answers: [
          { requirementId: accept!.id, accepted: true },
          { requirementId: info!.id, answer: "H0201" },
          { requirementId: randomUUID(), accepted: true },
        ],
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(joinEnvironment, member, {
        environmentId,
        answers: [
          { requirementId: accept!.id, answer: "ja" },
          { requirementId: info!.id, answer: "H0201" },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid_input", fields: ["answers.0"] });

    expect((await read(member, environmentId)).membership).toBeNull();
  });

  it("gives one membership when joins race or are retried", async () => {
    const owner = await user();
    const member = await user();
    const environmentId = await environment(owner);
    const input = { environmentId, answers: [] };
    const key = randomUUID();

    const results = await Promise.allSettled([
      run(joinEnvironment, member, input, key),
      run(joinEnvironment, member, input, key),
      run(joinEnvironment, member, input),
      run(joinEnvironment, member, input),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(
      new Set(fulfilled.map((r) => r.value.output.membershipId)).size,
    ).toBe(1);
    for (const failure of rejected) {
      expect(failure.reason).toMatchObject({ code: "conflict" });
    }

    const rows = await db
      .selectFrom("app.environment_memberships")
      .select("id")
      .where("environment_id", "=", environmentId)
      .where("user_id", "=", member.userId)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it("lets a member leave and later join again as a new membership", async () => {
    const owner = await user();
    const member = await user();
    const environmentId = await environment(owner);
    const first = await join(member, environmentId);

    await output(leaveEnvironment, member, { environmentId });
    expect((await read(member, environmentId)).membership).toBeNull();

    const second = await join(member, environmentId);
    expect(second.membershipId).not.toBe(first.membershipId);
    expect(await membershipEvents(first.membershipId)).toEqual([
      expect.objectContaining({
        event_type: "environment_membership.activated",
      }),
      {
        event_type: "environment_membership.ended",
        payload: {
          environmentId,
          userId: member.userId,
          reason: "left",
        },
      },
    ]);
  });

  it("keeps the owner until the role is handed over (WP-22)", async () => {
    const owner = await user();
    const environmentId = await environment(owner);

    await expect(
      run(leaveEnvironment, owner, { environmentId }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("closed environments", () => {
  async function closedWithApplicant() {
    const owner = await user();
    const applicant = await user();
    const environmentId = await environment(owner, {
      type: "closed",
      requirements: [apartment],
    });
    const { membershipId, state } = await join(applicant, environmentId);
    expect(state).toBe("pending");

    return { owner, applicant, environmentId, membershipId };
  }

  it("show a preview without members or administrators to non-members", async () => {
    const { owner, environmentId } = await closedWithApplicant();
    const outsider = await user();

    const view = await read(outsider, environmentId);
    expect(view).toMatchObject({
      type: "closed",
      name: "Borettslaget",
      membership: null,
      roles: [],
    });
    expect(view.requirements).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(owner.userId);
    await expect(memberships(outsider, environmentId)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("activate an application only when an administrator approves", async () => {
    const { owner, applicant, environmentId, membershipId } =
      await closedWithApplicant();
    const member = await user();
    await output(approveMembership, owner, {
      environmentId,
      membershipId: (await join(member, environmentId)).membershipId,
    });

    // Neither the applicant nor an ordinary member can decide.
    for (const actor of [applicant, member]) {
      await expect(
        run(approveMembership, actor, { environmentId, membershipId }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }

    const list = await memberships(owner, environmentId);
    expect(list.memberships.find((m) => m.id === membershipId)).toMatchObject({
      userId: applicant.userId,
      realName: "Test Testesen",
      state: "pending",
      reviewStage: "submitted",
      answers: [
        { requirementId: expect.any(String), answer: "Leilighet H0201" },
      ],
    });

    expect(
      await output(approveMembership, owner, { environmentId, membershipId }),
    ).toEqual({ membershipId, state: "active" });
    await expect(
      run(approveMembership, owner, { environmentId, membershipId }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("can ask for more information, which the applicant gives", async () => {
    const { owner, applicant, environmentId, membershipId } =
      await closedWithApplicant();

    await output(requestInformation, owner, { environmentId, membershipId });
    expect((await read(applicant, environmentId)).membership).toMatchObject({
      state: "pending",
      reviewStage: "information_requested",
    });

    await output(submitAnswers, applicant, {
      environmentId,
      answers: await answersFor(applicant, environmentId),
    });
    expect((await read(applicant, environmentId)).membership?.reviewStage).toBe(
      "submitted",
    );
  });

  it("can reject, optionally barring new attempts until lifted", async () => {
    const { owner, applicant, environmentId, membershipId } =
      await closedWithApplicant();

    expect(
      await output(rejectMembership, owner, {
        environmentId,
        membershipId,
        restrict: true,
      }),
    ).toEqual({ membershipId, state: "ended" });
    expect((await read(applicant, environmentId)).membership).toBeNull();
    // The ended application leaves the bar, named so it can be lifted.
    expect((await memberships(owner, environmentId)).restrictions).toEqual([
      {
        userId: applicant.userId,
        realName: expect.any(String),
        imposedAt: expect.any(String),
      },
    ]);

    await expect(join(applicant, environmentId)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      run(inviteMember, owner, { environmentId, userId: applicant.userId }),
    ).rejects.toMatchObject({ code: "conflict" });

    await output(liftRestriction, owner, {
      environmentId,
      userId: applicant.userId,
    });
    await expect(
      run(liftRestriction, owner, { environmentId, userId: applicant.userId }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect((await join(applicant, environmentId)).state).toBe("pending");
    expect((await memberships(owner, environmentId)).restrictions).toEqual([]);
  });

  it("lets the applicant withdraw", async () => {
    const { owner, applicant, environmentId, membershipId } =
      await closedWithApplicant();

    await output(leaveEnvironment, applicant, { environmentId });

    expect(await membershipEvents(membershipId)).toContainEqual({
      event_type: "environment_membership.ended",
      payload: {
        environmentId,
        userId: applicant.userId,
        reason: "application_withdrawn",
      },
    });
    await expect(
      run(approveMembership, owner, { environmentId, membershipId }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("hold a pending application when requirements are tightened (PS-ENV-005)", async () => {
    const { owner, applicant, environmentId, membershipId } =
      await closedWithApplicant();
    const [current] = (await read(owner, environmentId)).requirements;

    await setRequirements(owner, environmentId, [{ id: current!.id }, rules]);

    const held = (await read(applicant, environmentId)).membership;
    expect(held?.unmetRequirementIds).toHaveLength(1);
    await expect(
      run(approveMembership, owner, { environmentId, membershipId }),
    ).rejects.toMatchObject({ code: "conflict" });

    // The old answers alone no longer fit the current requirements.
    await expect(
      run(submitAnswers, applicant, {
        environmentId,
        answers: [{ requirementId: current!.id, answer: "H0201" }],
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    await output(submitAnswers, applicant, {
      environmentId,
      answers: await answersFor(applicant, environmentId),
    });
    expect(
      (await output(approveMembership, owner, { environmentId, membershipId }))
        .state,
    ).toBe("active");
  });

  it("apply relaxed requirements at once", async () => {
    const { owner, applicant, environmentId, membershipId } =
      await closedWithApplicant();
    await setRequirements(owner, environmentId, [rules]);

    // The applicant never saw the new rule, so approval waits for it…
    await expect(
      run(approveMembership, owner, { environmentId, membershipId }),
    ).rejects.toMatchObject({ code: "conflict" });

    // …but a removed requirement is never needed again.
    await setRequirements(owner, environmentId, []);
    expect(
      (await output(approveMembership, owner, { environmentId, membershipId }))
        .state,
    ).toBe("active");
    void applicant;
  });

  it("treat an administrator's invitation as the approval", async () => {
    const owner = await user();
    const invitee = await user();
    const environmentId = await environment(owner, {
      type: "closed",
      requirements: [rules],
    });

    const { membershipId } = await output(inviteMember, owner, {
      environmentId,
      userId: invitee.userId,
    });
    expect(
      await output(acceptInvitation, invitee, {
        environmentId,
        answers: await answersFor(invitee, environmentId),
      }),
    ).toEqual({ membershipId, state: "active" });
  });
});

describe("hidden environments (PS-NFR-002)", () => {
  async function hidden() {
    const owner = await user();
    const environmentId = await environment(owner, {
      type: "hidden",
      name: "Hemmelig klubb",
      requirements: [rules],
    });

    return { owner, environmentId };
  }

  it("are indistinguishable from missing environments to outsiders", async () => {
    const { environmentId } = await hidden();
    const outsider = await user();
    const missing = randomUUID();

    for (const id of [environmentId, missing]) {
      await expect(read(outsider, id)).rejects.toMatchObject({
        code: "not_found",
      });
      await expect(memberships(outsider, id)).rejects.toMatchObject({
        code: "not_found",
      });
      for (const [command, input] of [
        [joinEnvironment, { environmentId: id, answers: [] }],
        [submitAnswers, { environmentId: id, answers: [] }],
        [acceptInvitation, { environmentId: id, answers: [] }],
        [leaveEnvironment, { environmentId: id }],
        [inviteMember, { environmentId: id, userId: outsider.userId }],
        [
          updateRequirements,
          { environmentId: id, requirements: [], expectedRevision: 1 },
        ],
        [
          updateEnvironmentDetails,
          { environmentId: id, name: "Ny", expectedVersion: 1 },
        ],
        [liftRestriction, { environmentId: id, userId: outsider.userId }],
        [approveMembership, { environmentId: id, membershipId: randomUUID() }],
      ] as const) {
        await expect(
          run(
            command as CommandDefinition<unknown, unknown, unknown, unknown>,
            outsider,
            input,
          ),
        ).rejects.toMatchObject({ code: "not_found" });
      }
    }

    const own = await executeQuery(domain, listOwnEnvironments, {
      actor: outsider,
      input: {},
    });
    expect(own).toEqual([]);
  });

  it("are reached only through an account-bound invitation (PS-ENV-010)", async () => {
    const { owner, environmentId } = await hidden();
    const invitee = await user();
    const bystander = await user();

    const { membershipId } = await output(inviteMember, owner, {
      environmentId,
      userId: invitee.userId,
    });

    // The invitation is for this account only.
    await expect(read(bystander, environmentId)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      run(acceptInvitation, bystander, { environmentId, answers: [] }),
    ).rejects.toMatchObject({ code: "not_found" });

    // The invited user sees what they are accepting.
    const view = await read(invitee, environmentId);
    expect(view).toMatchObject({
      name: "Hemmelig klubb",
      membership: { state: "pending", origin: "invitation" },
    });
    expect(view.membership?.unmetRequirementIds).toHaveLength(1);
    expect(
      await executeQuery(domain, listOwnEnvironments, {
        actor: invitee,
        input: {},
      }),
    ).toEqual([
      {
        id: environmentId,
        type: "hidden",
        name: "Hemmelig klubb",
        membershipState: "pending",
        roles: [],
      },
    ]);

    // An invited user cannot join around the invitation or apply instead.
    await expect(join(invitee, environmentId)).rejects.toMatchObject({
      code: "conflict",
    });

    await output(acceptInvitation, invitee, {
      environmentId,
      answers: await answersFor(invitee, environmentId),
    });
    expect((await read(invitee, environmentId)).membership?.state).toBe(
      "active",
    );
    expect(
      (await membershipEvents(membershipId)).map((event) => event.event_type),
    ).toEqual([
      "environment_membership.invited",
      "environment_membership.activated",
    ]);
  });

  it("lose visibility when an invitation is declined or withdrawn", async () => {
    const { owner, environmentId } = await hidden();
    const decliner = await user();
    const withdrawn = await user();

    await output(inviteMember, owner, {
      environmentId,
      userId: decliner.userId,
    });
    const { membershipId } = await output(inviteMember, owner, {
      environmentId,
      userId: withdrawn.userId,
    });

    await output(leaveEnvironment, decliner, { environmentId });
    await output(withdrawInvitation, owner, { environmentId, membershipId });

    for (const actor of [decliner, withdrawn]) {
      await expect(read(actor, environmentId)).rejects.toMatchObject({
        code: "not_found",
      });
    }
  });

  it("only invite registered accounts that are not already involved", async () => {
    const { owner, environmentId } = await hidden();
    const pending = await resolveUserActor(domain, testIdentity());
    const invitee = await user();

    for (const userId of [pending!.userId, randomUUID()]) {
      await expect(
        run(inviteMember, owner, { environmentId, userId }),
      ).rejects.toMatchObject({ code: "not_found" });
    }

    const input = { environmentId, userId: invitee.userId };
    const key = randomUUID();
    const [first, retry] = await Promise.all([
      run(inviteMember, owner, input, key),
      run(inviteMember, owner, input, key),
    ]);
    expect(retry.output).toEqual(first.output);
    await expect(run(inviteMember, owner, input)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      run(inviteMember, owner, { environmentId, userId: owner.userId }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("are stopped by a block in either direction without revealing it", async () => {
    const { owner, environmentId } = await hidden();
    const blockedByOwner = await user();
    const blockingOwner = await user();
    const unrelated = await user();
    await output(blockUser, owner, { userId: blockedByOwner.userId });
    await output(blockUser, blockingOwner, { userId: owner.userId });

    // Both directions give the same answer as an account that does not exist.
    for (const userId of [
      blockedByOwner.userId,
      blockingOwner.userId,
      randomUUID(),
    ]) {
      await expect(
        run(inviteMember, owner, { environmentId, userId }),
      ).rejects.toEqual(
        expect.objectContaining({
          code: "not_found",
          message: "No such account",
        }),
      );
    }
    expect(await read(blockingOwner, environmentId).catch((e) => e.code)).toBe(
      "not_found",
    );

    // Without a block, and once it is lifted, the invitation goes through.
    await expect(
      output(inviteMember, owner, { environmentId, userId: unrelated.userId }),
    ).resolves.toMatchObject({ state: "pending" });
    await output(liftUserBlock, owner, { userId: blockedByOwner.userId });
    await expect(
      output(inviteMember, owner, {
        environmentId,
        userId: blockedByOwner.userId,
      }),
    ).resolves.toMatchObject({ state: "pending" });
  });

  it("keep an existing invitation and membership when a block comes later", async () => {
    const { owner, environmentId } = await hidden();
    const member = await user();
    const invitee = await user();
    await output(inviteMember, owner, { environmentId, userId: member.userId });
    await output(acceptInvitation, member, {
      environmentId,
      answers: await answersFor(member, environmentId),
    });
    await output(inviteMember, owner, {
      environmentId,
      userId: invitee.userId,
    });

    await output(blockUser, member, { userId: owner.userId });
    await output(blockUser, owner, { userId: invitee.userId });

    expect((await read(member, environmentId)).membership?.state).toBe(
      "active",
    );
    await expect(
      output(acceptInvitation, invitee, {
        environmentId,
        answers: await answersFor(invitee, environmentId),
      }),
    ).resolves.toMatchObject({ state: "active" });
  });

  it("serialize an invitation against a block placed at the same time", async () => {
    const { owner, environmentId } = await hidden();
    const other = await user();

    const [invited] = await Promise.allSettled([
      run(inviteMember, owner, { environmentId, userId: other.userId }),
      run(blockUser, other, { userId: owner.userId }),
    ]);
    const { memberships: rows } = await memberships(owner, environmentId);
    const invitation = rows.find((row) => row.userId === other.userId);

    // Either the invitation came first and stands, or the block stopped it.
    if (invited.status === "fulfilled") {
      expect(invitation?.state).toBe("pending");
    } else {
      expect(invited.reason).toMatchObject({ code: "not_found" });
      expect(invitation).toBeUndefined();
    }
  });

  it("let members see the environment but not administer it", async () => {
    const { owner, environmentId } = await hidden();
    const member = await user();
    await output(inviteMember, owner, { environmentId, userId: member.userId });
    await output(acceptInvitation, member, {
      environmentId,
      answers: await answersFor(member, environmentId),
    });

    expect((await read(member, environmentId)).roles).toEqual([]);
    await expect(memberships(member, environmentId)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      run(inviteMember, member, {
        environmentId,
        userId: (await user()).userId,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("open environments take no invitations", () => {
  it("refuses an invitation where anyone may join", async () => {
    const owner = await user();
    const environmentId = await environment(owner);

    await expect(
      run(inviteMember, owner, {
        environmentId,
        userId: (await user()).userId,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("environment details", () => {
  it("are changed by administrators based on the latest version", async () => {
    const owner = await user();
    const member = await user();
    const environmentId = await environment(owner);
    await join(member, environmentId);

    const update = (actor: Actor, expectedVersion: number) =>
      run(updateEnvironmentDetails, actor, {
        environmentId,
        name: "Nytt navn",
        audience: "Beboere",
        expectedVersion,
      });

    await expect(update(member, 1)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect((await update(owner, 1)).output).toEqual({ version: 2 });
    await expect(update(owner, 1)).rejects.toMatchObject({ code: "conflict" });
    expect(await read(member, environmentId)).toMatchObject({
      name: "Nytt navn",
      audience: "Beboere",
      description: null,
      version: 2,
    });
  });
});

describe("changed requirements for existing members (PS-ENV-006)", () => {
  async function openWithMember(type: "open" | "closed" = "open") {
    const owner = await user();
    const member = await user();
    const environmentId = await environment(owner, {
      type,
      requirements: [rules],
    });
    const { membershipId } = await join(member, environmentId);
    if (type === "closed") {
      await output(approveMembership, owner, { environmentId, membershipId });
    }

    return { owner, member, environmentId, membershipId };
  }

  it("lets only one of two concurrent changes based on the same revision win", async () => {
    const { owner, environmentId } = await openWithMember();

    const { requirementsRevision } = await read(owner, environmentId);
    const results = await Promise.allSettled(
      [[rules, apartment], [apartment]].map((requirements) =>
        run(updateRequirements, owner, {
          environmentId,
          requirements,
          expectedRevision: requirementsRevision,
        }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "conflict" },
    });
  });

  it("gives a transition period, after which the member becomes passive", async () => {
    const start = clock;
    const { owner, member, environmentId, membershipId } =
      await openWithMember();
    const [kept] = (await read(owner, environmentId)).requirements;
    const other = await user();
    await join(other, environmentId);

    await setRequirements(owner, environmentId, [{ id: kept!.id }, apartment]);

    const deadline = later(requirementTransitionDays).toISOString();
    expect((await read(member, environmentId)).membership).toMatchObject({
      state: "active",
      transitionDeadline: deadline,
      unmetRequirementIds: [expect.any(String)],
    });
    // The founder wrote the original requirements and is held to new ones too.
    expect((await read(owner, environmentId)).membership).toMatchObject({
      transitionDeadline: deadline,
    });

    // One member meets the new requirement in time.
    await output(submitAnswers, other, {
      environmentId,
      answers: await answersFor(other, environmentId),
    });
    expect((await read(other, environmentId)).membership).toMatchObject({
      state: "active",
      transitionDeadline: null,
      unmetRequirementIds: [],
    });

    // Still active the day before the deadline…
    clock = later(requirementTransitionDays - 1);
    expect((await read(member, environmentId)).membership?.state).toBe(
      "active",
    );

    // …and passive after it, before and after the job has recorded it.
    clock = later(2);
    expect((await read(member, environmentId)).membership).toMatchObject({
      state: "passive",
      passiveReason: "requirements_not_met",
    });
    const job = systemActor(membershipTransitionProcess);
    const { output: firstRun } = await executeCommand(
      domain,
      expireTransitions,
      { actor: job, input: {} },
    );
    expect(firstRun.passivated).toBeGreaterThanOrEqual(2);
    expect(
      (await membershipEvents(membershipId)).map((event) => event.event_type),
    ).toEqual([
      "environment_membership.activated",
      "environment_membership.transition_started",
      "environment_membership.passivated",
    ]);
    expect((await read(other, environmentId)).membership?.state).toBe("active");

    // A passive member keeps the membership, is not barred, and can meet the
    // requirements that apply now to become active again.
    expect((await join(member, environmentId)).state).toBe("active");
    expect(
      (await membershipEvents(membershipId)).at(-1)?.payload,
    ).toMatchObject({ via: "reactivation" });

    clock = start;
  });

  it("ends the transition when the new requirement is removed again", async () => {
    const { owner, member, environmentId, membershipId } =
      await openWithMember();
    const [kept] = (await read(owner, environmentId)).requirements;

    await setRequirements(owner, environmentId, [{ id: kept!.id }, apartment]);
    await setRequirements(owner, environmentId, [{ id: kept!.id }]);

    expect((await read(member, environmentId)).membership).toMatchObject({
      state: "active",
      transitionDeadline: null,
    });
    expect(
      (await membershipEvents(membershipId)).map((event) => event.event_type),
    ).toEqual([
      "environment_membership.activated",
      "environment_membership.transition_started",
      "environment_membership.transition_completed",
    ]);
  });

  it("does not change anything when the list is unchanged", async () => {
    const { owner, environmentId } = await openWithMember();
    const before = await read(owner, environmentId);

    expect(
      await setRequirements(
        owner,
        environmentId,
        before.requirements.map(({ id }) => ({ id })),
      ),
    ).toEqual({ revision: before.requirementsRevision });
  });

  it("reactivates a passive member of a closed environment only on approval", async () => {
    const start = clock;
    const { owner, member, environmentId, membershipId } =
      await openWithMember("closed");
    await setRequirements(owner, environmentId, [apartment]);
    // The founder answers in time; the member does not.
    await output(submitAnswers, owner, {
      environmentId,
      answers: await answersFor(owner, environmentId),
    });
    clock = later(requirementTransitionDays + 1);

    expect(await join(member, environmentId)).toEqual({
      membershipId,
      state: "passive",
    });
    expect((await read(member, environmentId)).membership).toMatchObject({
      state: "passive",
      reviewStage: "submitted",
    });
    await expect(join(member, environmentId)).rejects.toMatchObject({
      code: "conflict",
    });

    await output(rejectMembership, owner, { environmentId, membershipId });
    expect((await read(member, environmentId)).membership).toMatchObject({
      state: "passive",
      reviewStage: null,
    });

    await join(member, environmentId);
    expect(
      await output(approveMembership, owner, { environmentId, membershipId }),
    ).toEqual({ membershipId, state: "active" });

    clock = start;
  });

  it("never lets a passive administrator approve their own reactivation", async () => {
    const start = clock;
    const owner = await user();
    const environmentId = await environment(owner, { type: "closed" });
    await setRequirements(owner, environmentId, [rules]);
    clock = later(requirementTransitionDays + 1);

    const { membershipId } = await join(owner, environmentId);
    await expect(
      run(approveMembership, owner, { environmentId, membershipId }),
    ).rejects.toMatchObject({ code: "forbidden" });

    clock = start;
  });
});

describe("events", () => {
  it("never carry names, texts or answers", async () => {
    const owner = await user();
    const environmentId = await environment(owner, {
      name: "Unikt navn qzx",
      description: "Beskrivelse qzx",
      type: "closed",
      requirements: [{ kind: "information", text: "Spørsmål qzx" }],
    });
    const applicant = await user();
    await output(joinEnvironment, applicant, {
      environmentId,
      answers: [
        {
          requirementId: (await read(applicant, environmentId)).requirements[0]!
            .id,
          answer: "Svar qzx",
        },
      ],
    });

    const payloads = await db
      .selectFrom("app.audit_events")
      .select("payload")
      .where("occurred_at", ">=", new Date(Date.now() - 60_000))
      .execute();
    expect(JSON.stringify(payloads)).not.toContain("qzx");
  });
});

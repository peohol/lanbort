import { randomUUID } from "node:crypto";
import type { EnvironmentType } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { type Actor, systemActor, type UserActor } from "../actor";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { startEnvironmentWindDown } from "./continuity-commands";
import { createEnvironment } from "./environment-commands";
import {
  acceptInvitation,
  approveMembership,
  inviteMember,
  joinEnvironment,
  submitAnswers,
} from "./membership-commands";
import { typeChangeProcess } from "./policies";
import { typeChangeDays } from "./privacy";
import {
  getEnvironment,
  listMemberships,
  listOwnEnvironments,
  listRoles,
} from "./queries";
import { acceptRoleInvitation, inviteAdministrator } from "./role-commands";
import {
  changeEnvironmentType,
  concludeTypeChanges,
  respondToTypeChange,
  withdrawTypeChange,
} from "./type-change-commands";

const db = connectTestDatabase();
afterAll(() => db.destroy());

// Tests move the clock past proposal deadlines.
let clock = new Date();
const domain: DomainContext = {
  db,
  consumers: new ConsumerRegistry(),
  clock: () => clock,
};
const tick = () => {
  clock = new Date(clock.getTime() + 1);
  return domain;
};
const passDays = (days: number) => {
  clock = new Date(clock.getTime() + days * 86_400_000 + 1000);
};

/** The actor after a fresh e-mail code, for owner actions that need one. */
const fresh = (actor: UserActor): UserActor => ({
  ...actor,
  authentication: {
    ...actor.authentication,
    methods: [{ method: "otp", at: clock }],
  },
});

const run = <I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: unknown,
  idempotencyKey: string = randomUUID(),
) =>
  executeCommand(tick(), command, {
    actor: actor.kind === "user" ? fresh(actor) : actor,
    input,
    idempotencyKey,
  });

const output = async <I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: unknown,
) => (await run(command, actor, input)).output;

const conclude = () =>
  executeCommand(tick(), concludeTypeChanges, {
    actor: systemActor(typeChangeProcess),
    input: {},
  }).then((result) => result.output);

const user = async () => (await registerTestUser(domain)).actor;

const read = (actor: Actor, environmentId: string) =>
  executeQuery(domain, getEnvironment, { actor, input: { environmentId } });

const memberIds = async (actor: Actor, environmentId: string) =>
  (
    await executeQuery(domain, listMemberships, {
      actor,
      input: { environmentId },
    })
  ).memberships.map((membership) => membership.userId);

const holderIds = async (actor: Actor, environmentId: string) =>
  (
    await executeQuery(domain, listRoles, { actor, input: { environmentId } })
  ).holders.map((holder) => holder.userId);

async function environment(owner: UserActor, type: EnvironmentType) {
  return (
    await output(createEnvironment, owner, { name: "Borettslaget", type })
  ).environmentId;
}

/** A member who joined an open environment or accepted an invitation. */
async function member(environmentId: string, owner: UserActor) {
  const actor = await user();
  const { type } = await read(owner, environmentId);

  if (type === "open") {
    await output(joinEnvironment, actor, { environmentId, answers: [] });
  } else {
    await output(inviteMember, owner, { environmentId, userId: actor.userId });
    await output(acceptInvitation, actor, { environmentId, answers: [] });
  }

  return actor;
}

async function makeAdministrator(
  environmentId: string,
  owner: UserActor,
  actor: UserActor,
) {
  const { invitationId } = await output(inviteAdministrator, owner, {
    environmentId,
    userId: actor.userId,
  });
  await output(acceptRoleInvitation, actor, { environmentId, invitationId });
}

const changeType = (
  actor: UserActor,
  environmentId: string,
  expectedType: EnvironmentType,
  type: EnvironmentType,
) =>
  output(changeEnvironmentType, actor, { environmentId, expectedType, type });

const respond = (
  actor: UserActor,
  environmentId: string,
  proposalId: string,
  support: boolean,
) => output(respondToTypeChange, actor, { environmentId, proposalId, support });

async function stateOf(actor: UserActor, environmentId: string) {
  const { membership } = await read(actor, environmentId);
  return { state: membership?.state, passiveReason: membership?.passiveReason };
}

async function proposalOutcome(proposalId: string) {
  return await db
    .selectFrom("app.environment_type_proposals")
    .select(["outcome", "eligible_count", "support_count"])
    .where("id", "=", proposalId)
    .executeTakeFirstOrThrow();
}

async function history(environmentId: string) {
  return (
    await db
      .selectFrom("app.environment_type_periods")
      .select("type")
      .where("environment_id", "=", environmentId)
      .orderBy("started_at")
      .execute()
  ).map((row) => row.type);
}

async function typeEvents(environmentId: string) {
  return (
    await db
      .selectFrom("app.audit_events")
      .select("event_type")
      .where("resource_type", "=", "environment")
      .where("resource_id", "=", environmentId)
      .where("event_type", "like", "environment.type%")
      .orderBy("position")
      .execute()
  ).map((row) => row.event_type);
}

describe("stricter types (PS-ENV-007)", () => {
  it("apply at once and keep members and invitations", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "open");
    const existing = await member(environmentId, owner);
    const outsider = await user();

    expect(await changeType(owner, environmentId, "open", "closed")).toEqual({
      type: "closed",
      proposal: null,
    });
    expect(await read(outsider, environmentId)).toMatchObject({
      type: "closed",
      membership: null,
    });

    const applicant = await user();
    await output(joinEnvironment, applicant, { environmentId, answers: [] });
    const invited = await user();
    await output(inviteMember, owner, {
      environmentId,
      userId: invited.userId,
    });

    await changeType(owner, environmentId, "closed", "hidden");

    // Hidden at once: outsiders and the old application get nothing.
    for (const actor of [outsider, applicant]) {
      await expect(read(actor, environmentId)).rejects.toMatchObject({
        code: "not_found",
      });
      expect(
        await executeQuery(domain, listOwnEnvironments, { actor, input: {} }),
      ).toEqual([]);
    }
    expect(await stateOf(existing, environmentId)).toEqual({
      state: "active",
      passiveReason: null,
    });
    // An administrator's account-bound invitation is what hidden requires.
    expect(await stateOf(invited, environmentId)).toMatchObject({
      state: "pending",
    });
    expect(await history(environmentId)).toEqual(["open", "closed", "hidden"]);

    // The former applicant can only come in through a new invitation.
    await output(inviteMember, owner, {
      environmentId,
      userId: applicant.userId,
    });
    await output(acceptInvitation, applicant, { environmentId, answers: [] });
    expect(await stateOf(applicant, environmentId)).toMatchObject({
      state: "active",
    });
    expect(await typeEvents(environmentId)).toEqual([
      "environment.type_changed",
      "environment.type_changed",
    ]);
  });

  it("refuse an outdated type, the same type and hidden → open", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");

    for (const [expectedType, type] of [
      ["closed", "open"],
      ["hidden", "hidden"],
      ["hidden", "open"],
    ] as const) {
      await expect(
        run(changeEnvironmentType, owner, {
          environmentId,
          expectedType,
          type,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
    }
    expect(await history(environmentId)).toEqual(["hidden"]);
  });

  it("are only for administrators", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const ordinary = await member(environmentId, owner);
    const outsider = await user();
    const input = { environmentId, expectedType: "hidden", type: "closed" };

    await expect(
      run(changeEnvironmentType, ordinary, input),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      run(changeEnvironmentType, outsider, input),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("closed → open (PS-ENV-008)", () => {
  it("keeps only members who accept active; the rest become passive", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const accepting = await member(environmentId, owner);
    const declining = await member(environmentId, owner);
    const silent = await member(environmentId, owner);
    const applicant = await user();
    await output(joinEnvironment, applicant, { environmentId, answers: [] });
    const outsider = await user();

    const { type, proposal } = await changeType(
      owner,
      environmentId,
      "closed",
      "open",
    );
    expect(type).toBe("closed");
    expect(proposal).toMatchObject({ process: "consent" });
    const proposalId = proposal!.id;

    await respond(owner, environmentId, proposalId, true);
    await respond(accepting, environmentId, proposalId, true);
    await respond(declining, environmentId, proposalId, true);
    await respond(declining, environmentId, proposalId, false);

    // Each member sees the proposal and only their own answer.
    expect((await read(accepting, environmentId)).typeChange).toEqual({
      id: proposalId,
      toType: "open",
      process: "consent",
      deadline: proposal!.deadline,
      yourResponse: true,
    });
    expect((await read(silent, environmentId)).typeChange).toMatchObject({
      yourResponse: null,
    });
    expect((await read(applicant, environmentId)).typeChange).toBeNull();
    expect((await read(outsider, environmentId)).typeChange).toBeNull();

    // Nothing changes before the deadline.
    passDays(typeChangeDays.consent - 1);
    await conclude();
    expect((await read(outsider, environmentId)).type).toBe("closed");

    passDays(1);
    await conclude();
    expect(await proposalOutcome(proposalId)).toEqual({
      outcome: "adopted",
      eligible_count: 4,
      support_count: 2,
    });
    expect((await read(outsider, environmentId)).type).toBe("open");
    for (const actor of [owner, accepting]) {
      expect(await stateOf(actor, environmentId)).toEqual({
        state: "active",
        passiveReason: null,
      });
    }
    for (const actor of [declining, silent]) {
      expect(await stateOf(actor, environmentId)).toEqual({
        state: "passive",
        passiveReason: "type_change_not_accepted",
      });
    }
    await expect(
      run(respondToTypeChange, accepting, {
        environmentId,
        proposalId,
        support: false,
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    // The applicant is not reviewed any more and must confirm.
    expect((await read(applicant, environmentId)).membership).toMatchObject({
      state: "pending",
      reviewStage: "confirmation_required",
    });
    const { id: membershipId } = (await read(applicant, environmentId))
      .membership!;
    await expect(
      run(approveMembership, owner, { environmentId, membershipId }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(submitAnswers, applicant, { environmentId, answers: [] }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      await output(joinEnvironment, applicant, { environmentId, answers: [] }),
    ).toEqual({ membershipId, state: "active" });

    // A passive member accepts the new type later by joining again, even
    // after the environment has become stricter once more.
    await changeType(owner, environmentId, "open", "hidden");
    expect(
      await output(joinEnvironment, silent, { environmentId, answers: [] }),
    ).toMatchObject({ state: "active" });
    expect(await history(environmentId)).toEqual(["closed", "open", "hidden"]);
  });
});

describe("hidden → closed (PS-ENV-008)", () => {
  async function hiddenEnvironment() {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const members = [
      await member(environmentId, owner),
      await member(environmentId, owner),
      await member(environmentId, owner),
    ] as const;
    const { proposal } = await changeType(
      owner,
      environmentId,
      "hidden",
      "closed",
    );
    expect(proposal).toMatchObject({ process: "vote" });

    return { owner, environmentId, members, proposalId: proposal!.id };
  }

  it("stays hidden without 2/3 of all active members; silence is not support", async () => {
    const { owner, environmentId, members, proposalId } =
      await hiddenEnvironment();
    const [a, b] = members;
    const outsider = await user();

    await respond(owner, environmentId, proposalId, true);
    await respond(a, environmentId, proposalId, true);
    await respond(b, environmentId, proposalId, false);
    passDays(typeChangeDays.vote);
    await conclude();

    expect(await proposalOutcome(proposalId)).toEqual({
      outcome: "rejected",
      eligible_count: 4,
      support_count: 2,
    });
    await expect(read(outsider, environmentId)).rejects.toMatchObject({
      code: "not_found",
    });
    for (const actor of [owner, ...members]) {
      expect((await stateOf(actor, environmentId)).state).toBe("active");
    }
  });

  it("becomes closed with 2/3; everyone who did not vote for it is passive", async () => {
    const { owner, environmentId, members, proposalId } =
      await hiddenEnvironment();
    const [a, b, silent] = members;
    const outsider = await user();

    await respond(owner, environmentId, proposalId, true);
    await respond(a, environmentId, proposalId, true);
    // Only the latest answer counts.
    await respond(b, environmentId, proposalId, false);
    await respond(b, environmentId, proposalId, true);
    passDays(typeChangeDays.vote);
    await conclude();

    expect(await proposalOutcome(proposalId)).toEqual({
      outcome: "adopted",
      eligible_count: 4,
      support_count: 3,
    });
    expect(await read(outsider, environmentId)).toMatchObject({
      type: "closed",
      membership: null,
    });
    expect(await stateOf(silent, environmentId)).toEqual({
      state: "passive",
      passiveReason: "type_change_not_accepted",
    });
    expect(await typeEvents(environmentId)).toEqual([
      "environment.type_change_proposed",
      "environment.type_change_closed",
      "environment.type_changed",
    ]);
  });
});

describe("historical privacy (PS-ENV-009)", () => {
  it("never shows passive members of a stricter context to later members", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const supporter = await member(environmentId, owner);
    const keeper = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, keeper);
    const { proposal } = await changeType(
      owner,
      environmentId,
      "hidden",
      "closed",
    );
    await respond(owner, environmentId, proposal!.id, true);
    await respond(supporter, environmentId, proposal!.id, true);
    passDays(typeChangeDays.vote);
    await conclude();
    expect((await stateOf(keeper, environmentId)).state).toBe("passive");

    // A new member joins the closed environment and becomes administrator.
    const newcomer = await user();
    const { membershipId } = await output(joinEnvironment, newcomer, {
      environmentId,
      answers: [],
    });
    await output(approveMembership, owner, { environmentId, membershipId });
    await makeAdministrator(environmentId, owner, newcomer);

    // Those who were there before still see the hidden-era member.
    expect(await memberIds(owner, environmentId)).toContain(keeper.userId);
    expect(await holderIds(owner, environmentId)).toContain(keeper.userId);
    // The newcomer does not, not even as administrator.
    expect(await memberIds(newcomer, environmentId)).not.toContain(
      keeper.userId,
    );
    expect(await holderIds(newcomer, environmentId)).not.toContain(
      keeper.userId,
    );
    expect(await memberIds(newcomer, environmentId)).toEqual(
      expect.arrayContaining([owner.userId, supporter.userId, newcomer.userId]),
    );

    // Once the member accepts the new type, the ordinary rules apply.
    await output(joinEnvironment, keeper, { environmentId, answers: [] });
    expect(await memberIds(newcomer, environmentId)).toContain(keeper.userId);
    expect(await holderIds(newcomer, environmentId)).toContain(keeper.userId);
  });

  it("keeps members who did not accept closed → open from members who joined later", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const keeper = await member(environmentId, owner);
    const { proposal } = await changeType(
      owner,
      environmentId,
      "closed",
      "open",
    );
    await respond(owner, environmentId, proposal!.id, true);
    passDays(typeChangeDays.consent);
    await conclude();

    const newcomer = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, newcomer);

    expect(await memberIds(owner, environmentId)).toContain(keeper.userId);
    expect(await memberIds(newcomer, environmentId)).not.toContain(
      keeper.userId,
    );
  });
});

describe("proposals", () => {
  it("one at a time; any administrator withdraws; a stricter type lapses it", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const coAdministrator = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, coAdministrator);
    const ordinary = await member(environmentId, owner);

    const first = (await changeType(owner, environmentId, "closed", "open"))
      .proposal!;
    await expect(
      run(changeEnvironmentType, coAdministrator, {
        environmentId,
        expectedType: "closed",
        type: "open",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(withdrawTypeChange, ordinary, {
        environmentId,
        proposalId: first.id,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await output(withdrawTypeChange, coAdministrator, {
      environmentId,
      proposalId: first.id,
    });
    expect((await proposalOutcome(first.id)).outcome).toBe("withdrawn");

    const second = (await changeType(owner, environmentId, "closed", "open"))
      .proposal!;
    await changeType(owner, environmentId, "closed", "hidden");
    expect((await proposalOutcome(second.id)).outcome).toBe("lapsed");
    expect(await history(environmentId)).toEqual(["closed", "hidden"]);
  });

  it("are answered by active members only, before the deadline", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const applicant = await user();
    await output(joinEnvironment, applicant, { environmentId, answers: [] });
    const outsider = await user();
    const proposalId = (
      await changeType(owner, environmentId, "closed", "open")
    ).proposal!.id;
    const input = { environmentId, proposalId, support: true };

    await expect(
      run(respondToTypeChange, applicant, input),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      run(respondToTypeChange, outsider, input),
    ).rejects.toMatchObject({ code: "not_found" });

    passDays(typeChangeDays.consent);
    await expect(run(respondToTypeChange, owner, input)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      run(withdrawTypeChange, owner, { environmentId, proposalId }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("lapse when the environment winds down", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const proposalId = (
      await changeType(owner, environmentId, "hidden", "closed")
    ).proposal!.id;
    await respond(owner, environmentId, proposalId, true);
    await output(startEnvironmentWindDown, owner, { environmentId });

    // A winding-down environment starts nothing new.
    await expect(
      run(changeEnvironmentType, owner, {
        environmentId,
        expectedType: "hidden",
        type: "closed",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    passDays(typeChangeDays.vote);
    await conclude();
    expect((await proposalOutcome(proposalId)).outcome).toBe("lapsed");
    expect(await history(environmentId)).toEqual(["hidden"]);
  });
});

describe("concurrency and retries", () => {
  it("lets only one of two simultaneous proposals through", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const coAdministrator = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, coAdministrator);
    const input = { environmentId, expectedType: "hidden", type: "closed" };

    const results = await Promise.allSettled([
      run(changeEnvironmentType, owner, input),
      run(changeEnvironmentType, coAdministrator, input),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "conflict" } });
  });

  it("decides a proposal once when jobs run at the same time", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const proposalId = (
      await changeType(owner, environmentId, "closed", "open")
    ).proposal!.id;
    await respond(owner, environmentId, proposalId, true);
    passDays(typeChangeDays.consent);

    await Promise.all([conclude(), conclude(), conclude()]);
    // A job that skipped the busy environment, or ran after, changes nothing.
    await conclude();

    expect(await history(environmentId)).toEqual(["closed", "open"]);
    expect(await typeEvents(environmentId)).toEqual([
      "environment.type_change_proposed",
      "environment.type_change_closed",
      "environment.type_changed",
    ]);
  });

  it("keeps a stricter change and an answer to the lapsing proposal consistent", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const voter = await member(environmentId, owner);
    const proposalId = (
      await changeType(owner, environmentId, "closed", "open")
    ).proposal!.id;

    const [, answer] = await Promise.allSettled([
      run(changeEnvironmentType, owner, {
        environmentId,
        expectedType: "closed",
        type: "hidden",
      }),
      run(respondToTypeChange, voter, {
        environmentId,
        proposalId,
        support: true,
      }),
    ]);

    // Either the answer came first, or it found the proposal gone.
    if (answer.status === "rejected") {
      expect(answer.reason).toMatchObject({ code: "conflict" });
    }
    expect((await proposalOutcome(proposalId)).outcome).toBe("lapsed");
    expect((await read(voter, environmentId)).type).toBe("hidden");
  });

  it("returns the first result when a change is retried", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "open");
    const key = randomUUID();
    const input = { environmentId, expectedType: "open", type: "hidden" };

    const first = await run(changeEnvironmentType, owner, input, key);
    const retry = await run(changeEnvironmentType, owner, input, key);

    expect(retry.output).toEqual(first.output);
    expect(await history(environmentId)).toEqual(["open", "hidden"]);
  });
});

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
import { acceptFriendRequest, sendFriendRequest } from "../social/commands";
import { startTestVote, testVoteDays } from "../testing/type-changes";
import {
  releaseDepartedUser,
  startEnvironmentWindDown,
} from "./continuity-commands";
import {
  createEnvironment,
  liftConcealedRestrictions,
} from "./environment-commands";
import {
  acceptInvitation,
  approveMembership,
  inviteMember,
  joinEnvironment,
  leaveEnvironment,
  rejectMembership,
  submitAnswers,
  withdrawInvitation,
} from "./membership-commands";
import { accountLifecycleProcess, typeChangeProcess } from "./policies";
import { typeChangeDays } from "./privacy";
import {
  getEnvironment,
  listMemberships,
  listOwnEnvironments,
  listRoles,
} from "./queries";
import {
  acceptRoleInvitation,
  inviteAdministrator,
  offerOwnership,
  resignAdministrator,
} from "./role-commands";
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

const proposeVote = (owner: UserActor, environmentId: string) =>
  startTestVote(db, {
    environmentId,
    proposedByUserId: owner.userId,
    at: clock,
  });

async function stateOf(actor: UserActor, environmentId: string) {
  const { membership } = await read(actor, environmentId);
  return { state: membership?.state, passiveReason: membership?.passiveReason };
}

/** Why the user's latest membership ended, or null while it lasts. */
async function endOf(actor: UserActor, environmentId: string) {
  const row = await db
    .selectFrom("app.environment_memberships")
    .select("end_reason")
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", actor.userId)
    .orderBy("created_at", "desc")
    .executeTakeFirstOrThrow();
  return row.end_reason;
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
      .orderBy("position")
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

  it("start a hidden → closed vote with a week to answer (OD-0012)", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const voter = await member(environmentId, owner);

    const { type, proposal } = await changeType(
      owner,
      environmentId,
      "hidden",
      "closed",
    );
    expect(type).toBe("hidden");
    expect(proposal).toMatchObject({ process: "vote" });
    expect(new Date(proposal!.deadline).getTime() - clock.getTime()).toBe(
      typeChangeDays.vote * 86_400_000,
    );
    expect((await read(voter, environmentId)).typeChange).toMatchObject({
      id: proposal!.id,
      toType: "closed",
      process: "vote",
      yourResponse: null,
    });
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

  it("keeps a passive administrator listed, but not acting or taking over", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const administrator = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, administrator);
    const { proposal } = await changeType(
      owner,
      environmentId,
      "closed",
      "open",
    );
    await respond(owner, environmentId, proposal!.id, true);
    passDays(typeChangeDays.consent);
    await conclude();

    const { holders } = await executeQuery(domain, listRoles, {
      actor: owner,
      input: { environmentId },
    });
    expect(
      Object.fromEntries(
        holders.map((holder) => [holder.userId, holder.canAct]),
      ),
    ).toEqual({ [owner.userId]: true, [administrator.userId]: false });
    await expect(
      run(offerOwnership, owner, {
        environmentId,
        userId: administrator.userId,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    // With the owner still there, the passive administrator may resign.
    expect((await read(administrator, environmentId)).continuity).toMatchObject(
      { mayResign: true },
    );
    expect((await read(owner, environmentId)).continuity).toMatchObject({
      mayResign: false,
    });

    // Once the owner is gone, the passive administrator is the last one and
    // is neither offered resigning nor allowed it.
    await executeCommand(tick(), releaseDepartedUser, {
      actor: systemActor(accountLifecycleProcess),
      input: { userId: owner.userId },
    });
    expect((await read(administrator, environmentId)).continuity).toMatchObject(
      { mayResign: false },
    );
    await expect(
      run(resignAdministrator, administrator, { environmentId }),
    ).rejects.toMatchObject({ code: "conflict" });
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
    const proposalId = await proposeVote(owner, environmentId);

    return { owner, environmentId, members, proposalId };
  }

  it("stays hidden without 2/3 of all active members; silence is not support", async () => {
    const { owner, environmentId, members, proposalId } =
      await hiddenEnvironment();
    const [a, b] = members;
    const outsider = await user();

    await respond(owner, environmentId, proposalId, true);
    await respond(a, environmentId, proposalId, true);
    await respond(b, environmentId, proposalId, false);
    passDays(testVoteDays);
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

  it("becomes closed with 2/3; everyone who did not vote for it is removed", async () => {
    const { owner, environmentId, members, proposalId } =
      await hiddenEnvironment();
    const [a, b, silent] = members;
    const outsider = await user();

    await respond(owner, environmentId, proposalId, true);
    await respond(a, environmentId, proposalId, true);
    // Only the latest answer counts.
    await respond(b, environmentId, proposalId, false);
    await respond(b, environmentId, proposalId, true);
    passDays(testVoteDays);
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
    expect(await endOf(silent, environmentId)).toBe("type_change_not_accepted");
    expect((await read(silent, environmentId)).membership).toBeNull();
    for (const actor of [owner, a, b]) {
      expect((await stateOf(actor, environmentId)).state).toBe("active");
    }
    expect(await typeEvents(environmentId)).toEqual([
      "environment.type_change_closed",
      "environment.type_changed",
    ]);
  });
});

describe("hidden → closed at exactly 2/3", () => {
  it("passes with 2 of 3 active members, counted at the deadline", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const supporter = await member(environmentId, owner);
    const leaver = await member(environmentId, owner);
    const proposalId = await proposeVote(owner, environmentId);
    await respond(owner, environmentId, proposalId, true);
    await respond(supporter, environmentId, proposalId, true);
    // A member who joins during the vote is a voter too; one who leaves
    // no longer counts.
    const latecomer = await member(environmentId, owner);
    await output(leaveEnvironment, leaver, { environmentId });

    passDays(testVoteDays);
    await conclude();

    expect(await proposalOutcome(proposalId)).toEqual({
      outcome: "adopted",
      eligible_count: 3,
      support_count: 2,
    });
    expect(await endOf(latecomer, environmentId)).toBe(
      "type_change_not_accepted",
    );
  });
});

describe("hidden invitations (PS-ENV-010)", () => {
  it("belong to the environment and outlive the administrator who sent them", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const sender = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, sender);
    const departing = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, departing);
    const ordinary = await member(environmentId, owner);
    const [kept, afterDeparture, withdrawn, bystander] = [
      await user(),
      await user(),
      await user(),
      await user(),
    ];

    // Only administrators invite, and only to an existing account.
    await expect(
      run(inviteMember, ordinary, { environmentId, userId: bystander.userId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      run(inviteMember, owner, { environmentId, userId: randomUUID() }),
    ).rejects.toMatchObject({ code: "not_found" });

    for (const invitee of [kept, withdrawn]) {
      await output(inviteMember, sender, {
        environmentId,
        userId: invitee.userId,
      });
    }
    await output(inviteMember, departing, {
      environmentId,
      userId: afterDeparture.userId,
    });

    // The senders stop administering: one resigns and leaves, the other's
    // account goes away.
    await output(resignAdministrator, sender, { environmentId });
    await output(leaveEnvironment, sender, { environmentId });
    await executeCommand(tick(), releaseDepartedUser, {
      actor: systemActor(accountLifecycleProcess),
      input: { userId: departing.userId },
    });

    // Another administrator may still withdraw an invitation they did not send.
    const { id: withdrawnId } = (await read(withdrawn, environmentId))
      .membership!;
    await output(withdrawInvitation, owner, {
      environmentId,
      membershipId: withdrawnId,
    });
    await expect(read(withdrawn, environmentId)).rejects.toMatchObject({
      code: "not_found",
    });

    // Nobody else can use an invitation; the invited accounts still can.
    await expect(
      run(acceptInvitation, bystander, { environmentId, answers: [] }),
    ).rejects.toMatchObject({ code: "not_found" });
    for (const invitee of [kept, afterDeparture]) {
      expect(
        await output(acceptInvitation, invitee, { environmentId, answers: [] }),
      ).toMatchObject({ state: "active" });
    }

    // The history keeps who sent each invitation.
    const sentBy = await db
      .selectFrom("app.environment_memberships")
      .select(["user_id", "invited_by_user_id"])
      .where("environment_id", "=", environmentId)
      .where("user_id", "in", [kept.userId, afterDeparture.userId])
      .execute();
    expect(
      Object.fromEntries(
        sentBy.map((row) => [row.user_id, row.invited_by_user_id]),
      ),
    ).toEqual({
      [kept.userId]: sender.userId,
      [afterDeparture.userId]: departing.userId,
    });
  });
});

describe("historical privacy (PS-ENV-009)", () => {
  it("removes members of a hidden environment who did not accept, roles first", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const supporter = await member(environmentId, owner);
    const keeper = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, keeper);
    const proposalId = await proposeVote(owner, environmentId);
    await respond(owner, environmentId, proposalId, true);
    await respond(supporter, environmentId, proposalId, true);
    passDays(testVoteDays);
    await conclude();

    expect(await endOf(keeper, environmentId)).toBe("type_change_not_accepted");
    expect(
      await db
        .selectFrom("app.environment_role_grants")
        .select("revoke_reason")
        .where("environment_id", "=", environmentId)
        .where("user_id", "=", keeper.userId)
        .execute(),
    ).toEqual([{ revoke_reason: "type_change_not_accepted" }]);

    // Nobody lists the removed member, not those who were there before and
    // not a later member, not even as administrator.
    const newcomer = await user();
    const { membershipId } = await output(joinEnvironment, newcomer, {
      environmentId,
      answers: [],
    });
    await output(approveMembership, owner, { environmentId, membershipId });
    await makeAdministrator(environmentId, owner, newcomer);
    for (const viewer of [owner, newcomer]) {
      expect(await memberIds(viewer, environmentId)).not.toContain(
        keeper.userId,
      );
      expect(await holderIds(viewer, environmentId)).not.toContain(
        keeper.userId,
      );
    }

    // Like anyone who left, the removed member may apply to the closed
    // environment.
    expect(
      await output(joinEnvironment, keeper, { environmentId, answers: [] }),
    ).toMatchObject({ state: "pending" });
  });

  it("hands a removed owner's environment to the continuity rules", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const administrator = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, administrator);
    const voter = await member(environmentId, owner);
    const proposalId = await proposeVote(owner, environmentId);
    await respond(administrator, environmentId, proposalId, true);
    await respond(voter, environmentId, proposalId, true);
    passDays(testVoteDays);
    await conclude();

    expect(await endOf(owner, environmentId)).toBe("type_change_not_accepted");
    expect(await read(administrator, environmentId)).toMatchObject({
      type: "closed",
      continuity: { ownershipVacancy: { claimedByYou: false }, windDown: null },
    });
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

  /**
   * An applicant rejected while the environment was closed, barred or not;
   * then closed → open, a newcomer who becomes administrator, and closed
   * again so that invitations are possible.
   */
  async function rejectedBeforeWeakening(restrict: boolean) {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const applicant = await user();
    const { membershipId } = await output(joinEnvironment, applicant, {
      environmentId,
      answers: [],
    });
    await output(rejectMembership, owner, {
      environmentId,
      membershipId,
      restrict,
    });
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
    await changeType(owner, environmentId, "open", "closed");

    return { owner, environmentId, applicant, newcomer };
  }

  const memberships = (actor: UserActor, environmentId: string) =>
    executeQuery(domain, listMemberships, {
      actor,
      input: { environmentId },
    });

  /** What a view says once ids, names and times are left out. */
  const shape = (value: unknown) =>
    JSON.stringify(value, (key, field: unknown) =>
      key === "realName" ||
      (typeof field === "string" &&
        /^([0-9a-f-]{36}|\d{4}-\d\d-\d\dT.*Z)$/.test(field))
        ? "…"
        : field,
    );

  it("keeps whether anyone was barred under a stricter type from administrators who joined later", async () => {
    const barred = await rejectedBeforeWeakening(true);
    const control = await rejectedBeforeWeakening(false);

    // Those who were there see the bar by name.
    expect(
      (await memberships(barred.owner, barred.environmentId)).restrictions,
    ).toEqual([expect.objectContaining({ userId: barred.applicant.userId })]);
    // A later administrator sees the same as where nobody was barred.
    const later = await memberships(barred.newcomer, barred.environmentId);
    expect(later.restrictions).toEqual([]);
    expect(shape(later)).toBe(
      shape(await memberships(control.newcomer, control.environmentId)),
    );
    expect(JSON.stringify(later)).not.toContain(barred.applicant.userId);
    // The bar still holds for the one barred.
    await expect(
      run(joinEnvironment, barred.applicant, {
        environmentId: barred.environmentId,
        answers: [],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    // Those who were there are told to lift it before inviting.
    await expect(
      run(inviteMember, barred.owner, {
        environmentId: barred.environmentId,
        userId: barred.applicant.userId,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("invites a friend barred under a stricter type as if they never were", async () => {
    const barred = await rejectedBeforeWeakening(true);
    const control = await rejectedBeforeWeakening(false);
    const invited = [];

    for (const scene of [barred, control]) {
      await output(sendFriendRequest, scene.newcomer, {
        userId: scene.applicant.userId,
      });
      await output(acceptFriendRequest, scene.applicant, {
        userId: scene.newcomer.userId,
      });
      invited.push({
        answer: await output(inviteMember, scene.newcomer, {
          environmentId: scene.environmentId,
          userId: scene.applicant.userId,
        }),
        view: shape(await memberships(scene.newcomer, scene.environmentId)),
      });
    }

    const [withBar, withoutBar] = invited;
    expect(shape(withBar?.answer)).toBe(shape(withoutBar?.answer));
    expect(withBar?.view).toBe(withoutBar?.view);
    // The invitation lifted the bar, for those who saw it too.
    expect(await memberships(barred.owner, barred.environmentId)).toMatchObject(
      { restrictions: [] },
    );
    expect(
      (
        await output(acceptInvitation, barred.applicant, {
          environmentId: barred.environmentId,
          answers: [],
        })
      ).state,
    ).toBe("active");
  });

  it("lifts bars from before an administrator came with the same answer whether there are any", async () => {
    const barred = await rejectedBeforeWeakening(true);
    const control = await rejectedBeforeWeakening(false);

    for (const scene of [barred, control]) {
      expect(
        await output(liftConcealedRestrictions, scene.newcomer, {
          environmentId: scene.environmentId,
        }),
      ).toEqual({ lifted: true });
    }
    expect(await memberships(barred.owner, barred.environmentId)).toMatchObject(
      { restrictions: [] },
    );
    expect(
      (
        await output(joinEnvironment, barred.applicant, {
          environmentId: barred.environmentId,
          answers: [],
        })
      ).state,
    ).toBe("pending");
  });

  it("lifts only bars the administrator cannot see", async () => {
    const { owner, environmentId, newcomer } =
      await rejectedBeforeWeakening(true);
    const applicant = await user();
    const { membershipId } = await output(joinEnvironment, applicant, {
      environmentId,
      answers: [],
    });
    await output(rejectMembership, owner, {
      environmentId,
      membershipId,
      restrict: true,
    });

    await output(liftConcealedRestrictions, newcomer, { environmentId });
    expect((await memberships(newcomer, environmentId)).restrictions).toEqual([
      expect.objectContaining({ userId: applicant.userId }),
    ]);
    await output(liftConcealedRestrictions, owner, { environmentId });
    expect((await memberships(owner, environmentId)).restrictions).toEqual([
      expect.objectContaining({ userId: applicant.userId }),
    ]);
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
    const proposalId = await proposeVote(owner, environmentId);
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

    passDays(testVoteDays);
    await conclude();
    expect((await proposalOutcome(proposalId)).outcome).toBe("lapsed");
    expect(await history(environmentId)).toEqual(["hidden"]);
  });
});

describe("concurrency and retries", () => {
  it("lets only one of two simultaneous proposals through", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const coAdministrator = await member(environmentId, owner);
    await makeAdministrator(environmentId, owner, coAdministrator);
    const input = { environmentId, expectedType: "closed", type: "open" };

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

  it("keeps one current answer when a member answers twice at once", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "hidden");
    const voters = [
      await member(environmentId, owner),
      await member(environmentId, owner),
      await member(environmentId, owner),
    ];
    const proposalId = await proposeVote(owner, environmentId);

    // Everyone answers at the same moment, the owner twice and differently.
    await Promise.all([
      respond(owner, environmentId, proposalId, true),
      respond(owner, environmentId, proposalId, false),
      ...voters.map((voter) => respond(voter, environmentId, proposalId, true)),
    ]);

    const current = await db
      .selectFrom("app.environment_type_responses")
      .select(["membership_id", "support"])
      .where("proposal_id", "=", proposalId)
      .where("superseded_at", "is", null)
      .execute();
    expect(current).toHaveLength(4);
    const ownerAnswer = (await read(owner, environmentId)).typeChange!
      .yourResponse;

    passDays(testVoteDays);
    await conclude();
    // Whichever answer of the owner came last decides; 3 of 4 is enough
    // either way, so the outcome itself does not depend on the order.
    expect(await proposalOutcome(proposalId)).toEqual({
      outcome: "adopted",
      eligible_count: 4,
      support_count: ownerAnswer ? 4 : 3,
    });
  });

  it("records an answer once when it is retried", async () => {
    const owner = await user();
    const environmentId = await environment(owner, "closed");
    const proposalId = (
      await changeType(owner, environmentId, "closed", "open")
    ).proposal!.id;
    const key = randomUUID();
    const input = { environmentId, proposalId, support: true };

    await Promise.all([
      run(respondToTypeChange, owner, input, key),
      run(respondToTypeChange, owner, input, key),
    ]).catch(() => undefined);
    await run(respondToTypeChange, owner, input, key);

    const rows = await db
      .selectFrom("app.environment_type_responses")
      .select("id")
      .where("proposal_id", "=", proposalId)
      .execute();
    expect(rows).toHaveLength(1);
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

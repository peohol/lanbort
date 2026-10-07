import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Actor, UserActor } from "../actor";
import { deactivateAccount } from "../account/lifecycle";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import { isDomainError } from "../errors";
import { ConsumerRegistry } from "../outbox/consumer";
import { blockUser, liftUserBlock } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { createEnvironment, updateRequirements } from "./environment-commands";
import {
  acceptInvitation,
  inviteMember,
  joinEnvironment,
  submitAnswers,
} from "./membership-commands";
import { requirementTransitionDays } from "./model";
import { getEnvironment, listEnvironmentMembers } from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());

// One test moves the clock past a transition deadline.
let clock = new Date();
const domain: DomainContext = {
  db,
  consumers: new ConsumerRegistry(),
  clock: () => clock,
};

const run = <I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: unknown,
) =>
  executeCommand(domain, command, {
    actor,
    input,
    idempotencyKey: randomUUID(),
  });

const user = async () => (await registerTestUser(domain)).actor;

async function environment(owner: UserActor, type = "open") {
  const { output } = await run(createEnvironment, owner, {
    name: "Borettslaget",
    type,
  });

  return output.environmentId;
}

const join = (actor: Actor, environmentId: string) =>
  run(joinEnvironment, actor, { environmentId, answers: [] });

const members = (actor: Actor, environmentId: string) =>
  executeQuery(domain, listEnvironmentMembers, {
    actor,
    input: { environmentId },
  });

const memberIds = async (actor: Actor, environmentId: string) =>
  (await members(actor, environmentId)).members.map((member) => member.userId);

async function denial(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isDomainError(error)) return error.code;
    throw error;
  }

  return "allowed";
}

describe("the member list (WP-84, vision 03)", () => {
  it("shows an active member the other active members with their roles, not their answers", async () => {
    const owner = await user();
    const environmentId = await environment(owner);
    const [anna, bo] = [await user(), await user()];
    await join(anna, environmentId);
    await join(bo, environmentId);

    const { members: list } = await members(anna, environmentId);

    expect(list.map((member) => member.userId).sort()).toEqual(
      [owner.userId, bo.userId].sort(),
    );
    expect(list.find((member) => member.userId === owner.userId)).toEqual({
      userId: owner.userId,
      realName: "Test Testesen",
      profileId: owner.userId,
      roles: ["owner", "administrator"],
    });
    expect(list.find((member) => member.userId === bo.userId)?.roles).toEqual(
      [],
    );
  });

  it("leaves out applicants, invitees and members whose account is not active", async () => {
    const owner = await user();
    const closed = await environment(owner, "closed");
    const [member, applicant, invitee, resting] = [
      await user(),
      await user(),
      await user(),
      await user(),
    ];
    await run(inviteMember, owner, {
      environmentId: closed,
      userId: member.userId,
    });
    await run(acceptInvitation, member, { environmentId: closed, answers: [] });
    await join(applicant, closed);
    await run(inviteMember, owner, {
      environmentId: closed,
      userId: invitee.userId,
    });
    await run(inviteMember, owner, {
      environmentId: closed,
      userId: resting.userId,
    });
    await run(acceptInvitation, resting, {
      environmentId: closed,
      answers: [],
    });
    await run(deactivateAccount, resting, {});

    expect(await memberIds(member, closed)).toEqual([owner.userId]);
  });

  it("leaves out anyone the member has blocked or is blocked by, and shows them again when the block is lifted", async () => {
    const owner = await user();
    const environmentId = await environment(owner);
    const [anna, bo, cleo] = [await user(), await user(), await user()];
    await join(anna, environmentId);
    await join(bo, environmentId);
    await join(cleo, environmentId);
    await run(blockUser, anna, { userId: bo.userId });
    await run(blockUser, cleo, { userId: anna.userId });

    expect(await memberIds(anna, environmentId)).toEqual([owner.userId]);
    expect(await memberIds(bo, environmentId)).not.toContain(anna.userId);
    expect(await memberIds(cleo, environmentId)).not.toContain(anna.userId);
    expect(await memberIds(owner, environmentId)).toEqual(
      expect.arrayContaining([anna.userId, bo.userId, cleo.userId]),
    );

    await run(liftUserBlock, anna, { userId: bo.userId });

    expect(await memberIds(anna, environmentId)).toContain(bo.userId);
  });

  it("leaves out a member whose transition period has run out, and gives that member no list", async () => {
    clock = new Date();
    const owner = await user();
    const environmentId = await environment(owner);
    const [prompt, late] = [await user(), await user()];
    await join(prompt, environmentId);
    await join(late, environmentId);
    const { requirementsRevision } = await executeQuery(
      domain,
      getEnvironment,
      { actor: owner, input: { environmentId } },
    );
    await run(updateRequirements, owner, {
      environmentId,
      requirements: [{ kind: "acceptance", text: "Jeg godtar husreglene" }],
      expectedRevision: requirementsRevision,
    });
    const { requirements } = await executeQuery(domain, getEnvironment, {
      actor: prompt,
      input: { environmentId },
    });
    await run(submitAnswers, prompt, {
      environmentId,
      answers: requirements.map(({ id }) => ({
        requirementId: id,
        accepted: true,
      })),
    });
    clock = new Date(
      clock.getTime() + (requirementTransitionDays + 1) * 86_400_000,
    );

    try {
      expect(await memberIds(prompt, environmentId)).toEqual([]);
      expect(await denial(members(late, environmentId))).toBe("forbidden");
    } finally {
      clock = new Date();
    }
  });

  it("gives no list to outsiders, and keeps a hidden environment unknown to them", async () => {
    const owner = await user();
    const open = await environment(owner);
    const hidden = await environment(owner, "hidden");
    const applicant = await user();
    const closed = await environment(owner, "closed");
    await join(applicant, closed);
    const outsider = await user();

    expect(await denial(members(outsider, open))).toBe("not_found");
    expect(await denial(members(applicant, closed))).toBe("forbidden");
    expect(await denial(members(outsider, hidden))).toBe("not_found");
    expect(await denial(members(outsider, randomUUID()))).toBe("not_found");
  });
});

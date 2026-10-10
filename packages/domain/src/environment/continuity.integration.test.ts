import { randomUUID } from "node:crypto";
import type { CreateEnvironment } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { type Actor, systemActor, type UserActor } from "../actor";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import { ConsumerRegistry } from "../outbox/consumer";
import { blockUser } from "../social/commands";
import { acquaint } from "../testing/acquaintance";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import {
  cancelEnvironmentWindDown,
  claimOwnership,
  releaseDepartedUser,
  settleContinuity,
  startEnvironmentWindDown,
  withdrawOwnershipClaim,
} from "./continuity-commands";
import { createEnvironment } from "./environment-commands";
import {
  acceptInvitation,
  approveMembership,
  inviteMember,
  joinEnvironment,
  leaveEnvironment,
} from "./membership-commands";
import { ownershipClaimDays, windDownCancellationDays } from "./model";
import { accountLifecycleProcess, continuityProcess } from "./policies";
import { getEnvironment, listRoles } from "./queries";
import {
  acceptRoleInvitation,
  declineRoleInvitation,
  inviteAdministrator,
  offerOwnership,
  removeAdministrator,
  resignAdministrator,
  withdrawRoleInvitation,
} from "./role-commands";

const db = connectTestDatabase();
afterAll(() => db.destroy());

// Tests move the clock past claim deadlines and cancellation periods.
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

/**
 * The actor as it would be after a fresh e-mail code, so handover and
 * winding down (which need a recent proof of identity) work at any clock.
 */
const fresh = (actor: UserActor): UserActor => ({
  ...actor,
  authentication: {
    ...actor.authentication,
    methods: [{ method: "otp", at: clock }],
  },
});

/** Each command happens a moment after the previous one, as in real use. */
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

/** System commands take no idempotency key. */
const system = <I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  process: string,
  input: unknown = {},
) =>
  executeCommand(domain, command, { actor: systemActor(process), input }).then(
    (result) => result.output,
  );

const settle = () => system(settleContinuity, continuityProcess);
const depart = (actor: UserActor) =>
  system(releaseDepartedUser, accountLifecycleProcess, {
    userId: actor.userId,
  });

const user = async () => (await registerTestUser(domain)).actor;

const read = (actor: Actor, environmentId: string) =>
  executeQuery(domain, getEnvironment, { actor, input: { environmentId } });

const roles = (actor: Actor, environmentId: string) =>
  executeQuery(domain, listRoles, { actor, input: { environmentId } });

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

/** A member who has joined, or accepted an invitation to a hidden one. */
async function member(environmentId: string, owner: UserActor) {
  const actor = await user();
  const { type } = await read(owner, environmentId);

  if (type === "open") {
    await output(joinEnvironment, actor, { environmentId, answers: [] });
  } else {
    await acquaint(db, owner, actor);
    await output(inviteMember, owner, { environmentId, userId: actor.userId });
    await output(acceptInvitation, actor, { environmentId, answers: [] });
  }

  return actor;
}

/** Makes `actor` an administrator through invitation and acceptance. */
async function administrator(
  environmentId: string,
  inviter: UserActor,
  actor: UserActor,
) {
  const { invitationId } = await output(inviteAdministrator, inviter, {
    environmentId,
    userId: actor.userId,
  });
  await output(acceptRoleInvitation, actor, { environmentId, invitationId });

  return actor;
}

/** An environment with an owner and two further administrators. */
async function administeredEnvironment(type: "open" | "hidden" = "open") {
  const owner = await user();
  const environmentId = await environment(owner, { type });
  const first = await administrator(
    environmentId,
    owner,
    await member(environmentId, owner),
  );
  const second = await administrator(
    environmentId,
    owner,
    await member(environmentId, owner),
  );

  return { owner, environmentId, first, second };
}

async function ownersOf(environmentId: string) {
  return db
    .selectFrom("app.environment_role_grants")
    .select("user_id")
    .where("environment_id", "=", environmentId)
    .where("role", "=", "owner")
    .where("revoked_at", "is", null)
    .execute();
}

async function environmentEvents(environmentId: string) {
  return (
    await db
      .selectFrom("app.audit_events")
      .select("event_type")
      .where("resource_type", "=", "environment")
      .where("resource_id", "=", environmentId)
      .orderBy("position")
      .execute()
  ).map((row) => row.event_type);
}

describe("administrator invitations (PS-ENV-003)", () => {
  it("make a member administrator only when they accept", async () => {
    const owner = await user();
    const environmentId = await environment(owner);
    const candidate = await member(environmentId, owner);

    const { invitationId } = await output(inviteAdministrator, owner, {
      environmentId,
      userId: candidate.userId,
    });

    const view = await read(candidate, environmentId);
    expect(view.roles).toEqual([]);
    expect(view.roleInvitations).toEqual([
      { id: invitationId, role: "administrator" },
    ]);
    expect((await roles(owner, environmentId)).invitations).toMatchObject([
      {
        id: invitationId,
        userId: candidate.userId,
        role: "administrator",
        invitedByUserId: owner.userId,
      },
    ]);
    // Not yet an administrator.
    await expect(roles(candidate, environmentId)).rejects.toMatchObject({
      code: "forbidden",
    });

    expect(
      await output(acceptRoleInvitation, candidate, {
        environmentId,
        invitationId,
      }),
    ).toEqual({ roles: ["administrator"] });
    const listed = await roles(candidate, environmentId);
    expect(listed.invitations).toEqual([]);
    expect(listed.holders.map((holder) => holder.roles)).toEqual([
      ["owner", "administrator"],
      ["administrator"],
    ]);
    expect(await environmentEvents(environmentId)).toEqual([
      "environment.created",
      "environment.role_granted",
      "environment.role_granted",
      "environment.role_invited",
      "environment.role_granted",
      "environment.role_invitation_closed",
    ]);
  });

  it("only go to active members, from administrators, without blocks", async () => {
    const owner = await user();
    const environmentId = await environment(owner, { type: "closed" });
    const outsider = await user();
    const ordinary = await member(environmentId, owner);
    const blocker = await member(environmentId, owner);
    const invited = await user();
    await acquaint(db, owner, invited);
    await output(inviteMember, owner, {
      environmentId,
      userId: invited.userId,
    });

    await expect(
      run(inviteAdministrator, owner, {
        environmentId,
        userId: outsider.userId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      run(inviteAdministrator, owner, {
        environmentId,
        userId: invited.userId,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(inviteAdministrator, ordinary, {
        environmentId,
        userId: blocker.userId,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      run(inviteAdministrator, owner, { environmentId, userId: owner.userId }),
    ).rejects.toMatchObject({ code: "conflict" });

    // A block either way looks like someone who is not a member.
    await output(blockUser, blocker, { userId: owner.userId });
    await expect(
      run(inviteAdministrator, owner, {
        environmentId,
        userId: blocker.userId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("give one invitation when requests race, and can be declined or withdrawn", async () => {
    const { owner, environmentId, first } = await administeredEnvironment();
    const candidate = await member(environmentId, owner);
    const input = { environmentId, userId: candidate.userId };

    const results = await Promise.allSettled([
      run(inviteAdministrator, owner, input),
      run(inviteAdministrator, first, input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "conflict" },
    });
    const invitationId = (await read(candidate, environmentId))
      .roleInvitations[0]!.id;

    // Nobody else can answer it, and it does not exist for them.
    await expect(
      run(acceptRoleInvitation, first, { environmentId, invitationId }),
    ).rejects.toMatchObject({ code: "not_found" });

    // Any administrator may withdraw an administrator invitation.
    await output(withdrawRoleInvitation, first, {
      environmentId,
      invitationId,
    });
    await expect(
      run(acceptRoleInvitation, candidate, { environmentId, invitationId }),
    ).rejects.toMatchObject({ code: "not_found" });

    const again = await output(inviteAdministrator, owner, input);
    await output(declineRoleInvitation, candidate, {
      environmentId,
      ...again,
    });
    expect((await read(candidate, environmentId)).roles).toEqual([]);

    // An invitation does not outlive the membership it was for.
    const last = await output(inviteAdministrator, owner, input);
    await output(leaveEnvironment, candidate, { environmentId });
    await output(joinEnvironment, candidate, { environmentId, answers: [] });
    await expect(
      run(acceptRoleInvitation, candidate, { environmentId, ...last }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("stay valid when the inviting administrator leaves", async () => {
    const { owner, environmentId, first } = await administeredEnvironment();
    const candidate = await member(environmentId, owner);
    const { invitationId } = await output(inviteAdministrator, first, {
      environmentId,
      userId: candidate.userId,
    });

    await output(resignAdministrator, first, { environmentId });
    await output(leaveEnvironment, first, { environmentId });

    expect(
      await output(acceptRoleInvitation, candidate, {
        environmentId,
        invitationId,
      }),
    ).toEqual({ roles: ["administrator"] });
  });
});

describe("administrators and the owner (PS-ENV-003)", () => {
  it("cannot remove each other; only the owner removes an administrator", async () => {
    const { owner, environmentId, first, second } =
      await administeredEnvironment();

    await expect(
      run(removeAdministrator, first, {
        environmentId,
        userId: second.userId,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      run(removeAdministrator, first, { environmentId, userId: owner.userId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      run(removeAdministrator, owner, { environmentId, userId: owner.userId }),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(
      await output(removeAdministrator, owner, {
        environmentId,
        userId: second.userId,
      }),
    ).toEqual({ roles: [] });
    await expect(
      run(removeAdministrator, owner, {
        environmentId,
        userId: second.userId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    // A removed administrator stays an ordinary member.
    expect((await read(second, environmentId)).membership?.state).toBe(
      "active",
    );
  });

  it("let administrators resign, but not the owner or the last one", async () => {
    const { owner, environmentId, first } = await administeredEnvironment();

    await expect(
      run(resignAdministrator, owner, { environmentId }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(leaveEnvironment, owner, { environmentId }),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(await output(resignAdministrator, first, { environmentId })).toEqual(
      { roles: [] },
    );
    await expect(
      run(resignAdministrator, first, { environmentId }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("hand ownership over only when the administrator accepts", async () => {
    const { owner, environmentId, first, second } =
      await administeredEnvironment();

    // Handing over needs a recent proof of identity.
    await expect(
      executeCommand(domain, offerOwnership, {
        actor: {
          ...owner,
          authentication: {
            ...owner.authentication,
            methods: [{ method: "otp", at: new Date(0) }],
          },
        },
        input: { environmentId, userId: first.userId },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "reauthentication_required" });
    await expect(
      run(offerOwnership, first, { environmentId, userId: second.userId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const ordinary = await member(environmentId, owner);
    await expect(
      run(offerOwnership, owner, { environmentId, userId: ordinary.userId }),
    ).rejects.toMatchObject({ code: "not_found" });

    const { invitationId } = await output(offerOwnership, owner, {
      environmentId,
      userId: first.userId,
    });
    await expect(
      run(offerOwnership, owner, { environmentId, userId: second.userId }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await read(owner, environmentId)).roles).toEqual([
      "owner",
      "administrator",
    ]);

    expect(
      await output(acceptRoleInvitation, first, {
        environmentId,
        invitationId,
      }),
    ).toEqual({ roles: ["owner", "administrator"] });
    expect((await read(owner, environmentId)).roles).toEqual(["administrator"]);
    expect(await ownersOf(environmentId)).toEqual([{ user_id: first.userId }]);

    // The previous owner is an ordinary administrator now and may resign.
    await output(resignAdministrator, owner, { environmentId });
    await output(leaveEnvironment, owner, { environmentId });
  });

  it("lapse a handover when the receiving administrator is removed", async () => {
    const { owner, environmentId, first } = await administeredEnvironment();
    const { invitationId } = await output(offerOwnership, owner, {
      environmentId,
      userId: first.userId,
    });

    await output(removeAdministrator, owner, {
      environmentId,
      userId: first.userId,
    });

    await expect(
      run(acceptRoleInvitation, first, { environmentId, invitationId }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await ownersOf(environmentId)).toEqual([{ user_id: owner.userId }]);
  });

  it("keep exactly one owner when a handover races a removal", async () => {
    for (let round = 0; round < 3; round += 1) {
      const { owner, environmentId, first } = await administeredEnvironment();
      const { invitationId } = await output(offerOwnership, owner, {
        environmentId,
        userId: first.userId,
      });

      const results = await Promise.allSettled([
        run(acceptRoleInvitation, first, { environmentId, invitationId }),
        run(removeAdministrator, owner, {
          environmentId,
          userId: first.userId,
        }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const owners = await ownersOf(environmentId);
      expect(owners).toHaveLength(1);
      // Whoever owns it is an administrator too.
      expect(
        (await roles(fresh(owner), environmentId).catch(() => null)) ??
          (await roles(first, environmentId)),
      ).toMatchObject({
        holders: expect.arrayContaining([
          expect.objectContaining({
            userId: owners[0]!.user_id,
            roles: ["owner", "administrator"],
          }),
        ]),
      });
    }
  });

  it("serialize two administrators resigning at once", async () => {
    const { owner, environmentId, first, second } =
      await administeredEnvironment();
    await depart(owner);

    const results = await Promise.allSettled([
      run(resignAdministrator, first, { environmentId }),
      run(resignAdministrator, second, { environmentId }),
    ]);

    // During the vacancy one of them must remain.
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "conflict" },
    });
  });
});

describe("winding down (PS-ENV-012)", () => {
  it("stops new members and can be cancelled within 7 days", async () => {
    const owner = await user();
    const environmentId = await environment(owner);
    const admin = await administrator(
      environmentId,
      owner,
      await member(environmentId, owner),
    );
    const newcomer = await user();

    await expect(
      run(startEnvironmentWindDown, admin, { environmentId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const { finalAt } = await output(startEnvironmentWindDown, owner, {
      environmentId,
    });
    expect(new Date(finalAt).getTime() - clock.getTime()).toBe(
      windDownCancellationDays * 86_400_000,
    );

    const view = await read(owner, environmentId);
    expect(view.state).toBe("winding_down");
    expect(view.continuity?.windDown).toEqual({
      reason: "voluntary",
      finalAt,
      cancellable: true,
    });
    await expect(
      run(joinEnvironment, newcomer, { environmentId, answers: [] }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(startEnvironmentWindDown, owner, { environmentId }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(cancelEnvironmentWindDown, admin, { environmentId }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await output(cancelEnvironmentWindDown, owner, { environmentId });
    expect((await read(owner, environmentId)).state).toBe("active");
    await output(joinEnvironment, newcomer, { environmentId, answers: [] });
  });

  it("becomes final after 7 days and closes the processes that waited", async () => {
    const owner = await user();
    const environmentId = await environment(owner, { type: "closed" });
    const applicant = await user();
    const invited = await user();
    const outsider = await user();
    const { membershipId: application } = await output(
      joinEnvironment,
      applicant,
      { environmentId, answers: [] },
    );
    await acquaint(db, owner, invited);
    await output(inviteMember, owner, {
      environmentId,
      userId: invited.userId,
    });

    await output(startEnvironmentWindDown, owner, { environmentId });

    // The waiting processes are on hold, not ended, while it can be cancelled.
    await expect(
      run(approveMembership, owner, {
        environmentId,
        membershipId: application,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await read(applicant, environmentId)).membership?.state).toBe(
      "pending",
    );

    passDays(windDownCancellationDays);
    await expect(
      run(cancelEnvironmentWindDown, owner, { environmentId }),
    ).rejects.toMatchObject({ code: "conflict" });

    // settle() is global and the clock has moved, so other files' wind-downs
    // may finalize too; count this environment's own finalization instead.
    await Promise.all([settle(), settle()]);
    await settle();
    expect(
      (await environmentEvents(environmentId)).filter(
        (event) => event === "environment.wind_down_finalized",
      ),
    ).toHaveLength(1);

    const pending = await db
      .selectFrom("app.environment_memberships")
      .select(["state", "end_reason"])
      .where("environment_id", "=", environmentId)
      .where("user_id", "in", [applicant.userId, invited.userId])
      .execute();
    expect(pending).toEqual([
      { state: "ended", end_reason: "environment_wound_down" },
      { state: "ended", end_reason: "environment_wound_down" },
    ]);
    // Members, roles and history stay; the owner still reads it.
    expect(await read(owner, environmentId)).toMatchObject({
      state: "winding_down",
      roles: ["owner", "administrator"],
      membership: { state: "active" },
      continuity: { windDown: { cancellable: false } },
    });
    expect(await read(outsider, environmentId)).toMatchObject({
      continuity: null,
    });
    expect(await environmentEvents(environmentId)).toEqual(
      expect.arrayContaining([
        "environment.wind_down_started",
        "environment.wind_down_finalized",
      ]),
    );
  });

  it("is started once when a request is retried", async () => {
    const owner = await user();
    const environmentId = await environment(owner);
    const key = randomUUID();

    const [first, retry] = await Promise.all([
      run(startEnvironmentWindDown, owner, { environmentId }, key),
      run(startEnvironmentWindDown, owner, { environmentId }, key),
    ]);

    expect(first.output).toEqual(retry.output);
    expect([first.replayed, retry.replayed].sort()).toEqual([false, true]);
  });
});

describe("temporary ownerlessness (PS-ENV-013–014)", () => {
  it("gives the claim to the administrator with the longest tenure", async () => {
    const { owner, environmentId, first, second } =
      await administeredEnvironment();
    const ordinary = await member(environmentId, owner);

    expect(await depart(owner)).toEqual({ environments: 1 });
    expect(await ownersOf(environmentId)).toEqual([]);
    const { continuity } = await read(first, environmentId);
    expect(continuity).toMatchObject({
      administrationAvailable: true,
      ownershipVacancy: { claimedByYou: false },
      windDown: null,
    });

    // Nobody holds the owner's powers in the meantime.
    for (const actor of [first, second]) {
      await expect(
        run(startEnvironmentWindDown, actor, { environmentId }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(
      run(claimOwnership, ordinary, { environmentId }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // Claiming first gives no advantage: tenure decides.
    await output(claimOwnership, second, { environmentId });
    await output(claimOwnership, second, { environmentId });
    await output(claimOwnership, first, { environmentId });
    expect((await read(first, environmentId)).continuity).toMatchObject({
      ownershipVacancy: { claimedByYou: true },
    });

    // The claim period is not over yet.
    expect(await settle()).toMatchObject({ ownersChosen: 0 });
    passDays(ownershipClaimDays);
    await expect(
      run(claimOwnership, first, { environmentId }),
    ).rejects.toMatchObject({ code: "conflict" });

    const results = await Promise.all([settle(), settle()]);
    expect(results.reduce((sum, r) => sum + r.ownersChosen, 0)).toBe(1);
    expect(await ownersOf(environmentId)).toEqual([{ user_id: first.userId }]);
    expect(await read(first, environmentId)).toMatchObject({
      state: "active",
      roles: ["owner", "administrator"],
      continuity: { ownershipVacancy: null },
    });
  });

  it("ignores claims from those who are no longer administrators", async () => {
    const { owner, environmentId, first, second } =
      await administeredEnvironment();
    await depart(owner);

    await output(claimOwnership, first, { environmentId });
    await output(claimOwnership, second, { environmentId });
    await output(resignAdministrator, first, { environmentId });
    await expect(
      run(withdrawOwnershipClaim, first, { environmentId }),
    ).rejects.toMatchObject({ code: "forbidden" });

    passDays(ownershipClaimDays);
    await settle();
    expect(await ownersOf(environmentId)).toEqual([{ user_id: second.userId }]);
  });

  it("winds down when nobody claims, and stays hidden throughout", async () => {
    const { owner, environmentId, first, second } =
      await administeredEnvironment("hidden");
    const outsider = await user();
    await depart(owner);

    await output(claimOwnership, first, { environmentId });
    await output(withdrawOwnershipClaim, first, { environmentId });
    await expect(read(outsider, environmentId)).rejects.toMatchObject({
      code: "not_found",
    });

    passDays(ownershipClaimDays);
    expect(await settle()).toMatchObject({ woundDown: 1 });

    expect(await read(second, environmentId)).toMatchObject({
      type: "hidden",
      state: "winding_down",
      continuity: {
        ownershipVacancy: null,
        windDown: { reason: "ownerless", cancellable: false },
      },
    });
    await expect(read(outsider, environmentId)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(roles(outsider, environmentId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("winds down at once when the owner was the only administrator", async () => {
    const owner = await user();
    const environmentId = await environment(owner, { type: "closed" });
    const ordinary = await user();
    await acquaint(db, owner, ordinary);
    await output(inviteMember, owner, {
      environmentId,
      userId: ordinary.userId,
    });
    await output(acceptInvitation, ordinary, {
      environmentId,
      answers: [],
    });
    const applicant = await user();
    await output(joinEnvironment, applicant, { environmentId, answers: [] });

    await depart(owner);

    // Nobody can take over, and nobody else gains authority (PS-ENV-014).
    expect(await read(ordinary, environmentId)).toMatchObject({
      state: "winding_down",
      continuity: {
        administrationAvailable: false,
        ownershipVacancy: null,
        windDown: { reason: "ownerless", cancellable: false },
      },
    });
    expect((await read(applicant, environmentId)).membership).toBeNull();
    expect(await depart(owner)).toEqual({ environments: 0 });
  });

  it("winds down at once when the last administrator goes during a vacancy", async () => {
    const { owner, environmentId, first, second } =
      await administeredEnvironment();
    await depart(owner);
    await output(resignAdministrator, first, { environmentId });

    await depart(second);

    expect((await read(first, environmentId)).continuity).toMatchObject({
      administrationAvailable: false,
      ownershipVacancy: null,
      windDown: { reason: "ownerless" },
    });
  });

  it("lapses a pending handover when the owner disappears", async () => {
    const { owner, environmentId, first } = await administeredEnvironment();
    const { invitationId } = await output(offerOwnership, owner, {
      environmentId,
      userId: first.userId,
    });

    await depart(owner);

    await expect(
      run(acceptRoleInvitation, first, { environmentId, invitationId }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await ownersOf(environmentId)).toEqual([]);
  });
});

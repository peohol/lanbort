import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { suspendAccount } from "../account/lifecycle";
import { claimCase, closeCase } from "../cases/commands";
import { readCase } from "../cases/queries";
import { executeQuery } from "../commands/query";
import {
  acceptRoleInvitation,
  inviteAdministrator,
} from "../environment/role-commands";
import { reportInEnvironment, reportToPlatform } from "../moderation/commands";
import { acquaint } from "../testing/acquaintance";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  endEnvironmentRoles,
  listCaseInterventions,
  openPlatformInquiry,
} from "./intervention-commands";

/**
 * PS-ADM-014–015: a steward's intervention starts from a case in the
 * platform queue, a report or their own inquiry, which they hold and are
 * not involved in, toward what the case is about; it is recorded on the
 * case with its basis, which no event carries.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const { run, tick, user, steward, inquiry, environment, member, eventsFor } =
  kit;

const basis = "Gjentatte brudd på vilkårene, se vedlagte meldinger";

const interventionsOf = (actor: UserActor, caseId: string) =>
  executeQuery(tick(), listCaseInterventions, { actor, input: { caseId } });

const suspend = (actor: UserActor, caseId: string, userId: string) =>
  run(suspendAccount, actor, { caseId, userId, basis });

async function administrator(
  environmentId: string,
  owner: UserActor,
  actor: UserActor,
) {
  const { invitationId } = await run(inviteAdministrator, owner, {
    environmentId,
    userId: actor.userId,
  });
  await run(acceptRoleInvitation, actor, { environmentId, invitationId });
}

const activeRoles = async (environmentId: string, userId: string) =>
  (
    await db
      .selectFrom("app.environment_role_grants")
      .select("role")
      .where("environment_id", "=", environmentId)
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .orderBy("role")
      .execute()
  ).map((row) => row.role);

describe("a steward's own inquiry (PS-ADM-015)", () => {
  it("is held by the steward at once, with the basis for the handlers only", async () => {
    const platform = await steward();
    const target = await user();

    const { caseId, entryId } = await run(openPlatformInquiry, platform, {
      target: { kind: "user", userId: target.userId },
      basis,
    });

    const opened = await executeQuery(tick(), readCase, {
      actor: platform,
      input: { caseId },
    });
    expect(opened).toMatchObject({
      kind: "platform_inquiry",
      status: "open",
      assigneeUserId: platform.userId,
    });
    expect(opened.entries).toEqual([
      expect.objectContaining({
        id: entryId,
        capacity: "handler",
        audience: "handlers",
        body: basis,
      }),
    ]);
    // Whoever it is about never learns of it through the case.
    await expect(
      executeQuery(tick(), readCase, { actor: target, input: { caseId } }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(JSON.stringify(await eventsFor("case", caseId))).not.toContain(
      basis,
    );

    // Never about the steward's own account or thing.
    await expect(
      run(openPlatformInquiry, platform, {
        target: { kind: "user", userId: platform.userId },
        basis,
      }),
    ).rejects.toMatchObject({ code: "conflict_of_interest" });
    const objectId = await kit.create(platform);
    await expect(
      run(openPlatformInquiry, platform, {
        target: { kind: "object", objectId },
        basis,
      }),
    ).rejects.toMatchObject({ code: "conflict_of_interest" });
    // Only a steward with a fresh confirmation opens one.
    await expect(
      run(openPlatformInquiry, target, {
        target: { kind: "user", userId: platform.userId },
        basis,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      run(openPlatformInquiry, platform, {
        target: { kind: "user", userId: randomUUID() },
        basis,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("interventions from their case (PS-ADM-014–015)", () => {
  it("records the intervention on the case, with its basis for the handlers only", async () => {
    const platform = await steward();
    const target = await user();
    const caseId = await inquiry(platform, {
      kind: "user",
      userId: target.userId,
    });

    await suspend(platform, caseId, target.userId);

    const { items } = await interventionsOf(platform, caseId);
    expect(items).toEqual([
      expect.objectContaining({
        kind: "account_suspended",
        userId: target.userId,
        basis,
        decidedByUserId: platform.userId,
      }),
    ]);
    const recorded = (await eventsFor("case", caseId)).filter(
      (event) => event.event_type === "case.intervention_recorded",
    );
    expect(recorded).toEqual([
      {
        event_type: "case.intervention_recorded",
        payload: {
          caseKind: "platform_inquiry",
          environmentId: null,
          interventionId: items[0]!.id,
          kind: "account_suspended",
        },
      },
    ]);
    await expect(interventionsOf(target, caseId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("is taken only by the steward who holds the open case, toward what it is about", async () => {
    const platform = await steward();
    const other = await steward();
    const [target, bystander] = await Promise.all([user(), user()]);
    const caseId = await inquiry(platform, {
      kind: "user",
      userId: target.userId,
    });

    // Another steward may handle it, but does not have it.
    await expect(suspend(other, caseId, target.userId)).rejects.toMatchObject({
      code: "conflict",
    });
    // Nobody the case is not about.
    await expect(
      suspend(platform, caseId, bystander.userId),
    ).rejects.toMatchObject({ code: "forbidden" });
    // No case, no intervention.
    await expect(
      suspend(platform, randomUUID(), target.userId),
    ).rejects.toMatchObject({ code: "not_found" });

    await run(closeCase, platform, { caseId });
    await expect(
      suspend(platform, caseId, target.userId),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await interventionsOf(platform, caseId)).items).toEqual([]);
  });

  it("comes from a report too, never by a steward involved in it", async () => {
    const [platform, reporting] = await Promise.all([steward(), steward()]);
    const target = await user();
    await acquaint(db, reporting, target);
    const { caseId } = await run(reportToPlatform, reporting, {
      target: { kind: "user", userId: target.userId },
      body: "Truer andre medlemmer.",
    });

    // The steward who reported it is involved and never handles it.
    await expect(run(claimCase, reporting, { caseId })).rejects.toMatchObject({
      code: "conflict_of_interest",
    });
    await expect(
      suspend(reporting, caseId, target.userId),
    ).rejects.toMatchObject({ code: "conflict_of_interest" });

    await run(claimCase, platform, { caseId });
    await suspend(platform, caseId, target.userId);
    expect((await interventionsOf(platform, caseId)).items).toHaveLength(1);
    // The reporter takes part, and sees no interventions or bases.
    await expect(interventionsOf(reporting, caseId)).rejects.toMatchObject({
      code: "conflict_of_interest",
    });
  });

  it("never comes from an environment's own report", async () => {
    const platform = await steward();
    const owner = await user();
    const environmentId = await environment(owner);
    const [reporter, target] = await Promise.all([
      member(environmentId, owner),
      member(environmentId, owner),
    ]);
    const { caseId } = await run(reportInEnvironment, reporter, {
      environmentId,
      target: { kind: "user", userId: target.userId },
      body: "Truer andre medlemmer.",
    });

    await expect(
      suspend(platform, caseId, target.userId),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("ending roles in an environment (PS-ADM-015)", () => {
  it("ends an administrator's roles, and an owner's place goes through continuity", async () => {
    const platform = await steward();
    const owner = await user();
    const environmentId = await environment(owner);
    const admin = await member(environmentId, owner);
    await administrator(environmentId, owner, admin);

    const aboutAdmin = await inquiry(platform, {
      kind: "user",
      userId: admin.userId,
    });
    const ended = await run(endEnvironmentRoles, platform, {
      caseId: aboutAdmin,
      environmentId,
      userId: admin.userId,
      basis,
    });
    expect(ended).toEqual({
      environmentId,
      userId: admin.userId,
      ended: ["administrator"],
    });
    expect(await activeRoles(environmentId, admin.userId)).toEqual([]);

    // Nothing left to end: nothing is recorded again.
    expect(
      await run(endEnvironmentRoles, platform, {
        caseId: aboutAdmin,
        environmentId,
        userId: admin.userId,
        basis,
      }),
    ).toMatchObject({ ended: [] });
    expect((await interventionsOf(platform, aboutAdmin)).items).toEqual([
      expect.objectContaining({
        kind: "environment_roles_ended",
        userId: admin.userId,
        environmentId,
      }),
    ]);

    // The owner's place opens for whoever may take it on (PS-ENV-013);
    // nobody gets it from the steward.
    const second = await member(environmentId, owner);
    await administrator(environmentId, owner, second);
    await run(endEnvironmentRoles, platform, {
      caseId: await inquiry(platform, { kind: "user", userId: owner.userId }),
      environmentId,
      userId: owner.userId,
      basis,
    });
    expect(await activeRoles(environmentId, owner.userId)).toEqual([]);
    expect(await activeRoles(environmentId, second.userId)).toEqual([
      "administrator",
    ]);
    const revoked = await db
      .selectFrom("app.environment_role_grants")
      .select(["revoke_reason", "revoked_by_user_id"])
      .where("environment_id", "=", environmentId)
      .where("user_id", "=", owner.userId)
      .execute();
    expect(revoked).toContainEqual({
      revoke_reason: "platform_intervention",
      revoked_by_user_id: platform.userId,
    });
  });
});

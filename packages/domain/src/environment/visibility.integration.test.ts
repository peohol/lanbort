import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { systemActor } from "../actor";
import { endContact, openEnvironmentContact } from "../cases/commands";
import { listEnvironmentCaseQueue } from "../cases/queries";
import { executeCommand } from "../commands/command";
import { executeQuery } from "../commands/query";
import { readHome } from "../home/queries";
import { approveLoanRequest } from "../loans/approval";
import { cancelLoan } from "../loans/cancellation";
import { readPerson } from "../people/queries";
import { publishObject } from "../publications/commands";
import { listObjectPublications } from "../publications/queries";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  cancelEnvironmentWindDown,
  settleContinuity,
  startEnvironmentWindDown,
} from "./continuity-commands";
import { updateEnvironmentDetails } from "./environment-commands";
import { leaveEnvironment } from "./membership-commands";
import { continuityProcess } from "./policies";
import {
  getEnvironment,
  listEnvironmentMembers,
  listOwnEnvironments,
} from "./queries";
import { acceptRoleInvitation, inviteAdministrator } from "./role-commands";

const db = connectTestDatabase();
afterAll(() => db.destroy());
const kit = loanTestKit(db);

const ownEnvironmentIds = async (
  actor: UserActor,
  include?: "current" | "archived" | "all",
) =>
  (
    await executeQuery(kit.domain, listOwnEnvironments, {
      actor,
      input: include ? { include } : {},
    })
  ).map((environment) => environment.id);

const read = (actor: UserActor, environmentId: string) =>
  executeQuery(kit.domain, getEnvironment, {
    actor,
    input: { environmentId },
  });

const finalizeDueWindDowns = async () =>
  executeCommand(kit.domain, settleContinuity, {
    actor: systemActor(continuityProcess),
    input: {},
  });

/** An environment with an owner and a member, wound down after 8 days. */
async function woundDown(
  prepare: (setup: {
    owner: UserActor;
    member: UserActor;
    environmentId: string;
  }) => Promise<void> = async () => {},
) {
  const owner = await kit.user();
  const environmentId = await kit.environment(owner, { name: "Avviklet" });
  const member = await kit.member(environmentId, owner);
  await prepare({ owner, member, environmentId });
  await kit.run(startEnvironmentWindDown, owner, {
    environmentId,
    atOnce: false,
  });
  kit.advanceDays(8);
  await finalizeDueWindDowns();

  return { owner, member, environmentId };
}

describe("wound-down environments as an archive (PS-ENV-012)", () => {
  it("moves a final environment from current lists to its members' archive", async () => {
    const owner = await kit.user();
    const finishedId = await kit.environment(owner, { name: "Avviklet" });
    const activeId = await kit.environment(owner, { name: "Aktivt" });
    const otherMember = await kit.member(finishedId, owner);

    expect(await ownEnvironmentIds(owner)).toEqual([activeId, finishedId]);
    expect(await ownEnvironmentIds(owner, "archived")).toEqual([]);

    // It stays in current lists for the full cancellation period.
    await kit.run(startEnvironmentWindDown, owner, {
      environmentId: finishedId,
      atOnce: false,
    });
    expect(await ownEnvironmentIds(owner)).toContain(finishedId);
    await kit.run(cancelEnvironmentWindDown, owner, {
      environmentId: finishedId,
    });
    expect(await ownEnvironmentIds(owner)).toContain(finishedId);

    await kit.run(startEnvironmentWindDown, owner, {
      environmentId: finishedId,
      atOnce: false,
    });
    kit.advanceDays(8);
    await finalizeDueWindDowns();

    expect(await ownEnvironmentIds(owner)).toEqual([activeId]);
    expect(await ownEnvironmentIds(otherMember)).not.toContain(finishedId);
    expect(await ownEnvironmentIds(owner, "archived")).toEqual([finishedId]);
    expect(await ownEnvironmentIds(otherMember, "archived")).toEqual([
      finishedId,
    ]);
    expect(await ownEnvironmentIds(owner, "all")).toEqual([
      activeId,
      finishedId,
    ]);
    // Memberships and roles are kept for history.
    const preserved = await read(owner, finishedId);
    expect(preserved).toMatchObject({
      state: "winding_down",
      roles: ["owner", "administrator"],
      membership: { state: "active" },
    });
    expect(preserved.woundDownAt).not.toBeNull();

    const home = await executeQuery(kit.domain, readHome, {
      actor: otherMember,
      input: {},
    });
    expect(home.environments.map(({ id }) => id)).not.toContain(finishedId);
    expect(home.hasArchive).toBe(true);
  });

  it("archives a one-member environment finalized immediately", async () => {
    const owner = await kit.user();
    const environmentId = await kit.environment(owner);

    await kit.run(startEnvironmentWindDown, owner, {
      environmentId,
      atOnce: true,
    });
    expect(await ownEnvironmentIds(owner)).not.toContain(environmentId);
    expect(await ownEnvironmentIds(owner, "archived")).toEqual([environmentId]);
    expect(await read(owner, environmentId)).toMatchObject({
      membership: { state: "active" },
    });
  });

  it("is not found by anyone who was not a member", async () => {
    const { environmentId } = await woundDown();
    const outsider = await kit.user();

    // An open environment, which anyone could see before.
    await expect(read(outsider, environmentId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("is read-only: nothing changes, and nobody administers it", async () => {
    const { owner, member, environmentId } = await woundDown();
    const { version } = await read(owner, environmentId);

    await expect(
      kit.run(updateEnvironmentDetails, owner, {
        environmentId,
        expectedVersion: version,
        name: "Nytt navn",
        description: null,
        audience: null,
        objectFocus: null,
        location: null,
        area: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      kit.run(leaveEnvironment, member, { environmentId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      kit.run(openEnvironmentContact, member, {
        environmentId,
        body: "Hei, er det noen her?",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      executeQuery(kit.domain, listEnvironmentMembers, {
        actor: member,
        input: { environmentId },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lets an invitation to a role lapse once final", async () => {
    let invitationId = "";
    const { member, environmentId } = await woundDown(
      async ({ owner, member, environmentId }) => {
        ({ invitationId } = await kit.run(inviteAdministrator, owner, {
          environmentId,
          userId: member.userId,
        }));
      },
    );

    expect((await read(member, environmentId)).roleInvitations).toEqual([]);
    await expect(
      kit.run(acceptRoleInvitation, member, { environmentId, invitationId }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("leaves the things' and people's lists, but cases are handled to the end", async () => {
    let caseId = "";
    let objectId = "";
    const { owner, member, environmentId } = await woundDown(
      async ({ member, environmentId }) => {
        objectId = await kit.create(member);
        await kit.run(publishObject, member, { objectId, environmentId });
        ({ caseId } = await kit.run(openEnvironmentContact, member, {
          environmentId,
          body: "Kan dere avklare denne saken?",
        }));
      },
    );

    const { publications } = await executeQuery(
      kit.domain,
      listObjectPublications,
      { actor: member, input: { objectId } },
    );
    expect(publications).toEqual([]);
    const person = await executeQuery(kit.domain, readPerson, {
      actor: member,
      input: { userId: owner.userId },
    });
    expect(person.sharedEnvironments).toEqual([]);

    // The open case stays in the administrators' queue until it is done.
    const queue = await executeQuery(kit.domain, listEnvironmentCaseQueue, {
      actor: owner,
      input: { environmentId, status: "open" },
    });
    expect(queue.items.map(({ id }) => id)).toContain(caseId);
    await kit.run(endContact, member, { caseId });
  });

  it("lets a loan from it go on, from the loan itself", async () => {
    const { admin, owner, borrower, objectId, environmentId } =
      await kit.published();
    const { requestId } = await kit.ask(
      borrower,
      objectId,
      kit.environmentOrigin(environmentId),
      kit.dated(20, 24),
    );
    const { loanId } = await kit.run(approveLoanRequest, owner, {
      requestId,
    });

    await kit.run(startEnvironmentWindDown, admin, {
      environmentId,
      atOnce: false,
    });
    kit.advanceDays(8);
    await finalizeDueWindDowns();
    expect(await ownEnvironmentIds(borrower)).not.toContain(environmentId);
    expect(await ownEnvironmentIds(borrower, "archived")).toContain(
      environmentId,
    );

    await kit.run(cancelLoan, borrower, { loanId });
  });
});

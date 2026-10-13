import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { systemActor } from "../actor";
import { endContact, openEnvironmentContact } from "../cases/commands";
import { executeCommand } from "../commands/command";
import { executeQuery } from "../commands/query";
import { approveLoanRequest } from "../loans/approval";
import { cancelLoan } from "../loans/cancellation";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  cancelEnvironmentWindDown,
  settleContinuity,
  startEnvironmentWindDown,
} from "./continuity-commands";
import { continuityProcess } from "./policies";
import { getEnvironment, listOwnEnvironments } from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());
const kit = loanTestKit(db);

const ownEnvironmentIds = async (actor: UserActor) =>
  (
    await executeQuery(kit.domain, listOwnEnvironments, {
      actor,
      input: {},
    })
  ).map((environment) => environment.id);

const finalizeDueWindDowns = async () =>
  executeCommand(kit.domain, settleContinuity, {
    actor: systemActor(continuityProcess),
    input: {},
  });

describe("finished environments in current lists (PS-ENV-012)", () => {
  it("removes a final environment without obligations but preserves its history", async () => {
    const owner = await kit.user();
    const finishedId = await kit.environment(owner, { name: "Avviklet" });
    const activeId = await kit.environment(owner, { name: "Aktivt" });
    const otherMember = await kit.member(finishedId, owner);

    expect(await ownEnvironmentIds(owner)).toEqual([activeId, finishedId].sort(
      (a, b) => (a === activeId ? -1 : b === activeId ? 1 : 0),
    ));
    expect(await ownEnvironmentIds(otherMember)).toContain(finishedId);

    // Keep an environment in current lists for the full cancellation period.
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
    const preserved = await executeQuery(kit.domain, getEnvironment, {
      actor: owner,
      input: { environmentId: finishedId },
    });
    expect(preserved).toMatchObject({
      state: "winding_down",
      roles: ["owner", "administrator"],
      membership: { state: "active" },
    });
  });

  it("removes a one-member environment finalized immediately", async () => {
    const owner = await kit.user();
    const environmentId = await kit.environment(owner);

    await kit.run(startEnvironmentWindDown, owner, {
      environmentId,
      atOnce: true,
    });
    expect(await ownEnvironmentIds(owner)).not.toContain(environmentId);
    expect(
      await executeQuery(kit.domain, getEnvironment, {
        actor: owner,
        input: { environmentId },
      }),
    ).toMatchObject({ membership: { state: "active" } });
  });

  it("retains a finalized environment while a case is open", async () => {
    const owner = await kit.user();
    const environmentId = await kit.environment(owner);
    const member = await kit.member(environmentId, owner);
    const { caseId } = await kit.run(openEnvironmentContact, member, {
      environmentId,
      body: "Kan dere avklare denne saken?",
    });

    await kit.run(startEnvironmentWindDown, owner, {
      environmentId,
      atOnce: false,
    });
    kit.advanceDays(8);
    await finalizeDueWindDowns();
    expect(await ownEnvironmentIds(owner)).toContain(environmentId);

    await kit.run(endContact, member, { caseId });
    expect(await ownEnvironmentIds(owner)).not.toContain(environmentId);
  });

  it("retains active loans and unexpired review rights after finalization", async () => {
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
    expect(await ownEnvironmentIds(admin)).toContain(environmentId);

    // Ending the reservation opens the normal review window.
    await kit.run(cancelLoan, borrower, { loanId });
    expect(await ownEnvironmentIds(admin)).toContain(environmentId);

    kit.advanceDays(15);
    // An elapsed review window is over even before its housekeeping job runs.
    expect(await ownEnvironmentIds(admin)).not.toContain(environmentId);
  });
});

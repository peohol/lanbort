import type { Notification } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { openEnvironmentContact } from "../cases/commands";
import { executeQuery } from "../commands/query";
import { approveLoanRequest } from "../loans/approval";
import { readLoan } from "../loans/queries";
import { reportInEnvironment } from "../moderation/commands";
import { readMeasureNotice } from "../moderation/notice";
import { notificationGenerator } from "../notifications/generator";
import { listNotifications } from "../notifications/queries";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { deliverAll } from "../testing/outbox";
import { joinEnvironment, removeMember } from "./membership-commands";
import { getEnvironment, listMemberships } from "./queries";
import { acceptRoleInvitation, inviteAdministrator } from "./role-commands";

/**
 * PS-ENV-021: an impartial administrator ends an active membership as a
 * local measure, with the reason, and bars new attempts only as a choice of
 * its own. Approved loans go on; the member is told neutrally, with the way
 * to ask the administrators for a new assessment.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const consumers = new ConsumerRegistry([
  notificationGenerator({ db: () => db }),
]);
const kit = loanTestKit(db, { consumers, startInDays: 1700 });
const {
  run,
  tick,
  user,
  member,
  environment,
  published,
  ask,
  environmentOrigin,
  dated,
  eventsFor,
} = kit;

const reason = "Har gjentatte ganger brutt husreglene om utlån av verktøy.";
const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const conflictOfInterest = { code: "conflict_of_interest" };

const membershipOf = async (environmentId: string, userId: string) =>
  db
    .selectFrom("app.environment_memberships")
    .select(["id", "state", "end_reason"])
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .executeTakeFirstOrThrow();

const memberships = (actor: UserActor, environmentId: string) =>
  executeQuery(tick(), listMemberships, { actor, input: { environmentId } });

async function remove(
  admin: UserActor,
  environmentId: string,
  removed: UserActor,
  input: { restrict?: boolean; reason?: string } = {},
) {
  const { id } = await membershipOf(environmentId, removed.userId);

  return run(removeMember, admin, {
    environmentId,
    membershipId: id,
    reason,
    ...input,
  });
}

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

  return actor;
}

/** The measures the member was told of since the last call. */
const seen = new Set<string>();
async function measuresTold(actor: UserActor) {
  await deliverAll(db, consumers);
  const { notifications } = await executeQuery(tick(), listNotifications, {
    actor,
    input: {},
  });
  const fresh = notifications.filter(
    ({ id, kind }) => !seen.has(id) && kind === "moderation.measure_taken",
  );
  for (const { id } of fresh) seen.add(id);

  return fresh.map(({ kind, detail, target }: Notification) => ({
    kind,
    detail,
    target,
  }));
}

describe("ending an active membership (PS-ENV-021)", () => {
  it("ends it with the reason, keeps approved loans and tells the member neutrally", async () => {
    const { admin, environmentId, owner, borrower, objectId } =
      await published();
    // An approved loan of the owner's, and a request still waiting.
    const { requestId: approved } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
      dated(2, 4),
    );
    const { loanId } = await run(approveLoanRequest, owner, {
      requestId: approved,
    });
    const { requestId: waiting } = await ask(
      await member(environmentId, admin),
      objectId,
      environmentOrigin(environmentId),
      dated(10, 12),
    );
    await measuresTold(owner);

    expect(
      (await memberships(admin, environmentId)).memberships.find(
        (m) => m.userId === owner.userId,
      ),
    ).toMatchObject({ removable: true });

    const { id: membershipId } = await membershipOf(
      environmentId,
      owner.userId,
    );
    expect(await remove(admin, environmentId, owner)).toEqual({
      membershipId,
      state: "ended",
    });

    expect(await membershipOf(environmentId, owner.userId)).toMatchObject({
      state: "ended",
      end_reason: "removed",
    });
    // The owner's thing leaves the environment, and so does the request
    // that was not approved; the approved loan goes on, with the owner's
    // insight in it.
    expect(
      await db
        .selectFrom("app.environment_publications")
        .select("status")
        .where("object_id", "=", objectId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "unpublished" });
    expect(
      await db
        .selectFrom("app.loan_requests")
        .select("status")
        .where("id", "=", waiting)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: "ended" });
    await expect(
      executeQuery(tick(), readLoan, { actor: owner, input: { loanId } }),
    ).resolves.toMatchObject({ id: loanId });

    // Not barred unless chosen.
    expect((await memberships(admin, environmentId)).restrictions).toEqual([]);

    const measure = await db
      .selectFrom("app.moderation_actions")
      .select(["id", "case_id", "reason", "decided_by_user_id"])
      .where("membership_id", "=", membershipId)
      .executeTakeFirstOrThrow();
    expect(measure).toMatchObject({
      case_id: null,
      reason,
      decided_by_user_id: admin.userId,
    });
    expect(
      (await eventsFor("moderation_measure", measure.id)).map((event) => [
        event.event_type,
        event.payload,
      ]),
    ).toEqual([
      [
        "moderation.measure_taken",
        {
          caseId: null,
          measure: "membership_ended",
          scope: "environment",
          environmentId,
          objectId: null,
          reviewId: null,
          dimension: null,
        },
      ],
    ]);
    expect(
      (await eventsFor("environment_membership", membershipId)).at(-1),
    ).toMatchObject({
      event_type: "environment_membership.ended",
      payload: { environmentId, userId: owner.userId, reason: "removed" },
    });

    expect(await measuresTold(owner)).toEqual([
      {
        kind: "moderation.measure_taken",
        detail: "membership_ended",
        target: { type: "moderation_measure", id: measure.id },
      },
    ]);
    const notice = (actor: UserActor) =>
      executeQuery(tick(), readMeasureNotice, {
        actor,
        input: { measureId: measure.id },
      });
    expect(await notice(owner)).toEqual({
      id: measure.id,
      kind: "membership_ended",
      scope: "environment",
      environmentId,
      environmentName: "Borettslaget",
      objectId: null,
      objectTitle: null,
      loanId: null,
      dimension: null,
      reason,
      decidedAt: expect.any(String),
    });
    // Nobody else learns of it, the one who decided included.
    for (const other of [admin, borrower]) {
      await expect(notice(other)).rejects.toMatchObject(notFound);
    }

    // Without a bar, the former member may join again.
    await expect(
      run(joinEnvironment, owner, { environmentId, answers: [] }),
    ).resolves.toMatchObject({ state: "active" });
  });

  it("bars new attempts only when the administrator also chooses that", async () => {
    const admin = await user();
    const environmentId = await environment(admin);
    const removed = await member(environmentId, admin);

    await remove(admin, environmentId, removed, { restrict: true });

    expect((await memberships(admin, environmentId)).restrictions).toEqual([
      expect.objectContaining({ userId: removed.userId }),
    ]);
    await expect(
      run(joinEnvironment, removed, { environmentId, answers: [] }),
    ).rejects.toMatchObject(forbidden);
    expect(
      (
        await executeQuery(tick(), getEnvironment, {
          actor: removed,
          input: { environmentId },
        })
      ).restricted,
    ).toBe(true);
  });

  it("lets whoever was removed from a hidden environment ask its administrators for a new assessment", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { type: "hidden" });
    const removed = await member(environmentId, admin);
    const stranger = await user();

    await remove(admin, environmentId, removed, { restrict: true });

    // The environment is hidden again for them, yet the way back is open.
    await expect(
      executeQuery(tick(), getEnvironment, {
        actor: removed,
        input: { environmentId },
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(openEnvironmentContact, removed, {
        environmentId,
        body: "Jeg vil gjerne be om en ny vurdering.",
      }),
    ).resolves.toMatchObject({ caseId: expect.any(String) });
    // To anyone else it still does not exist.
    await expect(
      run(openEnvironmentContact, stranger, {
        environmentId,
        body: "Hei.",
      }),
    ).rejects.toMatchObject(notFound);
  });

  it("is never decided by the member themselves, a non-administrator or someone involved", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { name: "Vellet" });
    const second = await administrator(
      environmentId,
      admin,
      await member(environmentId, admin),
    );
    const target = await member(environmentId, admin);
    const other = await member(environmentId, admin);

    // The second administrator reported the target: they are involved.
    await run(reportInEnvironment, second, {
      environmentId,
      target: { kind: "user", userId: target.userId },
      body: "Har ikke levert tilbake en drill.",
    });

    const removable = async (actor: UserActor) =>
      Object.fromEntries(
        (await memberships(actor, environmentId)).memberships.map((m) => [
          m.userId,
          m.removable,
        ]),
      );
    expect(await removable(admin)).toEqual({
      [admin.userId]: false,
      [second.userId]: false,
      [target.userId]: true,
      [other.userId]: true,
    });
    expect((await removable(second))[target.userId]).toBe(false);

    await expect(remove(second, environmentId, target)).rejects.toMatchObject(
      conflictOfInterest,
    );
    await expect(remove(admin, environmentId, admin)).rejects.toMatchObject(
      conflictOfInterest,
    );
    await expect(remove(other, environmentId, target)).rejects.toMatchObject(
      forbidden,
    );
    // A role is handed over or removed first.
    await expect(remove(admin, environmentId, second)).rejects.toMatchObject(
      conflict,
    );
    await expect(
      remove(admin, environmentId, target, { reason: "  " }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await remove(admin, environmentId, target);
    // An ended membership is gone for the step.
    await expect(remove(admin, environmentId, target)).rejects.toMatchObject(
      notFound,
    );
  });
});

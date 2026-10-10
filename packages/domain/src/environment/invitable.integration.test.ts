import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { blockUser } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { startEnvironmentWindDown } from "./continuity-commands";
import { liftRestriction } from "./environment-commands";
import {
  acceptInvitation,
  inviteMember,
  joinEnvironment,
  removeMember,
} from "./membership-commands";
import { listInvitableEnvironments, listMemberships } from "./queries";

/**
 * PS-ENV-018: an administrator invites anyone they may lawfully see in
 * Lånbort, a friend or someone from a shared environment, and nobody else.
 * Where they may invite a person shows on that person's page; there is no
 * lookup by address or name.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const { run, tick, user, member, environment, friends } = kit;
const notFound = { code: "not_found" };

const invitable = async (actor: UserActor, userId: string) =>
  (
    await executeQuery(tick(), listInvitableEnvironments, {
      actor,
      input: { userId },
    })
  ).environments.map(({ name }) => name);

/**
 * `admin` and `person` both in an open environment, and nothing else
 * between them: the administrator sees the person, who is not a friend.
 */
async function sharing() {
  const admin = await user();
  const person = await user();
  const shared = await environment(admin, { name: "Felles" });
  await run(joinEnvironment, person, { environmentId: shared, answers: [] });

  return { admin, person, shared };
}

describe("inviting someone the administrator may see (PS-ENV-018)", () => {
  it("offers the closed and hidden environments that may take a person from a shared environment, who may then be invited", async () => {
    const { admin, person } = await sharing();
    const hidden = await environment(admin, { name: "Skjult", type: "hidden" });
    const closed = await environment(admin, { name: "Lukket", type: "closed" });
    // Open environments need no invitation, and someone else's is not the
    // administrator's to offer.
    await environment(admin, { name: "Åpent" });
    await environment(await user(), { name: "Andres", type: "closed" });

    expect(await invitable(admin, person.userId)).toEqual(["Lukket", "Skjult"]);

    await run(inviteMember, admin, {
      environmentId: hidden,
      userId: person.userId,
    });
    // Invited, then a member: no longer offered.
    expect(await invitable(admin, person.userId)).toEqual(["Lukket"]);
    await run(acceptInvitation, person, {
      environmentId: hidden,
      answers: [],
    });
    expect(await invitable(admin, person.userId)).toEqual(["Lukket"]);

    // An environment winding down takes no one new.
    await run(startEnvironmentWindDown, admin, { environmentId: closed });
    expect(await invitable(admin, person.userId)).toEqual([]);
  });

  it("offers friends the same way", async () => {
    const admin = await user();
    const friend = await user();
    await friends(admin, friend);
    await environment(admin, { name: "Vellet", type: "closed" });

    expect(await invitable(admin, friend.userId)).toEqual(["Vellet"]);
  });

  it("leaves out an environment the person is barred from until the bar is lifted", async () => {
    const admin = await user();
    const environmentId = await environment(admin, {
      name: "Vellet",
      type: "closed",
    });
    const removed = await member(environmentId, admin);
    const { id: membershipId } = await db
      .selectFrom("app.environment_memberships")
      .select("id")
      .where("environment_id", "=", environmentId)
      .where("user_id", "=", removed.userId)
      .executeTakeFirstOrThrow();
    await run(removeMember, admin, {
      environmentId,
      membershipId,
      reason: "Har brutt husreglene.",
      restrict: true,
    });

    expect(await invitable(admin, removed.userId)).toEqual([]);
    await expect(
      run(inviteMember, admin, { environmentId, userId: removed.userId }),
    ).rejects.toMatchObject({ code: "conflict" });

    const [restriction] = (
      await executeQuery(tick(), listMemberships, {
        actor: admin,
        input: { environmentId },
      })
    ).restrictions;
    await run(liftRestriction, admin, {
      environmentId,
      restrictionId: restriction!.id,
    });
    expect(await invitable(admin, removed.userId)).toEqual(["Vellet"]);
  });

  it("offers nothing to someone who administers nothing", async () => {
    const { admin, person, shared } = await sharing();
    await environment(admin, { name: "Skjult", type: "hidden" });
    const other = await user();
    await run(joinEnvironment, other, { environmentId: shared, answers: [] });

    // `other` administers nothing, and sees `person` only as a member.
    expect(await invitable(other, person.userId)).toEqual([]);
  });

  it("looks up no one: a stranger, a blocked person and no account at all look the same", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { type: "hidden" });
    const stranger = await user();
    const blocked = await user();
    const blocking = await user();
    await friends(admin, blocked);
    await friends(admin, blocking);
    await run(blockUser, admin, { userId: blocked.userId });
    await run(blockUser, blocking, { userId: admin.userId });

    for (const userId of [stranger.userId, blocking.userId, randomUUID()]) {
      await expect(invitable(admin, userId)).rejects.toMatchObject(notFound);
      await expect(
        run(inviteMember, admin, { environmentId, userId }),
      ).rejects.toMatchObject(notFound);
    }
    // Someone the administrator blocked is still a person they see, but
    // nothing is offered and no invitation goes through.
    expect(await invitable(admin, blocked.userId)).toEqual([]);
    await expect(
      run(inviteMember, admin, { environmentId, userId: blocked.userId }),
    ).rejects.toMatchObject(notFound);
  });
});

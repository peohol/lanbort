import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { previewLoanRequest } from "../loans/queries";
import { refreshSearchIndex } from "../search/indexer";
import { searchObjects } from "../search/queries";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { listEnvironmentObjects } from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const { run, tick, user, member, addCoOwner, published, friendsObject } = kit;

/** How a member is shown each owner they may see: name and page. */
async function shown(...owners: UserActor[]) {
  const rows = await db
    .selectFrom("app.profiles")
    .select(["user_id", "real_name"])
    .where(
      "user_id",
      "in",
      owners.map((owner) => owner.userId),
    )
    .execute();

  return rows
    .map((row) => ({
      realName: row.real_name,
      profileId: row.user_id,
      pictureId: null,
    }))
    .sort(
      (a, b) =>
        a.realName.localeCompare(b.realName, "nb") ||
        a.profileId.localeCompare(b.profileId),
    );
}

async function inEnvironment(
  actor: UserActor,
  environmentId: string,
  objectId: string,
) {
  const { objects } = await executeQuery(tick(), listEnvironmentObjects, {
    actor,
    input: { environmentId },
  });

  return objects.find((object) => object.objectId === objectId);
}

async function inFinn(actor: UserActor, objectId: string, title: string) {
  await db
    .updateTable("app.objects")
    .set({ title })
    .where("id", "=", objectId)
    .execute();
  await refreshSearchIndex(db, { objectIds: [objectId] });
  const { objects } = await executeQuery(tick(), searchObjects, {
    actor,
    input: { q: title },
  });

  return objects.find((object) => object.objectId === objectId);
}

const preview = (actor: UserActor, objectId: string, environmentId?: string) =>
  executeQuery(tick(), previewLoanRequest, {
    actor,
    input: { objectId, ...(environmentId ? { environmentId } : {}) },
  });

describe("owners on things in an environment (PS-ENV-015)", () => {
  it("names the owners who are members there, never a co-owner outside it or the viewer", async () => {
    const { admin, environmentId, owner, borrower, objectId } =
      await published();
    const outsider = await user();
    const coMember = await member(environmentId, admin);
    await addCoOwner(owner, objectId, outsider);
    await addCoOwner(owner, objectId, coMember);
    const expected = await shown(owner, coMember);

    expect(
      (await inEnvironment(borrower, environmentId, objectId))?.owners,
    ).toEqual(expected);
    expect(
      (
        await inFinn(
          borrower,
          objectId,
          `Eier${randomUUID().replaceAll("-", "")}`,
        )
      )?.owners,
    ).toEqual(expected);
    expect((await preview(borrower, objectId, environmentId)).owners).toEqual(
      expected,
    );

    const seenByCoOwner = await inEnvironment(
      coMember,
      environmentId,
      objectId,
    );
    expect(seenByCoOwner?.ownedByYou).toBe(true);
    expect(seenByCoOwner?.owners).toEqual(await shown(owner));
  });

  it("stops naming an owner who leaves the environment", async () => {
    const { admin, environmentId, owner, borrower, objectId } =
      await published();
    const coMember = await member(environmentId, admin);
    await addCoOwner(owner, objectId, coMember);

    await run(leaveEnvironment, coMember, { environmentId });

    expect(
      (await inEnvironment(borrower, environmentId, objectId))?.owners,
    ).toEqual(await shown(owner));
  });

  it("names nobody on a direct request between friends", async () => {
    const owner = await user();
    const friend = await user();
    const objectId = await friendsObject(owner, friend);

    expect((await preview(friend, objectId)).owners).toEqual([]);
  });
});

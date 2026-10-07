import { randomBytes, randomUUID } from "node:crypto";
import { responsibilityDeclarationVersion } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { approveLoanRequest } from "../loans/approval";
import { acceptResponsibility } from "../loans/commands";
import { previewLoanRequest, readLoan } from "../loans/queries";
import { archiveObject } from "../objects/commands";
import { type ImageStore, uploadObjectImage } from "../objects/images";
import { setObjectRestriction } from "../objects/restrictions";
import { refreshSearchIndex, searchIndexer } from "../search/indexer";
import { searchObjects } from "../search/queries";
import { blockUser, removeFriend } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  friendObjectImageFile,
  listFriendObjects,
  publishToFriends,
  withdrawFromFriends,
} from "./friends";
import { publishObject } from "./commands";
import { listObjectPublications } from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  user,
  create,
  addCoOwner,
  friends,
  friendsObject,
  showToFriends,
  ask,
  stored,
  eventsFor,
  environment,
  member,
} = kit;

const notFound = { code: "not_found" };
const conflict = { code: "conflict" };
const direct = { kind: "direct" };

const preview = (actor: UserActor, objectId: string) =>
  executeQuery(tick(), previewLoanRequest, { actor, input: { objectId } });

const profile = (actor: UserActor, owner: UserActor) =>
  executeQuery(tick(), listFriendObjects, {
    actor,
    input: { userId: owner.userId },
  });

const onProfile = async (actor: UserActor, owner: UserActor) =>
  (await profile(actor, owner)).objects.map((found) => found.objectId);

/** A word no other test uses, so the shared database cannot interfere. */
const word = () =>
  Array.from(randomBytes(12), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");

async function searchable(owner: UserActor, title: string) {
  const objectId = await create(owner);
  await db
    .updateTable("app.objects")
    .set({ title })
    .where("id", "=", objectId)
    .execute();

  return objectId;
}

async function search(actor: UserActor, input: object) {
  const { objects } = await executeQuery(tick(), searchObjects, {
    actor,
    input,
  });

  return objects;
}

describe("visibility for friends (PS-OBJ-020)", () => {
  it("is off until an owner turns it on, and only then can a friend ask directly", async () => {
    const owner = await user();
    const friend = await user();
    await friends(friend, owner);
    const objectId = await create(owner);

    await expect(preview(friend, objectId)).rejects.toMatchObject(notFound);
    await expect(ask(friend, objectId, direct)).rejects.toMatchObject(notFound);
    expect(await onProfile(friend, owner)).toEqual([]);
    expect(
      (
        await executeQuery(tick(), listObjectPublications, {
          actor: owner,
          input: { objectId },
        })
      ).friends,
    ).toBeNull();

    expect(await run(publishToFriends, owner, { objectId })).toEqual({
      objectId,
      visibleToFriends: true,
    });
    // Turning it on again changes nothing.
    await run(publishToFriends, owner, { objectId });

    expect((await preview(friend, objectId)).objectId).toBe(objectId);
    expect(await onProfile(friend, owner)).toEqual([objectId]);
    expect(
      (
        await executeQuery(tick(), listObjectPublications, {
          actor: owner,
          input: { objectId },
        })
      ).friends,
    ).toMatchObject({ publishedByUserId: owner.userId });
    expect(
      await stored((await ask(friend, objectId, direct)).requestId),
    ).toMatchObject({ status: "requested" });
    expect(
      (await eventsFor("object", objectId)).map((event) => event.event_type),
    ).toEqual(["object.created", "object.published_to_friends"]);
  });

  it("shows nothing to anyone who is not a friend of an owner", async () => {
    const owner = await user();
    const friend = await user();
    const stranger = await user();
    const objectId = await friendsObject(owner, friend);

    expect(await onProfile(stranger, owner)).toEqual([]);
    await expect(preview(stranger, objectId)).rejects.toMatchObject(notFound);
    await expect(ask(stranger, objectId, direct)).rejects.toMatchObject(
      notFound,
    );

    // A friend of a co-owner finds it too, on that co-owner's profile only
    // where they are friends.
    const coOwner = await user();
    const coOwnersFriend = await user();
    await addCoOwner(owner, objectId, coOwner);
    await friends(coOwnersFriend, coOwner);
    expect(await onProfile(coOwnersFriend, coOwner)).toEqual([objectId]);
    expect(await onProfile(coOwnersFriend, owner)).toEqual([]);
    expect((await preview(coOwnersFriend, objectId)).objectId).toBe(objectId);
  });

  it("hides the object while it takes no new loans, and from those blocked", async () => {
    const owner = await user();
    const friend = await user();
    const archived = await friendsObject(owner, friend);
    const frozen = await create(owner);
    await showToFriends(owner, frozen);
    const coOwner = await user();
    await addCoOwner(owner, frozen, coOwner);

    await run(archiveObject, owner, { objectId: archived });
    await run(blockUser, coOwner, { userId: owner.userId });

    expect(await onProfile(friend, owner)).toEqual([]);
    await expect(preview(friend, frozen)).rejects.toMatchObject(notFound);

    // Someone the owner blocks sees their profile as nobody's.
    const other = await user();
    await friendsObject(owner, other);
    await run(blockUser, owner, { userId: other.userId });
    await expect(profile(other, owner)).rejects.toMatchObject(notFound);
  });

  it("is a new commitment: not for an archived object or against another owner's veto", async () => {
    const owner = await user();
    const coOwner = await user();
    const stranger = await user();
    const objectId = await create(owner);
    await addCoOwner(owner, objectId, coOwner);

    await expect(
      run(publishToFriends, stranger, { objectId }),
    ).rejects.toMatchObject(notFound);

    await run(setObjectRestriction, coOwner, { objectId, period: null });
    await expect(
      run(publishToFriends, owner, { objectId }),
    ).rejects.toMatchObject(conflict);
    // The owner who set the veto can still publish.
    await run(publishToFriends, coOwner, { objectId });

    const archived = await create(owner);
    await run(archiveObject, owner, { objectId: archived });
    await expect(
      run(publishToFriends, owner, { objectId: archived }),
    ).rejects.toMatchObject(conflict);
  });

  it("ends open direct requests when it is turned off, and approved loans go on", async () => {
    const owner = await user();
    const friend = await user();
    const other = await user();
    const objectId = await friendsObject(owner, friend);
    await friends(other, owner);
    const environmentId = await environment(owner);
    const neighbour = await member(environmentId, owner);
    await run(publishObject, owner, { objectId, environmentId });

    const { requestId: approved } = await ask(friend, objectId, direct, {
      ...kit.dated(2, 3),
    });
    await run(acceptResponsibility, owner, {
      requestId: approved,
      declarationVersion: responsibilityDeclarationVersion,
    });
    const { loanId } = await run(approveLoanRequest, owner, {
      requestId: approved,
    });
    const { requestId: open } = await ask(other, objectId, direct, {
      ...kit.dated(10, 11),
    });
    const { requestId: throughEnvironment } = await ask(
      neighbour,
      objectId,
      kit.environmentOrigin(environmentId),
      kit.dated(20, 21),
    );

    expect(await run(withdrawFromFriends, owner, { objectId })).toEqual({
      objectId,
      visibleToFriends: false,
    });
    // Taking it back again changes nothing.
    await run(withdrawFromFriends, owner, { objectId });

    expect(await stored(open)).toMatchObject({
      status: "ended",
      end_reason: "publication_ended",
    });
    expect(await stored(throughEnvironment)).toMatchObject({
      status: "requested",
    });
    expect(
      (
        await executeQuery(tick(), readLoan, {
          actor: friend,
          input: { loanId },
        })
      ).status,
    ).toBe("reserved");
    await expect(ask(other, objectId, direct)).rejects.toMatchObject(notFound);
    expect(await onProfile(other, owner)).toEqual([]);
    expect(
      (await eventsFor("object", objectId))
        .map((event) => event.event_type)
        .filter((type) => type.includes("friends")),
    ).toEqual(["object.published_to_friends", "object.withdrawn_from_friends"]);
  });

  it("refuses a direct request in the database without it", async () => {
    const owner = await user();
    const friend = await user();
    await friends(friend, owner);
    const objectId = await create(owner);

    await expect(
      db
        .insertInto("app.loan_requests")
        .values({
          object_id: objectId,
          borrower_user_id: friend.userId,
          origin: "direct",
          desired_days: 3,
          message: "Kan jeg låne den?",
          terms_version: 1,
        })
        .execute(),
    ).rejects.toMatchObject({ code: "23001" });
  });

  it("goes with the friendship", async () => {
    const owner = await user();
    const friend = await user();
    const objectId = await friendsObject(owner, friend);
    const { requestId } = await ask(friend, objectId, direct);

    await run(removeFriend, owner, { userId: friend.userId });

    expect(await stored(requestId)).toMatchObject({ status: "ended" });
    expect(await onProfile(friend, owner)).toEqual([]);
    await expect(preview(friend, objectId)).rejects.toMatchObject(notFound);
  });
});

describe("friends' objects in Finn (PS-OBJ-020)", () => {
  it("finds them with the rest, and alone with the filter «Venner»", async () => {
    const term = word();
    const owner = await user();
    const friend = await user();
    const stranger = await user();
    const environmentId = await environment(owner);
    await kit.join(environmentId, owner, friend);
    const shared = await searchable(owner, `Stige ${term}`);
    await friends(friend, owner);
    await showToFriends(owner, shared);
    const inEnvironment = await searchable(owner, `Drill ${term}`);
    await run(publishObject, owner, { objectId: inEnvironment, environmentId });
    const both = await searchable(owner, `Sag ${term}`);
    await showToFriends(owner, both);
    await run(publishObject, owner, { objectId: both, environmentId });
    await refreshSearchIndex(db, {
      objectIds: [shared, inEnvironment, both],
    });

    const found = await search(friend, { q: term });
    expect(
      found.map(({ objectId, foundIn, foundThroughFriends }) => ({
        objectId,
        environments: foundIn.map((place) => place.environmentId),
        foundThroughFriends,
      })),
    ).toEqual(
      expect.arrayContaining([
        { objectId: shared, environments: [], foundThroughFriends: true },
        {
          objectId: inEnvironment,
          environments: [environmentId],
          foundThroughFriends: false,
        },
        {
          objectId: both,
          environments: [environmentId],
          foundThroughFriends: true,
        },
      ]),
    );
    expect(found).toHaveLength(3);

    for (const friendsOnly of [true, "true"]) {
      expect(
        (await search(friend, { q: term, friends: friendsOnly }))
          .map((object) => object.objectId)
          .sort(),
      ).toEqual([shared, both].sort());
    }
    expect(
      (await search(friend, { q: term, environmentId })).map(
        (object) => object.objectId,
      ),
    ).not.toContain(shared);
    // Objects have no place, so a search near one finds none through friends.
    expect(
      (
        await search(friend, {
          q: term,
          latitude: 59.9,
          longitude: 10.7,
          radiusKm: 10,
        })
      ).map((object) => object.objectId),
    ).not.toContain(shared);
    expect(await search(stranger, { q: term, friends: true })).toEqual([]);
    await expect(
      search(friend, { q: term, friends: true, environmentId }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("keeps the derived index up to date through the outbox", () => {
    const consumer = searchIndexer({ db: () => db });

    expect(consumer.eventTypes).toEqual(
      expect.arrayContaining([
        "object.published_to_friends",
        "object.withdrawn_from_friends",
      ]),
    );
  });
});

describe("images of friends' objects", () => {
  it("are read only by those who find the object through friends", async () => {
    const owner = await user();
    const friend = await user();
    const stranger = await user();
    const objectId = await friendsObject(owner, friend);
    const files = new Map<string, Uint8Array>();
    const store: ImageStore = {
      put: async (key, bytes) => {
        files.set(key, bytes);
      },
      get: async (key) => files.get(key) ?? null,
      remove: async (key) => {
        files.delete(key);
      },
    };
    const { imageId } = (
      await uploadObjectImage(
        tick(),
        {
          store,
          process: async (bytes) => ({
            bytes,
            contentType: "image/webp",
            width: 10,
            height: 10,
          }),
        },
        {
          actor: owner,
          objectId,
          bytes: new TextEncoder().encode(word()),
          idempotencyKey: randomUUID(),
        },
      )
    ).output;
    const read = (actor: UserActor) =>
      executeQuery(tick(), friendObjectImageFile, {
        actor,
        input: { objectId, imageId },
      });

    expect(await read(friend)).toMatchObject({ contentType: "image/webp" });
    expect((await profile(friend, owner)).objects[0]?.images).toEqual([
      { id: imageId, width: 10, height: 10 },
    ]);
    await expect(read(stranger)).rejects.toMatchObject(notFound);

    await run(withdrawFromFriends, owner, { objectId });
    await expect(read(friend)).rejects.toMatchObject(notFound);
  });
});

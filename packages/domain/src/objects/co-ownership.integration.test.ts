import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import { ConsumerRegistry } from "../outbox/consumer";
import { blockUser, liftUserBlock } from "../social/commands";
import { createTestUser } from "../testing/actors";
import { connectTestDatabase } from "../testing/database";
import { addDays, calendarDate } from "./availability";
import {
  acceptCoOwnerInvitation,
  declineCoOwnerInvitation,
  defineLeaveObject,
  inviteCoOwner,
  leaveObject,
  listCoOwnerInvitations,
  withdrawCoOwnerInvitation,
} from "./co-owners";
import { archiveObject, createObject, updateObject } from "./commands";
import type { ObjectCommitmentSource } from "./commitments";
import {
  consentToObjectDeletion,
  defineConsentToObjectDeletion,
  withdrawObjectDeletionConsent,
} from "./deletion";
import { getObjectHistory, revertObject } from "./history";
import {
  objectImageFileCleanup,
  type ObjectImageStore,
  uploadObjectImage,
} from "./images";
import { getObject, listOwnObjects } from "./queries";
import { liftObjectRestriction, setObjectRestriction } from "./restrictions";

const db = connectTestDatabase();
afterAll(() => db.destroy());

class MemoryStore implements ObjectImageStore {
  readonly files = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    this.files.set(key, bytes);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
}

const store = new MemoryStore();
const consumers = new ConsumerRegistry([
  objectImageFileCleanup({
    store: () => store,
    db: () => db,
    uploadGraceMs: 0,
  }),
]);
const domain: DomainContext = { db, consumers };
const images = {
  store,
  process: async (bytes: Uint8Array) => ({
    bytes,
    contentType: "image/webp" as const,
    width: 10,
    height: 10,
  }),
};

const today = calendarDate(new Date());
const user = () => createTestUser(db);

function run<I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: UserActor,
  input: object,
  idempotencyKey: string = randomUUID(),
): Promise<O> {
  return executeCommand(domain, command, { actor, input, idempotencyKey }).then(
    (result) => result.output,
  );
}

const read = (actor: UserActor, objectId: string) =>
  executeQuery(domain, getObject, { actor, input: { objectId } });

const invitationsOf = async (actor: UserActor) =>
  (await executeQuery(domain, listCoOwnerInvitations, { actor, input: {} }))
    .invitations;

const block = (blocker: UserActor, blocked: UserActor) =>
  run(blockUser, blocker, { userId: blocked.userId });

async function create(owner: UserActor) {
  return run(createObject, owner, {
    title: "Tilhenger",
    categoryId: "annet",
    description: "Liten tilhenger med presenning.",
    availability: [{ start: today, end: null }],
  });
}

const invite = (owner: UserActor, objectId: string, invited: UserActor) =>
  run(inviteCoOwner, owner, { objectId, userId: invited.userId });

/** An object owned by `owner` with every user in `others` as co-owner. */
async function coOwned(owner: UserActor, ...others: UserActor[]) {
  const { objectId } = await create(owner);

  for (const other of others) {
    const { invitationId } = await invite(owner, objectId, other);
    await run(acceptCoOwnerInvitation, other, { invitationId });
  }

  return objectId;
}

/** Same denial as for an object or account that does not exist. */
const notFound = { code: "not_found" };

describe("becoming a co-owner (PS-OBJ-007)", () => {
  it("needs an explicit acceptance, after which every owner has the same rights", async () => {
    const anna = await user();
    const bo = await user();
    const { objectId } = await create(anna);

    const { invitationId, status } = await invite(anna, objectId, bo);
    expect(status).toBe("pending");
    expect(
      (await invite(anna, objectId, bo)).invitationId,
      "inviting again returns the pending invitation",
    ).toBe(invitationId);

    // Invited is not owner: the object stays hidden until acceptance.
    await expect(read(bo, objectId)).rejects.toMatchObject(notFound);
    expect(await invitationsOf(bo)).toEqual([
      expect.objectContaining({
        id: invitationId,
        objectId,
        invitedByUserId: anna.userId,
        object: expect.objectContaining({ title: "Tilhenger" }),
      }),
    ]);
    expect((await read(anna, objectId)).pendingInvitations).toEqual([
      expect.objectContaining({ id: invitationId, userId: bo.userId }),
    ]);

    // Nobody but the invited user can answer.
    await expect(
      run(acceptCoOwnerInvitation, anna, { invitationId }),
    ).rejects.toMatchObject(notFound);

    expect(await run(acceptCoOwnerInvitation, bo, { invitationId })).toEqual({
      objectId,
    });
    const seenByBo = await read(bo, objectId);
    expect(seenByBo.owners.map((owner) => owner.userId)).toEqual([
      anna.userId,
      bo.userId,
    ]);
    expect(seenByBo.pendingInvitations).toEqual([]);
    expect(await invitationsOf(bo)).toEqual([]);
    expect(
      (await executeQuery(domain, listOwnObjects, { actor: bo, input: {} }))
        .objects,
    ).toEqual([expect.objectContaining({ id: objectId })]);

    // The new co-owner maintains the object like the first owner.
    await run(updateObject, bo, {
      objectId,
      expectedVersion: 1,
      title: "Tilhenger med lokk",
    });
    await run(archiveObject, bo, { objectId });
    expect((await read(anna, objectId)).status).toBe("archived");
  });

  it("refuses unknown and unregistered accounts alike, and existing owners", async () => {
    const anna = await user();
    const pending = await createTestUser(db, {
      accountStatus: "pending_registration",
    });
    const { objectId } = await create(anna);

    await expect(
      run(inviteCoOwner, anna, { objectId, userId: randomUUID() }),
    ).rejects.toMatchObject(notFound);
    await expect(invite(anna, objectId, pending)).rejects.toMatchObject(
      notFound,
    );
    await expect(invite(anna, objectId, anna)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("lets the invited user decline and an owner withdraw", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();
    const objectId = await coOwned(anna, cia);

    const declined = await invite(anna, objectId, bo);
    expect(
      await run(declineCoOwnerInvitation, bo, {
        invitationId: declined.invitationId,
      }),
    ).toEqual({ invitationId: declined.invitationId, status: "declined" });
    await expect(
      run(acceptCoOwnerInvitation, bo, { invitationId: declined.invitationId }),
    ).rejects.toMatchObject(notFound);

    // Any owner can withdraw, also one who did not send it.
    const withdrawn = await invite(anna, objectId, bo);
    await run(withdrawCoOwnerInvitation, cia, {
      objectId,
      invitationId: withdrawn.invitationId,
    });
    await expect(
      run(acceptCoOwnerInvitation, bo, {
        invitationId: withdrawn.invitationId,
      }),
    ).rejects.toMatchObject(notFound);
    expect((await read(anna, objectId)).owners).toHaveLength(2);
  });

  it("stays valid when the owner who sent it leaves", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();
    const objectId = await coOwned(anna, bo);
    const { invitationId } = await invite(anna, objectId, cia);

    await run(leaveObject, anna, { objectId });
    await run(acceptCoOwnerInvitation, cia, { invitationId });

    expect(
      (await read(cia, objectId)).owners.map((owner) => owner.userId),
    ).toEqual([bo.userId, cia.userId]);
  });
});

describe("blocks and co-ownership invitations (PS-USR-006)", () => {
  it("stops an invitation across a block with any owner, like an unknown account", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();
    const dag = await user();
    const objectId = await coOwned(anna, bo);

    await block(cia, anna);
    await expect(invite(anna, objectId, cia)).rejects.toMatchObject(notFound);

    // Dag blocks the other owner, not the one who invites.
    await block(bo, dag);
    await expect(invite(anna, objectId, dag)).rejects.toMatchObject(notFound);
  });

  it("closes a pending invitation when a block arises, and lifting it does not reopen it", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();
    const objectId = await coOwned(anna, bo);
    const { invitationId } = await invite(anna, objectId, cia);

    await block(cia, bo);
    expect(await invitationsOf(cia)).toEqual([]);
    expect((await read(anna, objectId)).pendingInvitations).toEqual([]);

    await run(liftUserBlock, cia, { userId: bo.userId });
    await expect(
      run(acceptCoOwnerInvitation, cia, { invitationId }),
    ).rejects.toMatchObject(notFound);
  });

  it("closes invitations to users the newly joined owner is blocked with", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();
    const { objectId } = await create(anna);
    const toBo = await invite(anna, objectId, bo);
    const toCia = await invite(anna, objectId, cia);

    // Neither owns the object yet, so the block itself closes nothing.
    await block(bo, cia);
    await run(acceptCoOwnerInvitation, bo, { invitationId: toBo.invitationId });

    await expect(
      run(acceptCoOwnerInvitation, cia, { invitationId: toCia.invitationId }),
    ).rejects.toMatchObject(notFound);
    expect(await invitationsOf(cia)).toEqual([]);
  });

  it("never lets an acceptance and a concurrent block both win", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const anna = await user();
      const bo = await user();
      const { objectId } = await create(anna);
      const { invitationId } = await invite(anna, objectId, bo);

      const [accepted] = await Promise.allSettled([
        run(acceptCoOwnerInvitation, bo, { invitationId }),
        block(anna, bo),
      ]);
      const owners = (await read(anna, objectId)).owners;

      if (accepted.status === "fulfilled") {
        // The block came second: it froze the co-owned object.
        expect(owners).toHaveLength(2);
        expect((await read(anna, objectId)).frozenForNewLoans).toBe(true);
      } else {
        expect(accepted.reason).toMatchObject(notFound);
        expect(owners).toHaveLength(1);
      }
    }
  });

  it("never lets two invited users who block each other both join", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const anna = await user();
      const bo = await user();
      const cia = await user();
      const { objectId } = await create(anna);
      const toBo = await invite(anna, objectId, bo);
      const toCia = await invite(anna, objectId, cia);
      await block(bo, cia);

      const results = await Promise.allSettled([
        run(acceptCoOwnerInvitation, bo, { invitationId: toBo.invitationId }),
        run(acceptCoOwnerInvitation, cia, {
          invitationId: toCia.invitationId,
        }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await read(anna, objectId)).owners).toHaveLength(2);
    }
  });
});

describe("restricting new commitments (PS-OBJ-008)", () => {
  it("blocks the period for new loans until the co-owner who set it withdraws it", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);
    const start = addDays(today, 10);
    const end = addDays(today, 19);

    const { restrictionId } = await run(setObjectRestriction, bo, {
      objectId,
      period: { start, end },
    });
    const restricted = await read(anna, objectId);
    expect(restricted.restrictions).toEqual([
      expect.objectContaining({
        id: restrictionId,
        setByUserId: bo.userId,
        period: { start, end },
      }),
    ]);
    expect(restricted.effectiveAvailability).toEqual([
      { start: today, end: addDays(start, -1) },
      { start: addDays(end, 1), end: null },
    ]);

    // Another owner can neither lift it nor reopen the period by editing.
    await expect(
      run(liftObjectRestriction, anna, { objectId, restrictionId }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await run(updateObject, anna, {
      objectId,
      expectedVersion: restricted.version,
      availability: [{ start: today, end: null }],
      description: "Ordinær redigering er fortsatt mulig.",
    });
    expect((await read(anna, objectId)).effectiveAvailability).toEqual(
      restricted.effectiveAvailability,
    );

    await run(liftObjectRestriction, bo, { objectId, restrictionId });
    const lifted = await read(anna, objectId);
    expect(lifted.restrictions).toEqual([]);
    expect(lifted.effectiveAvailability).toEqual([{ start: today, end: null }]);
  });

  it("can cover every date, and ends when its co-owner leaves", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);

    await run(setObjectRestriction, bo, { objectId, period: null });
    expect((await read(anna, objectId)).availableForNewLoans).toBe(false);

    await run(leaveObject, bo, { objectId });
    const after = await read(anna, objectId);
    expect(after.restrictions).toEqual([]);
    expect(after.availableForNewLoans).toBe(true);
  });

  it("is not visible to anyone but the owners", async () => {
    const anna = await user();
    const stranger = await user();
    const { objectId } = await create(anna);
    const { restrictionId } = await run(setObjectRestriction, anna, {
      objectId,
      period: null,
    });

    await expect(
      run(setObjectRestriction, stranger, { objectId, period: null }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(liftObjectRestriction, stranger, { objectId, restrictionId }),
    ).rejects.toMatchObject(notFound);
  });
});

describe("a block between co-owners (PS-OBJ-009)", () => {
  it("freezes new loans until the ownership is clarified to one owner", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);
    expect((await read(anna, objectId)).frozenForNewLoans).toBe(false);

    await block(bo, anna);
    const frozen = await read(anna, objectId);
    expect(frozen).toMatchObject({
      frozenForNewLoans: true,
      availableForNewLoans: false,
      effectiveAvailability: [],
    });

    // Lifting the block alone is not enough.
    await run(liftUserBlock, bo, { userId: anna.userId });
    expect((await read(bo, objectId)).frozenForNewLoans).toBe(true);

    // Editing still works; it is new loans that are frozen.
    await run(updateObject, anna, {
      objectId,
      expectedVersion: frozen.version,
      title: "Tilhenger, frosset",
    });

    await run(leaveObject, bo, { objectId });
    expect(await read(anna, objectId)).toMatchObject({
      frozenForNewLoans: false,
      availableForNewLoans: true,
    });
  });

  it("stays frozen while more than one owner remains", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();
    const objectId = await coOwned(anna, bo, cia);

    await block(anna, bo);
    await run(leaveObject, bo, { objectId });
    expect((await read(anna, objectId)).frozenForNewLoans).toBe(true);

    await run(leaveObject, cia, { objectId });
    expect((await read(anna, objectId)).frozenForNewLoans).toBe(false);
  });

  it("leaves objects without the other user untouched", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();
    const shared = await coOwned(anna, cia);

    await block(anna, bo);
    expect((await read(anna, shared)).frozenForNewLoans).toBe(false);
  });

  it("never leaves a sole owner frozen when leaving races a block", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const anna = await user();
      const bo = await user();
      const objectId = await coOwned(anna, bo);

      await Promise.all([run(leaveObject, bo, { objectId }), block(anna, bo)]);

      expect(await read(anna, objectId)).toMatchObject({
        owners: [expect.objectContaining({ userId: anna.userId })],
        frozenForNewLoans: false,
      });
    }
  });
});

describe("leaving co-ownership (PS-OBJ-010)", () => {
  it("removes only oneself and never the last owner", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);

    await run(leaveObject, bo, { objectId });
    await expect(read(bo, objectId)).rejects.toMatchObject(notFound);
    await expect(run(leaveObject, anna, { objectId })).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await read(anna, objectId)).owners).toHaveLength(1);
  });

  it("lets exactly one of two owners leave when both try at once", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);

    const results = await Promise.allSettled([
      run(leaveObject, anna, { objectId }),
      run(leaveObject, bo, { objectId }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });

  it("is refused while the co-owner is responsible for a commitment", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);
    const loansOf = (responsible: UserActor): ObjectCommitmentSource => ({
      name: "test_loans",
      load: async () => [{ responsibleOwnerId: responsible.userId }],
    });

    await expect(
      run(defineLeaveObject([loansOf(bo)]), bo, { objectId }),
    ).rejects.toMatchObject({ code: "conflict" });

    // A loan another owner is responsible for does not hold them back.
    await run(defineLeaveObject([loansOf(anna)]), bo, { objectId });
    expect((await read(anna, objectId)).owners).toHaveLength(1);
  });

  it("fails closed when a commitment source cannot answer", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);
    const broken: ObjectCommitmentSource = {
      name: "test_broken",
      load: async () => {
        throw new Error("unavailable");
      },
    };

    await expect(
      run(defineLeaveObject([broken]), bo, { objectId }),
    ).rejects.toThrow("unavailable");
    expect((await read(anna, objectId)).owners).toHaveLength(2);
  });
});

describe("permanent deletion (PS-OBJ-011)", () => {
  it("needs every owner's consent, and removes content and image files", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);
    const {
      output: { imageId },
    } = await uploadObjectImage(domain, images, {
      actor: anna,
      objectId,
      bytes: new TextEncoder().encode(`img-${randomUUID()}`),
      idempotencyKey: randomUUID(),
    });

    expect(await run(consentToObjectDeletion, anna, { objectId })).toEqual({
      objectId,
      deleted: false,
    });
    expect((await read(bo, objectId)).deletionConsents).toEqual([anna.userId]);

    // A consent can be withdrawn and given again.
    await run(withdrawObjectDeletionConsent, anna, { objectId });
    expect((await read(bo, objectId)).deletionConsents).toEqual([]);
    await run(consentToObjectDeletion, anna, { objectId });

    expect(await run(consentToObjectDeletion, bo, { objectId })).toEqual({
      objectId,
      deleted: true,
    });
    await expect(read(anna, objectId)).rejects.toMatchObject(notFound);
    for (const table of [
      "app.object_revisions",
      "app.object_owners",
      "app.object_availability_intervals",
    ] as const) {
      expect(
        await db
          .selectFrom(table)
          .select("object_id")
          .where("object_id", "=", objectId)
          .execute(),
      ).toEqual([]);
    }

    // The image file is deleted after commit, like a removed image's.
    const removal = await db
      .selectFrom("app.audit_events as event")
      .innerJoin(
        "app.outbox_messages as message",
        "message.event_id",
        "event.id",
      )
      .select(["event.payload", "message.consumer"])
      .where("event.resource_id", "=", objectId)
      .where("event.event_type", "=", "object.image_removed")
      .execute();
    expect(removal).toEqual([
      {
        payload: expect.objectContaining({ imageId }),
        consumer: "object_images.delete_file",
      },
    ]);
  });

  it("deletes a sole owner's object on their own consent", async () => {
    const anna = await user();
    const { objectId } = await create(anna);

    expect(await run(consentToObjectDeletion, anna, { objectId })).toEqual({
      objectId,
      deleted: true,
    });
  });

  it("requires a new co-owner's consent, and drops a leaving owner's", async () => {
    const anna = await user();
    const bo = await user();
    const cia = await user();
    const objectId = await coOwned(anna, bo);

    await run(consentToObjectDeletion, bo, { objectId });
    await run(leaveObject, bo, { objectId });
    expect((await read(anna, objectId)).deletionConsents).toEqual([]);

    await run(consentToObjectDeletion, anna, { objectId }).then((result) =>
      expect(result.deleted).toBe(true),
    );

    const other = await coOwned(anna, bo);
    await run(consentToObjectDeletion, anna, { objectId: other });
    const { invitationId } = await invite(anna, other, cia);
    await run(acceptCoOwnerInvitation, cia, { invitationId });
    expect(
      (await run(consentToObjectDeletion, bo, { objectId: other })).deleted,
    ).toBe(false);
  });

  it("is refused while the object has a commitment", async () => {
    const anna = await user();
    const { objectId } = await create(anna);
    const loan: ObjectCommitmentSource = {
      name: "test_loans",
      load: async () => [{ responsibleOwnerId: anna.userId }],
    };

    await expect(
      run(defineConsentToObjectDeletion([loan]), anna, { objectId }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await read(anna, objectId)).deletionConsents).toEqual([]);
  });

  it("deletes exactly once when the last two owners consent at the same time", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);

    const results = await Promise.all([
      run(consentToObjectDeletion, anna, { objectId }),
      run(consentToObjectDeletion, bo, { objectId }),
    ]);

    expect(results.map((result) => result.deleted).sort()).toEqual([
      false,
      true,
    ]);
    await expect(read(anna, objectId)).rejects.toMatchObject(notFound);
  });
});

describe("traceable changes (PS-OBJ-012, PS-OBJ-013)", () => {
  const history = (
    actor: UserActor,
    objectId: string,
    beforeVersion?: number,
  ) =>
    executeQuery(domain, getObjectHistory, {
      actor,
      input: { objectId, beforeVersion },
    });

  it("records actor, time and content for every version", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);

    await run(updateObject, bo, {
      objectId,
      expectedVersion: 1,
      description: "Ny beskrivelse.",
      availability: [{ start: today, end: addDays(today, 30) }],
    });

    const { revisions, nextBeforeVersion } = await history(anna, objectId);
    expect(nextBeforeVersion).toBeNull();
    expect(revisions).toEqual([
      expect.objectContaining({
        version: 2,
        change: "updated",
        actorUserId: bo.userId,
        changedFields: ["description", "availability"],
        content: expect.objectContaining({
          title: "Tilhenger",
          description: "Ny beskrivelse.",
          availability: [{ start: today, end: addDays(today, 30) }],
        }),
      }),
      expect.objectContaining({
        version: 1,
        change: "created",
        actorUserId: anna.userId,
        content: expect.objectContaining({
          description: "Liten tilhenger med presenning.",
        }),
      }),
    ]);
  });

  it("brings back earlier content as a new version, keeping later history", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);
    await run(updateObject, anna, {
      objectId,
      expectedVersion: 1,
      title: "Feil tittel",
      availability: [],
    });

    // A revert based on an old version is refused like any edit.
    await expect(
      run(revertObject, bo, { objectId, version: 1, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      run(revertObject, bo, { objectId, version: 2, expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "invalid_input", fields: ["version"] });

    expect(
      await run(revertObject, bo, { objectId, version: 1, expectedVersion: 2 }),
    ).toEqual({ objectId, version: 3 });

    const object = await read(anna, objectId);
    expect(object).toMatchObject({
      title: "Tilhenger",
      availability: [{ start: today, end: null }],
      version: 3,
    });
    const { revisions } = await history(bo, objectId);
    expect(revisions.map((r) => [r.version, r.change])).toEqual([
      [3, "reverted"],
      [2, "updated"],
      [1, "created"],
    ]);
    expect(revisions[0]).toMatchObject({
      revertedToVersion: 1,
      actorUserId: bo.userId,
      changedFields: ["title", "availability"],
    });
  });

  it("cannot reopen a restricted period by reverting", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);
    await run(setObjectRestriction, bo, { objectId, period: null });
    await run(updateObject, bo, {
      objectId,
      expectedVersion: 1,
      availability: [],
    });

    await run(revertObject, anna, { objectId, version: 1, expectedVersion: 2 });
    expect((await read(anna, objectId)).availableForNewLoans).toBe(false);
  });

  it("pages through long histories", async () => {
    const anna = await user();
    const { objectId } = await create(anna);

    for (let version = 1; version <= 51; version += 1) {
      await run(updateObject, anna, {
        objectId,
        expectedVersion: version,
        title: `Tilhenger ${version}`,
      });
    }

    const first = await history(anna, objectId);
    expect(first.revisions).toHaveLength(50);
    expect(first.nextBeforeVersion).toBe(3);
    const rest = await history(
      anna,
      objectId,
      first.nextBeforeVersion as number,
    );
    expect(rest.revisions.map((r) => r.version)).toEqual([2, 1]);
    expect(rest.nextBeforeVersion).toBeNull();
  });

  it("keeps optimistic concurrency between co-owners: one edit wins, the other conflicts", async () => {
    const anna = await user();
    const bo = await user();
    const objectId = await coOwned(anna, bo);

    const results = await Promise.allSettled([
      run(updateObject, anna, { objectId, expectedVersion: 1, title: "Anna" }),
      run(updateObject, bo, { objectId, expectedVersion: 1, title: "Bo" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "conflict" },
    });
    expect((await history(anna, objectId)).revisions).toHaveLength(2);
  });

  it("is only visible to the owners", async () => {
    const anna = await user();
    const stranger = await user();
    const { objectId } = await create(anna);

    await expect(history(stranger, objectId)).rejects.toMatchObject(notFound);
    await expect(
      run(revertObject, stranger, { objectId, version: 1, expectedVersion: 1 }),
    ).rejects.toMatchObject(notFound);
  });
});

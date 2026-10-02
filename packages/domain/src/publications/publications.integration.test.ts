import { randomUUID } from "node:crypto";
import type { CreateEnvironment, PublicationStatus } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { type Actor, systemActor, type UserActor } from "../actor";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import {
  releaseDepartedUser,
  startEnvironmentWindDown,
} from "../environment/continuity-commands";
import {
  createEnvironment,
  updateRequirements,
} from "../environment/environment-commands";
import {
  acceptInvitation,
  inviteMember,
  joinEnvironment,
  leaveEnvironment,
} from "../environment/membership-commands";
import {
  accountLifecycleProcess,
  typeChangeProcess,
} from "../environment/policies";
import { typeChangeDays } from "../environment/privacy";
import { findCurrentMembership, passivate } from "../environment/store";
import {
  changeEnvironmentType,
  concludeTypeChanges,
  respondToTypeChange,
} from "../environment/type-change-commands";
import {
  acceptRoleInvitation,
  inviteAdministrator,
} from "../environment/role-commands";
import { EventRecorder } from "../events/recorder";
import { calendarDate } from "../objects/availability";
import {
  acceptCoOwnerInvitation,
  inviteCoOwner,
  leaveObject,
} from "../objects/co-owners";
import { archiveObject, createObject } from "../objects/commands";
import { type ObjectImageStore, uploadObjectImage } from "../objects/images";
import { getObject } from "../objects/queries";
import {
  liftObjectRestriction,
  setObjectRestriction,
} from "../objects/restrictions";
import { ConsumerRegistry } from "../outbox/consumer";
import { blockUser, liftUserBlock } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { startTestVote, testVoteDays } from "../testing/type-changes";
import {
  approvePublication,
  blockPublication,
  publishObject,
  rejectPublication,
  setObjectApproval,
  unblockPublication,
  withdrawPublication,
} from "./commands";
import { loadPublicationGate } from "./gate";
import {
  listEnvironmentObjects,
  listEnvironmentPublications,
  listObjectPublications,
  readPublishedObjectImage,
} from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());

// Tests move the clock past transition deadlines.
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

/** The actor after a fresh e-mail code, for actions that need one. */
const fresh = (actor: UserActor): UserActor => ({
  ...actor,
  authentication: {
    ...actor.authentication,
    methods: [{ method: "otp", at: clock }],
  },
});

/** Runs a command at the clock's current moment, without moving it. */
function runNow<I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: object,
  idempotencyKey: string = randomUUID(),
): Promise<O> {
  return executeCommand(domain, command, {
    actor: actor.kind === "user" ? fresh(actor) : actor,
    input,
    ...(command.idempotency === "none" ? {} : { idempotencyKey }),
  }).then((result) => result.output);
}

function run<I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: object,
  idempotencyKey: string = randomUUID(),
): Promise<O> {
  tick();
  return runNow(command, actor, input, idempotencyKey);
}

const user = async () => (await registerTestUser(domain)).actor;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };

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

async function environment(
  owner: UserActor,
  input: Partial<CreateEnvironment> = {},
) {
  const { environmentId } = await run(createEnvironment, owner, {
    name: "Borettslaget",
    type: "open",
    ...input,
  });

  return environmentId;
}

/** Makes `actor` an active member: joining an open environment, invited otherwise. */
async function join(environmentId: string, admin: UserActor, actor: UserActor) {
  const type = (
    await db
      .selectFrom("app.environments")
      .select("type")
      .where("id", "=", environmentId)
      .executeTakeFirstOrThrow()
  ).type;

  if (type === "open") {
    await run(joinEnvironment, actor, { environmentId, answers: [] });
  } else {
    await run(inviteMember, admin, { environmentId, userId: actor.userId });
    await run(acceptInvitation, actor, { environmentId, answers: [] });
  }

  return actor;
}

async function member(environmentId: string, admin: UserActor) {
  return join(environmentId, admin, await user());
}

async function makeAdministrator(
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

async function create(owner: UserActor) {
  const { objectId } = await run(createObject, owner, {
    title: "Tilhenger",
    categoryId: "annet",
    description: "Liten tilhenger med presenning.",
    availability: [{ start: calendarDate(clock), end: null }],
  });

  return objectId;
}

/** An object owned by `owner` with every user in `others` as co-owner. */
async function coOwned(owner: UserActor, ...others: UserActor[]) {
  const objectId = await create(owner);

  for (const other of others) {
    const { invitationId } = await run(inviteCoOwner, owner, {
      objectId,
      userId: other.userId,
    });
    await run(acceptCoOwnerInvitation, other, { invitationId });
  }

  return objectId;
}

const publish = (actor: UserActor, objectId: string, environmentId: string) =>
  run(publishObject, actor, { objectId, environmentId });

const decide = (
  command:
    | typeof approvePublication
    | typeof rejectPublication
    | typeof blockPublication
    | typeof unblockPublication,
  actor: UserActor,
  environmentId: string,
  publicationId: string,
) => run(command, actor, { environmentId, publicationId });

/** The object ids an actor finds in the environment. */
async function found(actor: UserActor, environmentId: string) {
  const { objects } = await executeQuery(tick(), listEnvironmentObjects, {
    actor,
    input: { environmentId },
  });

  return objects.map((object) => object.objectId);
}

const publicationsOf = async (actor: UserActor, objectId: string) =>
  (
    await executeQuery(tick(), listObjectPublications, {
      actor,
      input: { objectId },
    })
  ).publications;

async function statusOf(publicationId: string) {
  const row = await db
    .selectFrom("app.environment_publications")
    .select(["status", "end_reason"])
    .where("id", "=", publicationId)
    .executeTakeFirstOrThrow();

  return { status: row.status as PublicationStatus, endReason: row.end_reason };
}

/** Gives the object an image; returns how an actor reads it in the environment. */
async function withImage(
  owner: UserActor,
  objectId: string,
  environmentId: string,
) {
  const { imageId } = (
    await uploadObjectImage(
      domain,
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
        bytes: new TextEncoder().encode(`img-${randomUUID()}`),
        idempotencyKey: randomUUID(),
      },
    )
  ).output;

  return (actor: UserActor) =>
    readPublishedObjectImage(domain, store, {
      actor,
      input: { environmentId, objectId, imageId },
    });
}

const gateOf = (objectId: string, environmentId: string) =>
  loadPublicationGate(db, { objectId, environmentId }, clock);

/** An open environment with its owner and one ordinary member. */
async function openEnvironment(input: Partial<CreateEnvironment> = {}) {
  const admin = await user();
  const environmentId = await environment(admin, input);
  const viewer = await member(environmentId, admin);

  return { admin, environmentId, viewer };
}

describe("publishing in an environment (PS-OBJ-006)", () => {
  it("is a separate relation: the object is found there, and stays itself", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    const before = await executeQuery(domain, getObject, {
      actor: anna,
      input: { objectId },
    });

    expect(await found(viewer, environmentId)).not.toContain(objectId);

    const { publicationId, status } = await publish(
      anna,
      objectId,
      environmentId,
    );
    expect(status).toBe("active");
    expect(await found(viewer, environmentId)).toContain(objectId);
    expect(
      await publish(anna, objectId, environmentId),
      "publishing again returns the same publication",
    ).toEqual({ publicationId, status: "active" });

    const after = await executeQuery(domain, getObject, {
      actor: anna,
      input: { objectId },
    });
    expect(after.version).toBe(before.version);

    const [listed] = (
      await executeQuery(domain, listEnvironmentObjects, {
        actor: viewer,
        input: { environmentId },
      })
    ).objects.filter((object) => object.objectId === objectId);
    expect(listed).toMatchObject({
      publicationId,
      title: "Tilhenger",
      availableForNewLoans: true,
      ownedByYou: false,
    });
    expect(Object.keys(listed ?? {})).not.toContain("owners");
  });

  it("needs the owner's own active access, and is invisible to everyone else", async () => {
    const { admin, environmentId } = await openEnvironment();
    const outsider = await user();
    const objectId = await create(outsider);
    const hiddenOwner = await user();
    const hidden = await environment(hiddenOwner, { type: "hidden" });

    await expect(
      publish(outsider, objectId, environmentId),
      "not a member",
    ).rejects.toMatchObject(forbidden);
    await expect(
      publish(outsider, objectId, hidden),
      "a hidden environment does not exist for outsiders",
    ).rejects.toMatchObject(notFound);
    await expect(
      publish(admin, objectId, environmentId),
      "not the owner",
    ).rejects.toMatchObject(notFound);
    await expect(
      executeQuery(domain, listEnvironmentObjects, {
        actor: outsider,
        input: { environmentId },
      }),
      "only members find objects",
    ).rejects.toMatchObject(forbidden);
    await expect(
      executeQuery(domain, listEnvironmentObjects, {
        actor: outsider,
        input: { environmentId: hidden },
      }),
    ).rejects.toMatchObject(notFound);
  });

  it("has an independent status in every environment (PS-OBJ-017)", async () => {
    const anna = await user();
    const first = await openEnvironment({ type: "closed" });
    const second = await openEnvironment();
    await join(first.environmentId, first.admin, anna);
    await join(second.environmentId, second.admin, anna);
    const objectId = await create(anna);

    const inFirst = await publish(anna, objectId, first.environmentId);
    const inSecond = await publish(anna, objectId, second.environmentId);
    await decide(
      rejectPublication,
      first.admin,
      first.environmentId,
      inFirst.publicationId,
    );

    expect(await statusOf(inFirst.publicationId)).toMatchObject({
      status: "rejected",
    });
    expect(await statusOf(inSecond.publicationId)).toMatchObject({
      status: "active",
    });
    expect(await found(second.viewer, second.environmentId)).toContain(
      objectId,
    );
    expect(
      (
        await executeQuery(domain, getObject, {
          actor: anna,
          input: { objectId },
        })
      ).availableForNewLoans,
      "a local rejection is no global block",
    ).toBe(true);

    const publications = await publicationsOf(anna, objectId);
    expect(publications.map((p) => [p.environment?.id, p.status])).toEqual(
      expect.arrayContaining([
        [first.environmentId, "rejected"],
        [second.environmentId, "active"],
      ]),
    );
  });

  it("is refused for archived objects", async () => {
    const { admin, environmentId } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    await run(archiveObject, anna, { objectId });

    await expect(publish(anna, objectId, environmentId)).rejects.toMatchObject(
      conflict,
    );
  });

  it("can be withdrawn by any owner, also from an environment they cannot see", async () => {
    const owner = await user();
    const hidden = await environment(owner, { type: "hidden" });
    const anna = await member(hidden, owner);
    const bo = await user();
    const objectId = await coOwned(anna, bo);
    const { publicationId } = await publish(anna, objectId, hidden);

    const [seenByBo] = await publicationsOf(bo, objectId);
    expect(seenByBo).toMatchObject({
      id: publicationId,
      status: "active",
      environment: null,
      publishedByUserId: null,
    });
    expect(
      (await publicationsOf(anna, objectId))[0]?.environment?.id,
      "the member sees where",
    ).toBe(hidden);

    expect(
      await run(withdrawPublication, bo, { objectId, publicationId }),
    ).toEqual({ publicationId, status: "unpublished" });
    expect(await statusOf(publicationId)).toEqual({
      status: "unpublished",
      endReason: "withdrawn",
    });
    expect(
      await run(withdrawPublication, anna, { objectId, publicationId }),
      "withdrawing again changes nothing",
    ).toEqual({ publicationId, status: "unpublished" });

    const stranger = await user();
    await expect(
      run(withdrawPublication, stranger, { objectId, publicationId }),
    ).rejects.toMatchObject(notFound);
  });
});

describe("approval in the environment (PS-ENV-011)", () => {
  it("starts new publications as pending until an administrator approves", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    await run(setObjectApproval, admin, { environmentId, required: true });
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);

    const { publicationId, status } = await publish(
      anna,
      objectId,
      environmentId,
    );
    expect(status).toBe("pending");
    expect(await found(viewer, environmentId)).not.toContain(objectId);
    expect((await gateOf(objectId, environmentId)).gate).toBe("on_hold");

    const { publications } = await executeQuery(
      domain,
      listEnvironmentPublications,
      { actor: admin, input: { environmentId, status: "pending" } },
    );
    expect(publications.map((p) => p.id)).toEqual([publicationId]);

    await expect(
      decide(approvePublication, viewer, environmentId, publicationId),
      "ordinary members do not decide",
    ).rejects.toMatchObject(forbidden);
    expect(
      await decide(approvePublication, admin, environmentId, publicationId),
    ).toEqual({ publicationId, status: "active" });
    expect(await found(viewer, environmentId)).toContain(objectId);
    expect((await gateOf(objectId, environmentId)).gate).toBe("open");
  });

  it("never lets an administrator decide on their own object", async () => {
    const { admin, environmentId } = await openEnvironment();
    await run(setObjectApproval, admin, { environmentId, required: true });
    const objectId = await create(admin);
    const { publicationId } = await publish(admin, objectId, environmentId);

    await expect(
      decide(approvePublication, admin, environmentId, publicationId),
    ).rejects.toMatchObject({ code: "conflict_of_interest" });

    const other = await makeAdministrator(
      environmentId,
      admin,
      await member(environmentId, admin),
    );
    expect(
      await decide(approvePublication, other, environmentId, publicationId),
    ).toMatchObject({ status: "active" });
  });

  it("pauses existing publications when turned on, and releases only them when turned off", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const [waiting, rejected, blocked] = [
      await create(anna),
      await create(anna),
      await create(anna),
    ];
    const ids = [];
    for (const objectId of [waiting, rejected, blocked]) {
      ids.push((await publish(anna, objectId, environmentId)).publicationId);
    }
    const [waitingId, rejectedId, blockedId] = ids as [string, string, string];
    await decide(rejectPublication, admin, environmentId, rejectedId);
    await decide(blockPublication, admin, environmentId, blockedId);

    expect(
      await run(setObjectApproval, admin, { environmentId, required: true }),
    ).toEqual({ required: true, changed: 1 });
    expect(await statusOf(waitingId)).toMatchObject({ status: "pending" });
    expect(await found(viewer, environmentId)).not.toContain(waiting);
    expect(
      await run(setObjectApproval, admin, { environmentId, required: true }),
      "setting the same value changes nothing",
    ).toEqual({ required: true, changed: 0 });

    expect(
      await run(setObjectApproval, admin, { environmentId, required: false }),
    ).toEqual({ required: false, changed: 1 });
    expect(await statusOf(waitingId)).toMatchObject({ status: "active" });
    expect(await statusOf(rejectedId)).toMatchObject({ status: "rejected" });
    expect(await statusOf(blockedId)).toMatchObject({ status: "blocked" });
    expect(await found(viewer, environmentId)).toContain(waiting);
  });

  it("keeps a rejection until an administrator changes it", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    const { publicationId } = await publish(anna, objectId, environmentId);

    await decide(rejectPublication, admin, environmentId, publicationId);
    expect(await found(viewer, environmentId)).not.toContain(objectId);
    expect((await gateOf(objectId, environmentId)).gate).toBe("closed");
    await expect(
      publish(anna, objectId, environmentId),
      "publishing again does not undo it",
    ).rejects.toMatchObject(conflict);
    await expect(
      run(withdrawPublication, anna, { objectId, publicationId }),
      "nor does withdrawing",
    ).rejects.toMatchObject(conflict);

    expect(
      await decide(approvePublication, admin, environmentId, publicationId),
    ).toEqual({ publicationId, status: "active" });
    expect(await found(viewer, environmentId)).toContain(objectId);
  });

  it("returns a lifted block to where a new publication would start", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    const { publicationId } = await publish(anna, objectId, environmentId);

    await decide(blockPublication, admin, environmentId, publicationId);
    expect(await found(viewer, environmentId)).not.toContain(objectId);
    await expect(
      decide(approvePublication, admin, environmentId, publicationId),
      "approval does not lift a block",
    ).rejects.toMatchObject(conflict);

    await run(setObjectApproval, admin, { environmentId, required: true });
    expect(
      await decide(unblockPublication, admin, environmentId, publicationId),
    ).toEqual({ publicationId, status: "pending" });
  });
});

describe("losing access (PS-OBJ-006)", () => {
  it("ends the publication when the last owner with access leaves, not before", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const bo = await member(environmentId, admin);
    const objectId = await coOwned(anna, bo);
    const { publicationId } = await publish(anna, objectId, environmentId);

    await run(leaveEnvironment, anna, { environmentId });
    expect(await statusOf(publicationId)).toMatchObject({ status: "active" });
    expect(await found(viewer, environmentId)).toContain(objectId);

    await run(leaveObject, bo, { objectId });
    expect(await statusOf(publicationId)).toEqual({
      status: "unpublished",
      endReason: "access_lost",
    });
    expect(await found(viewer, environmentId)).not.toContain(objectId);
    expect((await gateOf(objectId, environmentId)).gate).toBe("closed");
    expect(
      (
        await executeQuery(domain, getObject, {
          actor: anna,
          input: { objectId },
        })
      ).status,
      "the object itself is untouched",
    ).toBe("active");
  });

  it("hides the object as soon as a transition period runs out, and ends it once recorded", async () => {
    const { admin, environmentId } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    const { publicationId } = await publish(anna, objectId, environmentId);

    await run(updateRequirements, admin, {
      environmentId,
      requirements: [{ kind: "acceptance", text: "Husordensregler" }],
      expectedRevision: 0,
    });
    passDays(15);

    // Nothing has recorded the lapse yet, but the gate already sees it.
    expect(await statusOf(publicationId)).toMatchObject({ status: "active" });
    expect((await gateOf(objectId, environmentId)).gate).toBe("closed");

    const lapsed = await findCurrentMembership(db, environmentId, anna.userId);
    await db.transaction().execute(async (tx) => {
      await passivate(tx, lapsed ? [lapsed] : [], clock, new EventRecorder());
    });
    expect(await statusOf(publicationId)).toEqual({
      status: "unpublished",
      endReason: "access_lost",
    });
  });

  it("keeps a rejection as a standing decision when access is lost", async () => {
    const { admin, environmentId } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    const { publicationId } = await publish(anna, objectId, environmentId);
    await decide(rejectPublication, admin, environmentId, publicationId);

    await run(leaveEnvironment, anna, { environmentId });
    expect(await statusOf(publicationId)).toMatchObject({ status: "rejected" });
  });

  it("ends a blocked publication when the block is lifted without access", async () => {
    const { admin, environmentId } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    const { publicationId } = await publish(anna, objectId, environmentId);
    await decide(blockPublication, admin, environmentId, publicationId);
    await run(leaveEnvironment, anna, { environmentId });

    expect(
      await decide(unblockPublication, admin, environmentId, publicationId),
    ).toEqual({ publicationId, status: "unpublished" });
    expect(await statusOf(publicationId)).toEqual({
      status: "unpublished",
      endReason: "access_lost",
    });
  });
});

describe("co-ownership and blocks", () => {
  it("lets another owner's veto on every date stop new publications (PS-OBJ-008)", async () => {
    const { admin, environmentId } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const bo = await member(environmentId, admin);
    const objectId = await coOwned(anna, bo);

    const { restrictionId: dates } = await run(setObjectRestriction, bo, {
      objectId,
      period: { start: calendarDate(clock), end: calendarDate(clock) },
    });
    const { restrictionId: all } = await run(setObjectRestriction, bo, {
      objectId,
      period: null,
    });

    await expect(publish(anna, objectId, environmentId)).rejects.toMatchObject(
      conflict,
    );

    await run(liftObjectRestriction, bo, { objectId, restrictionId: all });
    expect(
      (await publish(anna, objectId, environmentId)).status,
      "a veto on some dates does not stop publication",
    ).toBe("active");
    await run(liftObjectRestriction, bo, { objectId, restrictionId: dates });
  });

  it("hides a frozen object and stops new publications (PS-OBJ-009)", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    const other = await openEnvironment();
    const anna = await member(environmentId, admin);
    const bo = await member(environmentId, admin);
    await join(other.environmentId, other.admin, anna);
    const objectId = await coOwned(anna, bo);
    await publish(anna, objectId, environmentId);

    await run(blockUser, anna, { userId: bo.userId });
    expect(await found(viewer, environmentId)).not.toContain(objectId);
    await expect(
      publish(anna, objectId, other.environmentId),
    ).rejects.toMatchObject(conflict);

    await run(liftUserBlock, anna, { userId: bo.userId });
    expect(
      await found(viewer, environmentId),
      "lifting the block does not end the freeze",
    ).not.toContain(objectId);
  });

  it("never shows an object to someone its owner has blocked, either way (PS-USR-006)", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    await publish(anna, objectId, environmentId);
    const readImage = await withImage(anna, objectId, environmentId);

    expect((await readImage(viewer)).contentType).toBe("image/webp");

    await run(blockUser, viewer, { userId: anna.userId });
    expect(await found(viewer, environmentId)).not.toContain(objectId);
    await expect(readImage(viewer)).rejects.toMatchObject(notFound);

    await run(liftUserBlock, viewer, { userId: anna.userId });
    await run(blockUser, anna, { userId: viewer.userId });
    expect(await found(viewer, environmentId)).not.toContain(objectId);

    const outsider = await user();
    await expect(readImage(outsider)).rejects.toMatchObject(notFound);
  });
});

describe("winding down (PS-ENV-012)", () => {
  it("takes no new publications and shows nothing while winding down", async () => {
    const { admin, environmentId, viewer } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const objectId = await create(anna);
    const later = await create(anna);
    await publish(anna, objectId, environmentId);

    await run(startEnvironmentWindDown, admin, { environmentId });
    await expect(publish(anna, later, environmentId)).rejects.toMatchObject(
      conflict,
    );
    expect(await found(viewer, environmentId)).toEqual([]);
    expect((await gateOf(objectId, environmentId)).gate).toBe("closed");
  });

  it("ends pending and active publications when final, and keeps decisions", async () => {
    const admin = await user();
    const environmentId = await environment(admin);
    const anna = await member(environmentId, admin);
    const [shown, rejected] = [await create(anna), await create(anna)];
    const { publicationId: shownId } = await publish(
      anna,
      shown,
      environmentId,
    );
    const { publicationId: rejectedId } = await publish(
      anna,
      rejected,
      environmentId,
    );
    await decide(rejectPublication, admin, environmentId, rejectedId);

    // The sole administrator's account goes away: final at once.
    await run(releaseDepartedUser, systemActor(accountLifecycleProcess), {
      userId: admin.userId,
    });

    expect(await statusOf(shownId)).toEqual({
      status: "unpublished",
      endReason: "environment_wound_down",
    });
    expect(await statusOf(rejectedId)).toMatchObject({ status: "rejected" });
  });
});

describe("concurrency", () => {
  it("ends the publication when the last two owners with access lose it at once", async () => {
    for (let round = 0; round < 5; round++) {
      const { admin, environmentId } = await openEnvironment();
      const anna = await member(environmentId, admin);
      const bo = await member(environmentId, admin);
      const objectId = await coOwned(anna, bo);
      const { publicationId } = await publish(anna, objectId, environmentId);

      await Promise.all([
        run(leaveEnvironment, anna, { environmentId }),
        run(leaveObject, bo, { objectId }),
      ]);

      expect(await statusOf(publicationId)).toEqual({
        status: "unpublished",
        endReason: "access_lost",
      });
    }
  });

  it("never lets a publication slip past approval being turned on", async () => {
    for (let round = 0; round < 5; round++) {
      const { admin, environmentId } = await openEnvironment();
      const anna = await member(environmentId, admin);
      const objectId = await create(anna);

      const [published] = await Promise.all([
        publish(anna, objectId, environmentId),
        run(setObjectApproval, admin, { environmentId, required: true }),
      ]);

      expect(await statusOf(published.publicationId)).toMatchObject({
        status: "pending",
      });
    }
  });

  it("never releases a rejection while approval is being turned off", async () => {
    for (let round = 0; round < 5; round++) {
      const { admin, environmentId } = await openEnvironment();
      const anna = await member(environmentId, admin);
      await run(setObjectApproval, admin, { environmentId, required: true });
      const { publicationId } = await publish(
        anna,
        await create(anna),
        environmentId,
      );

      await Promise.all([
        decide(rejectPublication, admin, environmentId, publicationId),
        run(setObjectApproval, admin, { environmentId, required: false }),
      ]);

      expect(await statusOf(publicationId)).toMatchObject({
        status: "rejected",
      });
    }
  });

  it("never lets a concurrent approval lift a block", async () => {
    for (let round = 0; round < 5; round++) {
      const { admin, environmentId } = await openEnvironment();
      const anna = await member(environmentId, admin);
      const other = await makeAdministrator(
        environmentId,
        admin,
        await member(environmentId, admin),
      );
      await run(setObjectApproval, admin, { environmentId, required: true });
      const { publicationId } = await publish(
        anna,
        await create(anna),
        environmentId,
      );

      await Promise.allSettled([
        decide(approvePublication, other, environmentId, publicationId),
        decide(blockPublication, admin, environmentId, publicationId),
      ]);

      expect(await statusOf(publicationId)).toMatchObject({
        status: "blocked",
      });
    }
  });

  it("keeps one current publication when two owners publish at once", async () => {
    const { admin, environmentId } = await openEnvironment();
    const anna = await member(environmentId, admin);
    const bo = await member(environmentId, admin);
    const objectId = await coOwned(anna, bo);

    const results = await Promise.all([
      publish(anna, objectId, environmentId),
      publish(bo, objectId, environmentId),
    ]);

    expect(new Set(results.map((r) => r.publicationId)).size).toBe(1);
  });

  it("does not leave a publication behind an owner who became passive meanwhile", async () => {
    for (let round = 0; round < 5; round++) {
      const { admin, environmentId } = await openEnvironment();
      const anna = await member(environmentId, admin);
      const objectId = await create(anna);

      const outcome = await Promise.allSettled([
        publish(anna, objectId, environmentId),
        run(leaveEnvironment, anna, { environmentId }),
      ]);

      const live = await db
        .selectFrom("app.environment_publications")
        .select("id")
        .where("object_id", "=", objectId)
        .where("status", "in", ["pending", "active"])
        .execute();
      expect(live, JSON.stringify(outcome.map((o) => o.status))).toEqual([]);
    }
  });
});

describe("historical privacy (PS-ENV-009)", () => {
  /** Lets every given member accept a proposal and decides it at its deadline. */
  async function adopt(
    environmentId: string,
    proposalId: string,
    days: number,
    supporters: readonly UserActor[],
  ) {
    for (const supporter of supporters) {
      await run(respondToTypeChange, supporter, {
        environmentId,
        proposalId,
        support: true,
      });
    }
    passDays(days);
    await run(concludeTypeChanges, systemActor(typeChangeProcess), {});
  }

  const reviewedIds = async (actor: UserActor, environmentId: string) =>
    (
      await executeQuery(tick(), listEnvironmentPublications, {
        actor,
        input: { environmentId },
      })
    ).publications.map((publication) => publication.id);

  it("keeps what was published while closed from those who joined after it opened", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { type: "closed" });
    const anna = await member(environmentId, admin);
    const veteran = await member(environmentId, admin);
    const before = await create(anna);
    const { publicationId: beforeId } = await publish(
      anna,
      before,
      environmentId,
    );
    const readImage = await withImage(anna, before, environmentId);
    // A co-owner from outside sees that the object is published, not where.
    const coOwner = await user();
    const { invitationId } = await run(inviteCoOwner, anna, {
      objectId: before,
      userId: coOwner.userId,
    });
    await run(acceptCoOwnerInvitation, coOwner, { invitationId });

    const { proposal } = await run(changeEnvironmentType, admin, {
      environmentId,
      expectedType: "closed",
      type: "open",
    });
    await adopt(environmentId, proposal!.id, typeChangeDays.consent, [
      admin,
      anna,
      veteran,
    ]);

    const newcomer = await member(environmentId, admin);
    await join(environmentId, admin, coOwner);
    const after = await create(anna);
    const { publicationId: afterId } = await publish(
      anna,
      after,
      environmentId,
    );

    expect(await found(veteran, environmentId)).toEqual([after, before]);
    expect(await found(newcomer, environmentId)).toEqual([after]);
    expect((await readImage(veteran)).contentType).toBe("image/webp");
    await expect(readImage(newcomer)).rejects.toMatchObject(notFound);

    const [asCoOwner] = await publicationsOf(coOwner, before);
    expect(asCoOwner).toMatchObject({
      id: beforeId,
      environment: null,
      publishedByUserId: null,
    });
    const [asPublisher] = await publicationsOf(anna, before);
    expect(asPublisher?.environment).toMatchObject({ id: environmentId });

    // Not even as administrator, in review lists, counts, images or decisions.
    await makeAdministrator(environmentId, admin, newcomer);
    expect(await reviewedIds(admin, environmentId)).toEqual([
      afterId,
      beforeId,
    ]);
    expect(await reviewedIds(newcomer, environmentId)).toEqual([afterId]);
    await expect(readImage(newcomer)).rejects.toMatchObject(notFound);
    for (const command of [rejectPublication, blockPublication]) {
      await expect(
        decide(command, newcomer, environmentId, beforeId),
      ).rejects.toMatchObject(notFound);
    }
    expect(
      await run(setObjectApproval, newcomer, { environmentId, required: true }),
    ).toEqual({ required: true, changed: 1 });
    expect((await statusOf(beforeId)).status).toBe("pending");
    expect(
      await run(setObjectApproval, admin, { environmentId, required: false }),
    ).toEqual({ required: false, changed: 2 });

    // Publishing anew puts the object in the open context for everyone.
    await run(withdrawPublication, anna, {
      objectId: before,
      publicationId: beforeId,
    });
    await publish(anna, before, environmentId);
    expect(await found(newcomer, environmentId)).toEqual([before, after]);
  });

  it("keeps what was published while hidden from those who joined after it became closed", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { type: "hidden" });
    const anna = await member(environmentId, admin);
    const veteran = await member(environmentId, admin);
    const objectId = await create(anna);
    await publish(anna, objectId, environmentId);
    const readImage = await withImage(anna, objectId, environmentId);

    const proposalId = await startTestVote(db, {
      environmentId,
      proposedByUserId: admin.userId,
      at: clock,
    });
    await adopt(environmentId, proposalId, testVoteDays, [
      admin,
      anna,
      veteran,
    ]);
    expect(
      (
        await db
          .selectFrom("app.environments")
          .select("type")
          .where("id", "=", environmentId)
          .executeTakeFirstOrThrow()
      ).type,
    ).toBe("closed");

    const newcomer = await member(environmentId, admin);
    expect(await found(veteran, environmentId)).toEqual([objectId]);
    expect(await found(newcomer, environmentId)).toEqual([]);
    await expect(readImage(newcomer)).rejects.toMatchObject(notFound);

    // A veteran who leaves and comes back is a newcomer to that history.
    await run(leaveEnvironment, veteran, { environmentId });
    await join(environmentId, admin, veteran);
    expect(await found(veteran, environmentId)).toEqual([]);
  });

  it.each([
    ["closed", "open"],
    ["hidden", "closed"],
  ] as const)(
    "orders a publication before a %s → %s change at the very same moment",
    async (from, to) => {
      const admin = await user();
      const environmentId = await environment(admin, { type: from });
      const anna = await member(environmentId, admin);
      const veteran = await member(environmentId, admin);
      const objectId = await create(anna);
      const proposalId =
        from === "hidden"
          ? await startTestVote(db, {
              environmentId,
              proposedByUserId: admin.userId,
              at: clock,
            })
          : (
              await run(changeEnvironmentType, admin, {
                environmentId,
                expectedType: from,
                type: to,
              })
            ).proposal!.id;
      for (const supporter of [admin, anna, veteran]) {
        await run(respondToTypeChange, supporter, {
          environmentId,
          proposalId,
          support: true,
        });
      }
      passDays(from === "hidden" ? testVoteDays : typeChangeDays.consent);

      // The publication comes first, then the change, with one and the same
      // clock time: the order alone decides the context.
      const { publicationId } = await runNow(publishObject, anna, {
        objectId,
        environmentId,
      });
      await runNow(concludeTypeChanges, systemActor(typeChangeProcess), {});
      const { created_at: publishedAt } = await db
        .selectFrom("app.environment_publications")
        .select("created_at")
        .where("id", "=", publicationId)
        .executeTakeFirstOrThrow();
      const widening = await db
        .selectFrom("app.environment_type_periods")
        .select(["type", "started_at"])
        .where("environment_id", "=", environmentId)
        .orderBy("position", "desc")
        .executeTakeFirstOrThrow();
      expect(widening).toEqual({ type: to, started_at: publishedAt });

      const newcomer = await member(environmentId, admin);
      expect(await found(veteran, environmentId)).toEqual([objectId]);
      expect(await found(newcomer, environmentId)).toEqual([]);
      await makeAdministrator(environmentId, admin, newcomer);
      expect(await reviewedIds(newcomer, environmentId)).toEqual([]);
    },
  );
});

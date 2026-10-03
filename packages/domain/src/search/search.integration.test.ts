import { randomBytes, randomUUID } from "node:crypto";
import { type CreateEnvironment, searchResultLimit } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { type Actor, systemActor, type UserActor } from "../actor";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import { startEnvironmentWindDown } from "../environment/continuity-commands";
import {
  createEnvironment,
  updateEnvironmentDetails,
} from "../environment/environment-commands";
import {
  acceptInvitation,
  inviteMember,
  joinEnvironment,
  leaveEnvironment,
} from "../environment/membership-commands";
import { changeEnvironmentType } from "../environment/type-change-commands";
import { addDays, calendarDate } from "../objects/availability";
import { archiveObject, createObject, updateObject } from "../objects/commands";
import { consentToObjectDeletion } from "../objects/deletion";
import { ConsumerRegistry } from "../outbox/consumer";
import { processOutboxBatch } from "../outbox/worker";
import { publishObject, withdrawPublication } from "../publications/commands";
import { blockUser } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { reconcileSearchIndex, searchIndexer } from "./indexer";
import { searchIndexProcess } from "./policies";
import { searchEnvironments, searchObjects } from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());

let clock = new Date();
const consumers = new ConsumerRegistry([searchIndexer({ db: () => db })]);
const domain: DomainContext = { db, consumers, clock: () => clock };

const fresh = (actor: UserActor): UserActor => ({
  ...actor,
  authentication: {
    ...actor.authentication,
    methods: [{ method: "otp", at: clock }],
  },
});

function run<I, R, C, O>(
  command: CommandDefinition<I, R, C, O>,
  actor: Actor,
  input: object,
): Promise<O> {
  clock = new Date(clock.getTime() + 1);

  return executeCommand(domain, command, {
    actor: actor.kind === "user" ? fresh(actor) : actor,
    input,
    ...(command.idempotency === "none" ? {} : { idempotencyKey: randomUUID() }),
  }).then((result) => result.output);
}

/** Lets the outbox consumer bring the index up to date. */
async function indexed() {
  while ((await processOutboxBatch(db, consumers, { batchSize: 100 })).claimed);
}

/** A word no other test uses, so the shared database cannot interfere. */
const word = () =>
  Array.from(randomBytes(12), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");

const user = async () => (await registerTestUser(domain)).actor;

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
  const { type } = await db
    .selectFrom("app.environments")
    .select("type")
    .where("id", "=", environmentId)
    .executeTakeFirstOrThrow();

  if (type === "open") {
    await run(joinEnvironment, actor, { environmentId, answers: [] });
  } else {
    await run(inviteMember, admin, { environmentId, userId: actor.userId });
    await run(acceptInvitation, actor, { environmentId, answers: [] });
  }

  return actor;
}

const member = async (environmentId: string, admin: UserActor) =>
  join(environmentId, admin, await user());

async function create(
  owner: UserActor,
  input: { title?: string; categoryId?: string; availability?: object[] } = {},
) {
  const { objectId } = await run(createObject, owner, {
    title: "Tilhenger",
    categoryId: "annet",
    description: "Liten tilhenger med presenning.",
    availability: [{ start: calendarDate(clock), end: null }],
    ...input,
  });

  return objectId;
}

const publish = (owner: UserActor, objectId: string, environmentId: string) =>
  run(publishObject, owner, { objectId, environmentId });

/** An environment with its owner, an object owner and one other member. */
async function setting(input: Partial<CreateEnvironment> = {}) {
  const admin = await user();
  const environmentId = await environment(admin, input);
  const owner = await member(environmentId, admin);
  const viewer = await member(environmentId, admin);

  return { admin, environmentId, owner, viewer };
}

const searchFor = (actor: UserActor, input: object) =>
  executeQuery(domain, searchObjects, { actor, input });

/** The object ids the actor finds with the search. */
const found = async (actor: UserActor, input: object) =>
  (await searchFor(actor, input)).objects.map((object) => object.objectId);

const environmentsFound = async (actor: UserActor, input: object) =>
  (
    await executeQuery(domain, searchEnvironments, { actor, input })
  ).environments.map((environment) => environment.id);

const indexedObject = async (objectId: string) =>
  (await db
    .selectFrom("app.search_objects")
    .select("object_id")
    .where("object_id", "=", objectId)
    .executeTakeFirst()) !== undefined;

const indexedEnvironment = async (environmentId: string) =>
  (await db
    .selectFrom("app.search_environments")
    .select("environment_id")
    .where("environment_id", "=", environmentId)
    .executeTakeFirst()) !== undefined;

describe("Finn: objects (WP-61, ADR-0005)", () => {
  it("finds what the viewer finds in the environment, by word, stem and beginning", async () => {
    const { environmentId, owner, viewer } = await setting({
      name: "Vennegjengen",
    });
    const name = word();
    const objectId = await create(owner, { title: `Stige ${name}` });
    const { publicationId } = await publish(owner, objectId, environmentId);
    await indexed();

    const result = await searchFor(viewer, { q: name });
    expect(result).toEqual({
      objects: [
        expect.objectContaining({
          objectId,
          title: `Stige ${name}`,
          ownedByYou: false,
          availableForNewLoans: true,
          foundIn: [
            {
              environmentId,
              environmentName: "Vennegjengen",
              publicationId,
            },
          ],
        }),
      ],
      more: false,
    });
    expect(JSON.stringify(result), "the owners are never named").not.toContain(
      owner.userId,
    );
    expect(await found(viewer, { q: `stiger ${name}` }), "a stem").toEqual([
      objectId,
    ]);
    expect(
      await found(viewer, { q: name.slice(0, 6) }),
      "the beginning of a word",
    ).toEqual([objectId]);
    expect((await searchFor(owner, { q: name })).objects[0]?.ownedByYou).toBe(
      true,
    );
  });

  it("finds nothing for outsiders, pending members or where the object is not published", async () => {
    const { admin, environmentId, owner } = await setting({ type: "closed" });
    const name = word();
    const objectId = await create(owner, { title: name });
    await publish(owner, objectId, environmentId);
    const unpublished = await create(owner, { title: `${name} igjen` });
    await indexed();

    const outsider = await user();
    expect(await found(outsider, { q: name })).toEqual([]);

    const applicant = await user();
    await run(inviteMember, admin, {
      environmentId,
      userId: applicant.userId,
    });
    expect(await found(applicant, { q: name }), "invited, not active").toEqual(
      [],
    );

    expect(await found(owner, { q: name })).toEqual([objectId]);
    expect(await indexedObject(unpublished), "never indexed").toBe(false);
  });

  it("keeps a hidden environment's objects with its members", async () => {
    const { environmentId, owner, viewer } = await setting({ type: "hidden" });
    const name = word();
    const objectId = await create(owner, { title: name });
    await publish(owner, objectId, environmentId);
    await indexed();

    expect(await found(viewer, { q: name })).toEqual([objectId]);
    expect(await found(await user(), { q: name })).toEqual([]);
    expect(
      await found(await user(), { q: name, environmentId }),
      "naming the environment changes nothing",
    ).toEqual([]);
  });

  it("decides against the domain core, not the index, when the index lags behind", async () => {
    const { environmentId, owner, viewer } = await setting();
    const name = word();
    const objectId = await create(owner, { title: name });
    const { publicationId } = await publish(owner, objectId, environmentId);
    await indexed();

    await run(withdrawPublication, owner, { objectId, publicationId });
    expect(await indexedObject(objectId), "not yet refreshed").toBe(true);
    expect(await found(viewer, { q: name })).toEqual([]);

    await indexed();
    expect(await indexedObject(objectId)).toBe(false);
  });

  it("never finds an object whose owner and the viewer have blocked each other", async () => {
    const { environmentId, owner, viewer } = await setting();
    const name = word();
    const objectId = await create(owner, { title: name });
    await publish(owner, objectId, environmentId);
    await indexed();

    await run(blockUser, owner, { userId: viewer.userId });
    expect(await found(viewer, { q: name })).toEqual([]);
  });

  it("follows edits, archiving and deletion", async () => {
    const { environmentId, owner, viewer } = await setting();
    const before = word();
    const after = word();
    const objectId = await create(owner, { title: before });
    await publish(owner, objectId, environmentId);
    await indexed();

    await run(updateObject, owner, {
      objectId,
      expectedVersion: 1,
      title: after,
    });
    await indexed();
    expect(await found(viewer, { q: before })).toEqual([]);
    expect(await found(viewer, { q: after })).toEqual([objectId]);

    await run(archiveObject, owner, { objectId });
    await indexed();
    expect(await indexedObject(objectId)).toBe(false);

    const removed = await create(owner, { title: word() });
    await publish(owner, removed, environmentId);
    await indexed();
    await run(consentToObjectDeletion, owner, { objectId: removed });
    expect(await indexedObject(removed), "deleted with the object").toBe(false);
  });

  it("shows an object found in several environments once, with each of them", async () => {
    const first = await setting({ name: "Alfa" });
    const second = await environment(first.admin, { name: "Beta" });
    await join(second, first.admin, first.owner);
    await join(second, first.admin, first.viewer);
    const name = word();
    const objectId = await create(first.owner, { title: name });
    await publish(first.owner, objectId, first.environmentId);
    await publish(first.owner, objectId, second);
    await indexed();

    const [object] = (await searchFor(first.viewer, { q: name })).objects;
    expect(object?.foundIn.map((place) => place.environmentName)).toEqual([
      "Alfa",
      "Beta",
    ]);
    expect(
      await found(first.viewer, { q: name, environmentId: second }),
    ).toEqual([objectId]);
  });

  it("filters by category, including the categories below it", async () => {
    const { environmentId, owner, viewer } = await setting();
    const category = `test_${word()}`;
    await db
      .insertInto("app.object_categories")
      .values({ id: category, parent_id: "annet", label: "Testkategori" })
      .execute();
    const name = word();
    const inside = await create(owner, { title: name, categoryId: category });
    const outside = await create(owner, { title: `${name} annet` });
    await publish(owner, inside, environmentId);
    await publish(owner, outside, environmentId);
    await indexed();

    expect(await found(viewer, { q: name, categoryId: category })).toEqual([
      inside,
    ]);
    expect(
      (await found(viewer, { q: name, categoryId: "annet" })).sort(),
    ).toEqual([inside, outside].sort());
    expect(
      await found(viewer, { categoryId: category, environmentId }),
      "a category alone",
    ).toEqual([inside]);
  });

  it("filters by a period the object is actually available all of", async () => {
    const { environmentId, owner, viewer } = await setting();
    const today = calendarDate(clock);
    const name = word();
    const objectId = await create(owner, {
      title: name,
      availability: [{ start: today, end: addDays(today, 9) }],
    });
    await publish(owner, objectId, environmentId);
    await indexed();

    const period = (from: number, to: number) => ({
      q: name,
      availableFrom: addDays(today, from),
      availableTo: addDays(today, to),
    });
    expect(await found(viewer, period(2, 9))).toEqual([objectId]);
    expect(await found(viewer, period(2, 10))).toEqual([]);
  });

  it("shows the best matches and says when there are more", async () => {
    const { environmentId, owner, viewer } = await setting();
    const name = word();

    for (let index = 0; index <= searchResultLimit; index += 1) {
      await publish(owner, await create(owner, { title: name }), environmentId);
    }

    await indexed();
    const result = await searchFor(viewer, { q: name });
    expect(result.objects).toHaveLength(searchResultLimit);
    expect(result.more).toBe(true);
  });

  it("refuses searches that are not targeted", async () => {
    const viewer = await user();

    for (const input of [
      {},
      { q: "a" },
      { q: "x".repeat(101) },
      { environmentId: randomUUID() },
      { q: "stige", availableFrom: "2030-01-02" },
      { q: "stige", availableFrom: "2030-01-02", availableTo: "2030-01-01" },
    ]) {
      await expect(searchFor(viewer, input)).rejects.toMatchObject({
        code: "invalid_input",
      });
    }
  });
});

describe("Finn: environments (WP-61, PS-ENV-001)", () => {
  it("finds open and closed environments by their public details, with the caller's membership", async () => {
    const admin = await user();
    const name = word();
    const open = await environment(admin, { name: `Hagelag ${name}` });
    const closed = await environment(admin, {
      name: "Verkstedet",
      type: "closed",
      description: `Felles verktøy for ${name}`,
      location: "Grünerløkka",
    });
    await indexed();
    const viewer = await member(open, admin);

    expect((await environmentsFound(viewer, { q: name })).sort()).toEqual(
      [open, closed].sort(),
    );
    expect(
      await environmentsFound(viewer, { q: name, type: "closed" }),
    ).toEqual([closed]);
    const { environments } = await executeQuery(domain, searchEnvironments, {
      actor: viewer,
      input: { q: `${name} grünerløkka` },
    });
    expect(environments).toEqual([
      {
        id: closed,
        type: "closed",
        name: "Verkstedet",
        description: `Felles verktøy for ${name}`,
        location: "Grünerløkka",
        membershipState: null,
      },
    ]);
    expect(
      (
        await executeQuery(domain, searchEnvironments, {
          actor: viewer,
          input: { q: `hagelag ${name}` },
        })
      ).environments[0]?.membershipState,
    ).toBe("active");
  });

  it("never finds a hidden environment, not even for its members", async () => {
    const admin = await user();
    const name = word();
    const hidden = await environment(admin, { name, type: "hidden" });
    await indexed();

    expect(await indexedEnvironment(hidden)).toBe(false);
    expect(await environmentsFound(admin, { q: name })).toEqual([]);
    expect(await environmentsFound(await user(), { q: name })).toEqual([]);
  });

  it("drops an environment that becomes hidden or winds down, even before the index catches up", async () => {
    const admin = await user();
    const name = word();
    const becomesHidden = await environment(admin, {
      name: `${name} skjult`,
      type: "closed",
    });
    const windsDown = await environment(admin, { name: `${name} avvikles` });
    await indexed();
    const viewer = await user();
    expect(await environmentsFound(viewer, { q: name })).toHaveLength(2);

    await run(changeEnvironmentType, admin, {
      environmentId: becomesHidden,
      expectedType: "closed",
      type: "hidden",
    });
    await run(startEnvironmentWindDown, admin, { environmentId: windsDown });
    expect(await environmentsFound(viewer, { q: name })).toEqual([]);

    await indexed();
    expect(await indexedEnvironment(becomesHidden)).toBe(false);
    expect(await indexedEnvironment(windsDown)).toBe(false);
  });

  it("follows changed details", async () => {
    const admin = await user();
    const before = word();
    const after = word();
    const environmentId = await environment(admin, { name: before });
    await indexed();

    await run(updateEnvironmentDetails, admin, {
      environmentId,
      name: after,
      expectedVersion: 1,
    });
    await indexed();
    const viewer = await user();
    expect(await environmentsFound(viewer, { q: before })).toEqual([]);
    expect(await environmentsFound(viewer, { q: after })).toEqual([
      environmentId,
    ]);
  });
});

describe("search index reconciliation", () => {
  it("removes what changed without an event, and rebuilds what is missing", async () => {
    const { environmentId, owner, viewer } = await setting();
    const name = word();
    const objectId = await create(owner, { title: name });
    await publish(owner, objectId, environmentId);
    await indexed();

    // The trigger ends the publication when the owner leaves (access_lost).
    await run(leaveEnvironment, owner, { environmentId });
    await indexed();
    expect(await found(viewer, { q: name })).toEqual([]);
    expect(await indexedObject(objectId), "no event says so").toBe(true);

    const reconcile = () =>
      run(reconcileSearchIndex, systemActor(searchIndexProcess), {});
    await reconcile();
    expect(await indexedObject(objectId)).toBe(false);

    await db
      .deleteFrom("app.search_objects")
      .where("object_id", "=", objectId)
      .execute();
    const restored = await create(owner, { title: word() });
    const second = await environment(owner, { name: word() });
    await publish(owner, restored, second);
    await db
      .deleteFrom("app.search_objects")
      .where("object_id", "=", restored)
      .execute();
    await reconcile();
    expect(await indexedObject(restored), "rebuilt from the core").toBe(true);
  });

  it("is only for the scheduled job", async () => {
    await expect(
      run(reconcileSearchIndex, systemActor("outbox.worker"), {}),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

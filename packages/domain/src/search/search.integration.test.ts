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
  liftRestriction,
  updateEnvironmentDetails,
} from "../environment/environment-commands";
import {
  acceptInvitation,
  inviteMember,
  joinEnvironment,
  leaveEnvironment,
  rejectMembership,
} from "../environment/membership-commands";
import { getEnvironment, listMemberships } from "../environment/queries";
import { changeEnvironmentType } from "../environment/type-change-commands";
import { addDays, calendarDate } from "../objects/availability";
import { archiveObject, createObject, updateObject } from "../objects/commands";
import { consentToObjectDeletion } from "../objects/deletion";
import { ConsumerRegistry } from "../outbox/consumer";
import { processOutboxBatch } from "../outbox/worker";
import { publishObject, withdrawPublication } from "../publications/commands";
import { blockUser } from "../social/commands";
import { acquaint } from "../testing/acquaintance";
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
    await acquaint(db, admin, actor);
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
    expect(
      result.objects[0]?.owners.map((shown) => shown.profileId),
      "the owner, a member there, is named (PS-ENV-015)",
    ).toEqual([owner.userId]);
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
    await acquaint(db, admin, applicant);
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
      .values({ id: category, parent_id: "annet", label: category })
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
        area: null,
        members: { kind: "fewer_than", count: 10 },
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

  it("shows about how many active members, never the exact number (PS-ENV-016)", async () => {
    const admin = await user();
    const name = word();
    const environmentId = await environment(admin, { name });
    await indexed();
    const members = [];
    for (let joined = 1; joined < 10; joined += 1) {
      members.push(await member(environmentId, admin));
    }
    const shown = async () =>
      (
        await executeQuery(domain, searchEnvironments, {
          actor: await user(),
          input: { q: name },
        })
      ).environments[0]?.members;

    expect(await shown()).toEqual({ kind: "about", count: 10 });

    await run(leaveEnvironment, members[0] as UserActor, { environmentId });
    expect(await shown()).toEqual({ kind: "fewer_than", count: 10 });
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

  it("hides an environment from the one user it bars, until the bar is lifted", async () => {
    const admin = await user();
    const name = word();
    const closed = await environment(admin, { name, type: "closed" });
    const other = await environment(admin, { name: `${name} åpent` });
    await indexed();
    const applicant = await user();
    const { membershipId } = await run(joinEnvironment, applicant, {
      environmentId: closed,
      answers: [],
    });
    await run(rejectMembership, admin, {
      environmentId: closed,
      membershipId,
      restrict: true,
    });

    expect(await environmentsFound(applicant, { q: name })).toEqual([other]);
    expect((await environmentsFound(await user(), { q: name })).sort()).toEqual(
      [closed, other].sort(),
    );

    const { restrictions } = await executeQuery(domain, listMemberships, {
      actor: admin,
      input: { environmentId: closed },
    });
    await run(liftRestriction, admin, {
      environmentId: closed,
      restrictionId: restrictions[0]?.id ?? "",
    });
    expect((await environmentsFound(applicant, { q: name })).sort()).toEqual(
      [closed, other].sort(),
    );
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

/**
 * A centre nobody else's test uses: the shared database keeps every area,
 * and one of a kilometre or two never reaches another random one.
 */
const somewhere = () => ({
  latitude: Math.round((Math.random() * 120 - 60) * 100) / 100,
  longitude: Math.round((Math.random() * 340 - 170) * 100) / 100,
});

/** About `km` north of a centre (a degree of latitude is about 111 km). */
const north = (
  centre: { latitude: number; longitude: number },
  km: number,
) => ({
  ...centre,
  latitude: Math.round((centre.latitude + km / 111.2) * 100) / 100,
});

describe("Finn: near an area (WP-62, PS-NFR-008)", () => {
  it("keeps an environment's area no more precise than about a kilometre", async () => {
    const admin = await user();
    const environmentId = await environment(admin, {
      area: { latitude: 59.920113, longitude: 10.757381, radiusKm: 2 },
    });

    const read = await executeQuery(domain, getEnvironment, {
      actor: admin,
      input: { environmentId },
    });
    expect(read.area).toEqual({
      latitude: 59.92,
      longitude: 10.76,
      radiusKm: 2,
    });

    for (const area of [
      { latitude: 59.92, longitude: 10.76, radiusKm: 3 },
      { latitude: 91, longitude: 10.76, radiusKm: 2 },
      { latitude: 59.92, radiusKm: 2 },
    ]) {
      await expect(
        run(updateEnvironmentDetails, admin, {
          environmentId,
          name: "Borettslaget",
          area,
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
  });

  it("finds environments whose area overlaps the one searched, closest first", async () => {
    const admin = await user();
    const centre = somewhere();
    const near = await environment(admin, {
      name: "Nærmest",
      area: { ...centre, radiusKm: 1 },
    });
    const further = await environment(admin, {
      name: "Litt lenger unna",
      type: "closed",
      area: { ...north(centre, 6), radiusKm: 2 },
    });
    const far = await environment(admin, {
      name: "Langt unna",
      area: { ...north(centre, 30), radiusKm: 2 },
    });
    await indexed();
    const viewer = await user();
    const search = (radiusKm: number, input: object = {}) =>
      environmentsFound(viewer, { ...centre, radiusKm, ...input });

    expect(await search(1)).toEqual([near]);
    expect(await search(5), "closest first").toEqual([near, further]);
    expect(await search(5, { type: "closed" })).toEqual([further]);
    expect(await search(50)).toEqual([near, further, far]);
    expect(
      await environmentsFound(viewer, {
        latitude: String(centre.latitude),
        longitude: String(centre.longitude),
        radiusKm: "5",
      }),
      "as parameters of an address",
    ).toEqual([near, further]);

    const { environments } = await executeQuery(domain, searchEnvironments, {
      actor: viewer,
      input: { q: "nærmest", ...centre, radiusKm: 10 },
    });
    expect(environments, "text and area together").toEqual([
      expect.objectContaining({ id: near, area: { ...centre, radiusKm: 1 } }),
    ]);
  });

  it("never finds a hidden or barring environment by its area", async () => {
    const admin = await user();
    const centre = somewhere();
    const area = { ...centre, radiusKm: 1 as const };
    const hidden = await environment(admin, { type: "hidden", area });
    const closed = await environment(admin, { type: "closed", area });
    await indexed();
    const applicant = await user();
    const { membershipId } = await run(joinEnvironment, applicant, {
      environmentId: closed,
      answers: [],
    });
    await run(rejectMembership, admin, {
      environmentId: closed,
      membershipId,
      restrict: true,
    });
    const near = { ...centre, radiusKm: 10 };

    expect(await indexedEnvironment(hidden)).toBe(false);
    expect(
      await environmentsFound(admin, near),
      "not even its members",
    ).toEqual([closed]);
    expect(await environmentsFound(applicant, near)).toEqual([]);

    await run(changeEnvironmentType, admin, {
      environmentId: closed,
      expectedType: "closed",
      type: "hidden",
    });
    expect(
      await environmentsFound(await user(), near),
      "before the index catches up",
    ).toEqual([]);
  });

  it("follows a moved or removed area", async () => {
    const admin = await user();
    const before = somewhere();
    const after = somewhere();
    const environmentId = await environment(admin, {
      area: { ...before, radiusKm: 1 },
    });
    await indexed();
    const viewer = await user();

    await run(updateEnvironmentDetails, admin, {
      environmentId,
      name: "Borettslaget",
      area: { ...after, radiusKm: 1 },
      expectedVersion: 1,
    });
    await indexed();
    expect(await environmentsFound(viewer, { ...before, radiusKm: 1 })).toEqual(
      [],
    );
    expect(await environmentsFound(viewer, { ...after, radiusKm: 1 })).toEqual([
      environmentId,
    ]);

    await run(updateEnvironmentDetails, admin, {
      environmentId,
      name: "Borettslaget",
      expectedVersion: 2,
    });
    await indexed();
    expect(await environmentsFound(viewer, { ...after, radiusKm: 1 })).toEqual(
      [],
    );
  });

  it("finds things only in the viewer's environments near the area", async () => {
    const centre = somewhere();
    const { environmentId, owner, viewer, admin } = await setting({
      name: "Nabolaget",
      area: { ...centre, radiusKm: 2 },
    });
    const elsewhere = await environment(admin, {
      name: "Andre siden",
      area: { ...north(centre, 40), radiusKm: 2 },
    });
    const nowhere = await environment(admin, { name: "Uten sted" });
    await join(elsewhere, admin, owner);
    await join(elsewhere, admin, viewer);
    await join(nowhere, admin, owner);
    await join(nowhere, admin, viewer);
    const name = word();
    const objectId = await create(owner, { title: name });
    for (const place of [environmentId, elsewhere, nowhere]) {
      await publish(owner, objectId, place);
    }
    await indexed();

    const near = await searchFor(viewer, { q: name, ...centre, radiusKm: 5 });
    expect(near.objects.map((object) => object.foundIn)).toEqual([
      [
        expect.objectContaining({
          environmentId,
          environmentName: "Nabolaget",
        }),
      ],
    ]);
    expect(
      await found(viewer, { q: name, ...north(centre, 80), radiusKm: 1 }),
    ).toEqual([]);
    expect(
      (await searchFor(viewer, { q: name })).objects[0]?.foundIn,
      "without an area, everywhere",
    ).toHaveLength(3);
  });

  it("refuses an area that is incomplete, or a search by area alone for things", async () => {
    const viewer = await user();
    const centre = somewhere();

    for (const input of [
      { q: "stige", latitude: centre.latitude },
      { q: "stige", ...centre, radiusKm: 3 },
      { ...centre, radiusKm: 5 },
    ]) {
      await expect(searchFor(viewer, input)).rejects.toMatchObject({
        code: "invalid_input",
      });
    }
    for (const input of [{}, { ...centre }, { type: "open" }]) {
      await expect(
        executeQuery(domain, searchEnvironments, { actor: viewer, input }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
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

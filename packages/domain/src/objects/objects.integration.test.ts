import { randomUUID } from "node:crypto";
import { objectImageMaxCount } from "@lanbort/contracts";
import { afterAll, describe, expect, it, vi } from "vitest";
import { anonymousActor, type UserActor } from "../actor";
import { type DomainContext, executeCommand } from "../commands/command";
import { executeQuery } from "../commands/query";
import { ConsumerRegistry } from "../outbox/consumer";
import { processOutboxBatch } from "../outbox/worker";
import { createTestUser } from "../testing/actors";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { addDays, calendarDate } from "./availability";
import { loadAvailabilityBlocks } from "./blocks";
import {
  archiveObject,
  createObject,
  restoreObject,
  updateObject,
} from "./commands";
import {
  type ImageProcessor,
  objectImageFileCleanup,
  objectImageKey,
  type ImageStore,
  readObjectImage,
  removeObjectImage,
  uploadObjectImage,
} from "./images";
import { getObject, listObjectCategories, listOwnObjects } from "./queries";
import { loadObjectDetails } from "./state";

const db = connectTestDatabase();
afterAll(() => db.destroy());

/** In-memory stand-in for the storage adapter. */
class MemoryStore implements ImageStore {
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
// No grace period: tests run the outbox only after their uploads finished.
const cleanup = objectImageFileCleanup({
  store: () => store,
  db: () => db,
  uploadGraceMs: 0,
});
const consumers = new ConsumerRegistry([cleanup]);
const domain: DomainContext = { db, consumers };

/** Accepts anything starting with "img", like a decoder would. */
const process = vi.fn<ImageProcessor>(async (bytes) =>
  new TextDecoder().decode(bytes.subarray(0, 3)) === "img"
    ? { bytes, contentType: "image/webp", width: 40, height: 30 }
    : null,
);
const images = { store, process };

const today = calendarDate(new Date());
const key = () => randomUUID();

const validObject = {
  title: "Stige, 4 meter",
  categoryId: "annet",
  description: "Aluminiumsstige.\nLitt bulkete i ene enden.",
  availability: [{ start: today, end: null }],
};

async function create(actor: UserActor, input: object = validObject) {
  const { output } = await executeCommand(domain, createObject, {
    actor,
    input,
    idempotencyKey: key(),
  });

  return output;
}

const read = (actor: UserActor, objectId: string) =>
  executeQuery(domain, getObject, { actor, input: { objectId } });

const update = (actor: UserActor, input: object) =>
  executeCommand(domain, updateObject, { actor, input, idempotencyKey: key() });

const upload = (
  actor: UserActor,
  objectId: string,
  bytes = `img-${randomUUID()}`,
  idempotencyKey = key(),
) =>
  uploadObjectImage(domain, images, {
    actor,
    objectId,
    bytes: new TextEncoder().encode(bytes),
    idempotencyKey,
  });

/** The object's visible history. */
const eventsFor = (objectId: string) =>
  db
    .selectFrom("app.audit_events")
    .select(["event_type", "kind", "actor_user_id", "payload"])
    .where("resource_type", "=", "object")
    .where("resource_id", "=", objectId)
    .where("kind", "=", "domain")
    .orderBy("position")
    .execute();

const user = async () => (await registerTestUser(domain)).actor;

const filesOf = (objectId: string) =>
  [...store.files.keys()].filter((file) =>
    file.startsWith(`objects/${objectId}/`),
  );

describe("creating and reading objects (PS-OBJ-001, PS-OBJ-002)", () => {
  it("creates a global object owned by its creator", async () => {
    const owner = await user();
    const { objectId, version } = await create(owner, {
      ...validObject,
      loanTerms: "Hentes og leveres rengjort.",
    });

    expect(version).toBe(1);
    expect(await read(owner, objectId)).toMatchObject({
      id: objectId,
      title: "Stige, 4 meter",
      categoryId: "annet",
      description: "Aluminiumsstige.\nLitt bulkete i ene enden.",
      loanTerms: "Hentes og leveres rengjort.",
      status: "active",
      version: 1,
      availability: [{ start: today, end: null }],
      effectiveAvailability: [{ start: today, end: null }],
      availableForNewLoans: true,
      images: [],
    });
    // The object is not tied to any environment: ownership is its only link.
    expect(
      await db
        .selectFrom("app.object_owners")
        .select("user_id")
        .where("object_id", "=", objectId)
        .execute(),
    ).toEqual([{ user_id: owner.userId }]);
    // Events carry ids and versions only, never the owner's text.
    expect(await eventsFor(objectId)).toEqual([
      {
        event_type: "object.created",
        kind: "domain",
        actor_user_id: owner.userId,
        payload: { version: 1 },
      },
    ]);
  });

  it("can be created without availability, but is then not offered", async () => {
    const owner = await user();
    const { objectId } = await create(owner, {
      ...validObject,
      availability: undefined,
    });

    expect(await read(owner, objectId)).toMatchObject({
      availability: [],
      effectiveAvailability: [],
      availableForNewLoans: false,
      loanTerms: null,
    });
  });

  it("stores touching intervals as one logical space", async () => {
    const owner = await user();
    const { objectId } = await create(owner, {
      ...validObject,
      availability: [
        { start: addDays(today, 11), end: addDays(today, 20) },
        { start: addDays(today, 1), end: addDays(today, 10) },
        { start: addDays(today, 30), end: null },
      ],
    });

    expect((await read(owner, objectId)).availability).toEqual([
      { start: addDays(today, 1), end: addDays(today, 20) },
      { start: addDays(today, 30), end: null },
    ]);
  });

  it("creates one object when the same request is retried or races", async () => {
    const owner = await user();
    const idempotencyKey = key();
    const request = { actor: owner, input: validObject, idempotencyKey };

    const results = await Promise.all([
      executeCommand(domain, createObject, request),
      executeCommand(domain, createObject, request),
      executeCommand(domain, createObject, request),
    ]);
    const retried = await executeCommand(domain, createObject, request);

    expect(new Set(results.map((r) => r.output.objectId)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(retried).toMatchObject({
      replayed: true,
      output: results[0]!.output,
    });
    expect(
      (await executeQuery(domain, listOwnObjects, { actor: owner, input: {} }))
        .objects,
    ).toHaveLength(1);

    await expect(
      executeCommand(domain, createObject, {
        ...request,
        input: { ...validObject, title: "Noe annet" },
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });

  it.each([
    ["an unknown category", { categoryId: "finnes_ikke" }, ["categoryId"]],
    ["an empty title", { title: "   " }, ["title"]],
    ["a control character in the title", { title: "Sti\u0007ge" }, ["title"]],
    ["a missing description", { description: undefined }, ["description"]],
    [
      "an end before the start",
      { availability: [{ start: "2030-02-01", end: "2030-01-01" }] },
      ["availability.0.end"],
    ],
    [
      "an invalid date",
      { availability: [{ start: "2030-02-30", end: null }] },
      ["availability.0.start"],
    ],
    [
      "overlapping intervals",
      {
        availability: [
          { start: "2030-01-01", end: "2030-01-10" },
          { start: "2030-01-05", end: null },
        ],
      },
      ["availability.0", "availability.1"],
    ],
    ["an unknown field", { available: true }, ["$"]],
  ])("refuses %s and stores nothing", async (_name, change, fields) => {
    const owner = await user();

    await expect(
      executeCommand(domain, createObject, {
        actor: owner,
        input: { ...validObject, ...change },
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "invalid_input", fields });
    expect(
      (await executeQuery(domain, listOwnObjects, { actor: owner, input: {} }))
        .objects,
    ).toEqual([]);
  });

  it("refuses a retired category", async () => {
    const owner = await user();
    const retired = `retired_${randomUUID().slice(0, 8)}`;
    await db
      .insertInto("app.object_categories")
      .values({ id: retired, label: "Utgått", retired_at: new Date() })
      .execute();

    await expect(
      create(owner, { ...validObject, categoryId: retired }),
    ).rejects.toMatchObject({ code: "invalid_input", fields: ["categoryId"] });
    expect(
      (
        await executeQuery(domain, listObjectCategories, {
          actor: owner,
          input: {},
        })
      ).categories.map((category) => category.id),
    ).not.toContain(retired);
  });

  it("requires a registered user", async () => {
    const pending = await createTestUser(db, {
      accountStatus: "pending_registration",
    });

    await expect(create(pending)).rejects.toMatchObject({
      code: "registration_required",
    });
    await expect(
      executeCommand(domain, createObject, {
        actor: anonymousActor,
        input: validObject,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("offers the pilot's main categories, with Annet last (PS-OBJ-018)", async () => {
    const owner = await user();
    const { categories } = await executeQuery(domain, listObjectCategories, {
      actor: owner,
      input: {},
    });
    // Other test files add subcategories to the shared test database.
    const main = categories.filter((category) => category.parentId === null);

    expect(main.length).toBeGreaterThan(1);
    expect(main.at(-1)).toEqual({
      id: "annet",
      parentId: null,
      label: "Annet",
    });
    expect(
      new Set(main.map((category) => category.label.toLowerCase())).size,
    ).toBe(main.length);
  });
});

describe("other users' objects (negative authorization)", () => {
  it("are indistinguishable from objects that do not exist", async () => {
    const owner = await user();
    const stranger = await user();
    const { objectId } = await create(owner);
    const { imageId } = (await upload(owner, objectId)).output;
    const missing = randomUUID();
    process.mockClear();

    for (const target of [objectId, missing]) {
      const attempts = [
        read(stranger, target),
        update(stranger, {
          objectId: target,
          expectedVersion: 2,
          title: "Min nå",
        }),
        executeCommand(domain, archiveObject, {
          actor: stranger,
          input: { objectId: target },
          idempotencyKey: key(),
        }),
        executeCommand(domain, restoreObject, {
          actor: stranger,
          input: { objectId: target },
          idempotencyKey: key(),
        }),
        upload(stranger, target),
        readObjectImage(domain, store, {
          actor: stranger,
          input: { objectId: target, imageId },
        }),
        executeCommand(domain, removeObjectImage, {
          actor: stranger,
          input: { objectId: target, imageId },
          idempotencyKey: key(),
        }),
      ];

      for (const result of await Promise.allSettled(attempts)) {
        expect(result).toMatchObject({
          status: "rejected",
          reason: { code: "not_found" },
        });
      }
    }

    // Nothing was processed, stored or changed for the stranger.
    expect(process).not.toHaveBeenCalled();
    expect(await read(owner, objectId)).toMatchObject({
      title: validObject.title,
      status: "active",
      version: 2,
      images: [{ id: imageId }],
    });
    expect(
      (
        await executeQuery(domain, listOwnObjects, {
          actor: stranger,
          input: {},
        })
      ).objects,
    ).toEqual([]);
  });

  it("cannot be reached by naming another object's image", async () => {
    const owner = await user();
    const first = (await create(owner)).objectId;
    const second = (await create(owner)).objectId;
    const { imageId } = (await upload(owner, first)).output;

    await expect(
      readObjectImage(domain, store, {
        actor: owner,
        input: { objectId: second, imageId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      executeCommand(domain, removeObjectImage, {
        actor: owner,
        input: { objectId: second, imageId },
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists only the user's own objects", async () => {
    const owner = await user();
    const other = await user();
    const mine = await create(owner);
    await create(other);

    const { objects } = await executeQuery(domain, listOwnObjects, {
      actor: owner,
      input: {},
    });

    expect(objects.map((object) => object.id)).toEqual([mine.objectId]);
  });
});

describe("editing (PS-OBJ-001, PS-OBJ-003, docs/architecture/05)", () => {
  it("changes the given fields and records which ones, not their values", async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    const { output } = await update(owner, {
      objectId,
      expectedVersion: 1,
      title: "Stige, 5 meter",
      loanTerms: "Må hentes",
      availability: [{ start: addDays(today, 1), end: addDays(today, 10) }],
    });

    expect(output).toEqual({ objectId, version: 2 });
    expect(await read(owner, objectId)).toMatchObject({
      title: "Stige, 5 meter",
      description: validObject.description,
      loanTerms: "Må hentes",
      version: 2,
      availability: [{ start: addDays(today, 1), end: addDays(today, 10) }],
    });
    expect((await eventsFor(objectId)).at(-1)).toEqual({
      event_type: "object.updated",
      kind: "domain",
      actor_user_id: owner.userId,
      payload: {
        version: 2,
        changedFields: ["title", "loanTerms", "availability"],
      },
    });

    await update(owner, { objectId, expectedVersion: 2, loanTerms: null });
    expect(await read(owner, objectId)).toMatchObject({
      loanTerms: null,
      version: 3,
    });
  });

  it("refuses an edit based on an older version", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    await update(owner, { objectId, expectedVersion: 1, title: "Ny tittel" });

    await expect(
      update(owner, { objectId, expectedVersion: 1, description: "Gammel" }),
    ).rejects.toMatchObject({ code: "conflict", fields: ["expectedVersion"] });
    expect(await read(owner, objectId)).toMatchObject({
      title: "Ny tittel",
      description: validObject.description,
      version: 2,
    });
  });

  it("lets exactly one of two simultaneous edits of the same version win", async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    const results = await Promise.allSettled(
      ["Første", "Andre", "Tredje"].map((title) =>
        update(owner, { objectId, expectedVersion: 1, title }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .map((r) => (r.reason as { code: string }).code),
    ).toEqual(["conflict", "conflict"]);
    expect((await read(owner, objectId)).version).toBe(2);
  });

  it("keeps the version when nothing actually changes", async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    const { output } = await update(owner, {
      objectId,
      expectedVersion: 1,
      title: validObject.title,
      availability: validObject.availability,
    });

    expect(output.version).toBe(1);
    expect(await eventsFor(objectId)).toHaveLength(1);
  });

  it("refuses overlapping availability and keeps the stored one", async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    await expect(
      update(owner, {
        objectId,
        expectedVersion: 1,
        title: "Endres ikke",
        availability: [
          { start: "2030-01-01", end: null },
          { start: "2030-06-01", end: "2030-06-02" },
        ],
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      fields: ["availability.0", "availability.1"],
    });
    expect(await read(owner, objectId)).toMatchObject({
      title: validObject.title,
      availability: validObject.availability,
      version: 1,
    });
  });

  it("requires at least one change and an expected version", async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    await expect(
      update(owner, { objectId, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "invalid_input", fields: ["$"] });
    await expect(update(owner, { objectId, title: "X" })).rejects.toMatchObject(
      { code: "invalid_input", fields: ["expectedVersion"] },
    );
  });
});

describe("archiving (PS-OBJ-016)", () => {
  it("keeps everything but stops offering the object, reversibly", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    await upload(owner, objectId);

    const archived = await executeCommand(domain, archiveObject, {
      actor: owner,
      input: { objectId },
      idempotencyKey: key(),
    });
    expect(await read(owner, objectId)).toMatchObject({
      status: "archived",
      version: archived.output.version,
      availability: validObject.availability,
      effectiveAvailability: [],
      availableForNewLoans: false,
      images: [{ width: 40 }],
    });

    await expect(
      executeCommand(domain, archiveObject, {
        actor: owner,
        input: { objectId },
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    await executeCommand(domain, restoreObject, {
      actor: owner,
      input: { objectId },
      idempotencyKey: key(),
    });
    expect(await read(owner, objectId)).toMatchObject({
      status: "active",
      availableForNewLoans: true,
    });
    expect((await eventsFor(objectId)).map((e) => e.event_type)).toEqual([
      "object.created",
      "object.image_added",
      "object.archived",
      "object.restored",
    ]);
  });
});

describe("images (PS-OBJ-002)", () => {
  it("stores, serves and removes images, keeping their order", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    const first = (await upload(owner, objectId, "img-first")).output;
    const second = (await upload(owner, objectId, "img-second")).output;
    const third = (await upload(owner, objectId, "img-third")).output;

    expect(third.version).toBe(4);
    expect(
      await readObjectImage(domain, store, {
        actor: owner,
        input: { objectId, imageId: second.imageId },
      }),
    ).toEqual({
      bytes: new TextEncoder().encode("img-second"),
      contentType: "image/webp",
    });

    await executeCommand(domain, removeObjectImage, {
      actor: owner,
      input: { objectId, imageId: first.imageId },
      idempotencyKey: key(),
    });

    expect((await read(owner, objectId)).images.map((i) => i.id)).toEqual([
      second.imageId,
      third.imageId,
    ]);
    expect(
      await db
        .selectFrom("app.object_images")
        .select("position")
        .where("object_id", "=", objectId)
        .orderBy("position")
        .execute(),
    ).toEqual([{ position: 0 }, { position: 1 }]);

    // The file is deleted after commit by the outbox consumer.
    const removedKey = objectImageKey(objectId, first.imageId);
    expect(store.files.has(removedKey)).toBe(true);
    await processOutboxBatch(db, consumers, { batchSize: 100 });
    expect(store.files.has(removedKey)).toBe(false);
    expect(store.files.has(objectImageKey(objectId, second.imageId))).toBe(
      true,
    );
  });

  it(`allows at most ${objectImageMaxCount} images`, async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    for (let i = 0; i < objectImageMaxCount; i += 1) {
      await upload(owner, objectId);
    }
    process.mockClear();
    const filesBefore = store.files.size;

    await expect(upload(owner, objectId)).rejects.toMatchObject({
      code: "conflict",
      fields: ["image"],
    });
    expect(process).not.toHaveBeenCalled();
    expect(store.files.size).toBe(filesBefore);
  });

  it("lets only one of two simultaneous uploads take the last slot", async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    for (let i = 0; i < objectImageMaxCount - 1; i += 1) {
      await upload(owner, objectId);
    }

    const results = await Promise.allSettled([
      upload(owner, objectId, "img-a"),
      upload(owner, objectId, "img-b"),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect((await read(owner, objectId)).images).toHaveLength(
      objectImageMaxCount,
    );
    // The losing upload's file is removed again from the outbox.
    await processOutboxBatch(db, consumers, { batchSize: 100 });
    expect(filesOf(objectId)).toHaveLength(objectImageMaxCount);
  });

  it("replays an upload that took the last slot when it is retried", async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    for (let i = 0; i < objectImageMaxCount - 1; i += 1) {
      await upload(owner, objectId);
    }

    const idempotencyKey = key();
    const last = await upload(owner, objectId, "img-last", idempotencyKey);
    const retried = await upload(owner, objectId, "img-last", idempotencyKey);

    expect(retried).toEqual({ output: last.output, replayed: true });
    expect((await read(owner, objectId)).images).toHaveLength(
      objectImageMaxCount,
    );
  });

  it("deletes the file of an upload that crashed before it was registered", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    const kept = (await upload(owner, objectId, "img-kept")).output;
    const crashing: ImageStore = {
      get: (fileKey) => store.get(fileKey),
      remove: (fileKey) => store.remove(fileKey),
      put: async (fileKey, bytes) => {
        await store.put(fileKey, bytes);
        throw new Error("crashed after storing");
      },
    };

    await expect(
      uploadObjectImage(
        domain,
        { store: crashing, process },
        {
          actor: owner,
          objectId,
          bytes: new TextEncoder().encode("img-lost"),
          idempotencyKey: key(),
        },
      ),
    ).rejects.toThrow("crashed after storing");
    expect(filesOf(objectId)).toHaveLength(2);
    expect((await read(owner, objectId)).images).toHaveLength(1);

    await processOutboxBatch(db, consumers, { batchSize: 100 });

    expect(filesOf(objectId)).toEqual([objectImageKey(objectId, kept.imageId)]);
    // The intent is technical and stays out of the object's visible history.
    expect((await eventsFor(objectId)).map((e) => e.event_type)).toEqual([
      "object.created",
      "object.image_added",
    ]);
  });

  it("keeps an unregistered file while its upload may still be running", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    const imageId = randomUUID();
    const fileKey = objectImageKey(objectId, imageId);
    await store.put(fileKey, new TextEncoder().encode("img-slow"));
    const patient = objectImageFileCleanup({
      store: () => store,
      db: () => db,
    });
    const delivery = (occurredAt: Date) => ({
      messageId: randomUUID(),
      attempt: 1,
      event: {
        id: randomUUID(),
        type: "object.image_upload_started",
        version: 1,
        resourceType: "object",
        resourceId: objectId,
        actorUserId: null,
        correlationId: null,
        occurredAt,
        payload: { imageId },
      },
    });

    await expect(patient.handle(delivery(new Date()))).rejects.toMatchObject({
      code: "upload_in_progress",
      permanent: false,
    });
    expect(store.files.has(fileKey)).toBe(true);

    await patient.handle(delivery(new Date(Date.now() - 60 * 60 * 1000)));
    expect(store.files.has(fileKey)).toBe(false);
  });

  it("adds an image once when the upload is retried", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    const idempotencyKey = key();

    const results = await Promise.all([
      upload(owner, objectId, "img-retry", idempotencyKey),
      upload(owner, objectId, "img-retry", idempotencyKey),
    ]);
    const again = await upload(owner, objectId, "img-retry", idempotencyKey);

    expect(results[0].output).toEqual(results[1].output);
    expect(again).toMatchObject({ replayed: true, output: results[0].output });
    expect((await read(owner, objectId)).images).toHaveLength(1);

    // The same key with another file is refused, and the original is kept.
    await expect(
      upload(owner, objectId, "img-other", idempotencyKey),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    expect(
      await readObjectImage(domain, store, {
        actor: owner,
        input: { objectId, imageId: again.output.imageId },
      }),
    ).toMatchObject({ bytes: new TextEncoder().encode("img-retry") });
    await processOutboxBatch(db, consumers, { batchSize: 100 });
    expect(filesOf(objectId)).toHaveLength(1);
  });

  it("does not bring a removed image back when its upload is retried", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    const idempotencyKey = key();
    const { imageId } = (await upload(owner, objectId, "img-x", idempotencyKey))
      .output;
    await executeCommand(domain, removeObjectImage, {
      actor: owner,
      input: { objectId, imageId },
      idempotencyKey: key(),
    });
    store.files.delete(objectImageKey(objectId, imageId));

    const retried = await upload(owner, objectId, "img-x", idempotencyKey);

    expect(retried.replayed).toBe(true);
    expect((await read(owner, objectId)).images).toEqual([]);
    expect(store.files.has(objectImageKey(objectId, imageId))).toBe(false);
  });

  it("refuses anything that is not an accepted image and stores nothing", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    const filesBefore = store.files.size;

    await expect(
      upload(owner, objectId, "<svg><script>alert(1)</script></svg>"),
    ).rejects.toMatchObject({ code: "invalid_input", fields: ["image"] });
    expect(store.files.size).toBe(filesBefore);
    expect((await read(owner, objectId)).version).toBe(1);
  });

  it("requires an idempotency key", async () => {
    const owner = await user();
    const { objectId } = await create(owner);

    await expect(
      uploadObjectImage(domain, images, {
        actor: owner,
        objectId,
        bytes: new TextEncoder().encode("img"),
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_required" });
  });
});

describe("actual availability is derived, never stored (PS-OBJ-003–005)", () => {
  it("reads an object from one snapshot while it is edited", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    const later = { start: addDays(today, 30), end: addDays(today, 40) };
    // Commits an edit after the object row was read, before its children.
    const editInBetween = {
      name: "test.concurrent_edit",
      load: async () => {
        await update(owner, {
          objectId,
          expectedVersion: 1,
          availability: [later],
        });
        return [];
      },
    };

    const seen = await loadObjectDetails(db, objectId, [editInBetween]);

    expect(seen).toMatchObject({
      version: 1,
      availability: [{ from: today, until: null }],
    });
    expect(await read(owner, objectId)).toMatchObject({
      version: 2,
      availability: [later],
    });
  });

  it("lets later domains block periods through a block source", async () => {
    const owner = await user();
    const { objectId } = await create(owner);
    const source = {
      name: "test.blocks",
      load: async (_db: unknown, ids: readonly string[]) =>
        ids.map((id) => ({
          objectId: id,
          period: { from: addDays(today, 2), until: addDays(today, 5) },
        })),
    };

    const blocks = await loadAvailabilityBlocks(db, [objectId], [source]);

    expect(blocks.get(objectId)).toEqual([
      { period: { from: addDays(today, 2), until: addDays(today, 5) } },
    ]);
    // Without any source, nothing blocks and actual = general availability.
    expect(await loadAvailabilityBlocks(db, [objectId])).toEqual(
      new Map([[objectId, []]]),
    );
  });
});

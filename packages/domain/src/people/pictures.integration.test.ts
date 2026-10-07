import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { AccountStatus, UserActor } from "../actor";
import { getOwnAccount } from "../account/queries";
import { deleteOwnAccount } from "../account/deletion";
import { deactivateAccount } from "../account/lifecycle";
import { executeQuery } from "../commands/query";
import { listEnvironmentMembers } from "../environment/queries";
import type { ImageProcessor, ImageStore } from "../objects/images";
import { ConsumerRegistry } from "../outbox/consumer";
import { processOutboxBatch } from "../outbox/worker";
import { blockUser } from "../social/commands";
import { getSocialOverview } from "../social/queries";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import {
  profilePictureFileCleanup,
  profilePictureKey,
  readProfilePicture,
  removeProfilePicture,
  setProfilePictureVisibility,
  uploadProfilePicture,
} from "./pictures";
import { readPerson } from "./queries";

/**
 * Profile pictures (PS-USR-002): one per profile, replaced under a new id,
 * shown only where the reader may open the person's page, and then as the
 * person chose: generally, to friends or only to themselves.
 */

const db = connectTestDatabase();
afterAll(() => db.destroy());

/** In-memory stand-in for the storage adapter. */
const files = new Map<string, Uint8Array>();
const store: ImageStore = {
  put: async (key, bytes) => void files.set(key, bytes),
  get: async (key) => files.get(key) ?? null,
  remove: async (key) => void files.delete(key),
};
// No grace period: tests run the outbox only after their uploads finished.
const consumers = new ConsumerRegistry([
  profilePictureFileCleanup({
    store: () => store,
    db: () => db,
    uploadGraceMs: 0,
  }),
]);
const kit = loanTestKit(db, { consumers });
const { run, tick, user, friends, published } = kit;

/** Accepts anything starting with "img", like a decoder would. */
const process = vi.fn<ImageProcessor>(async (bytes) =>
  new TextDecoder().decode(bytes.subarray(0, 3)) === "img"
    ? { bytes, contentType: "image/webp", width: 384, height: 384 }
    : null,
);

const upload = async (
  actor: UserActor,
  bytes = `img-${randomUUID()}`,
  idempotencyKey = randomUUID(),
) =>
  (
    await uploadProfilePicture(
      tick(),
      { store, process },
      { actor, bytes: new TextEncoder().encode(bytes), idempotencyKey },
    )
  ).output;

const picture = (reader: UserActor, pictureId: string) =>
  readProfilePicture(tick(), store, { actor: reader, input: { pictureId } });

const seenBy = async (reader: UserActor, subject: UserActor) =>
  (
    await executeQuery(tick(), readPerson, {
      actor: reader,
      input: { userId: subject.userId },
    })
  ).pictureId;

const deliver = () => processOutboxBatch(db, consumers, { batchSize: 100 });

const filesOf = (actor: UserActor) =>
  [...files.keys()].filter((key) => key.startsWith(`people/${actor.userId}/`));

const notFound = { code: "not_found" };

describe("setting a profile picture", () => {
  it("stores the re-encoded picture and shows it on the own account", async () => {
    const me = await user();
    const bytes = `img-${randomUUID()}`;
    const { pictureId, visibility } = await upload(me, bytes);

    expect(visibility).toBe("general");
    expect(filesOf(me)).toEqual([profilePictureKey(me.userId, pictureId!)]);
    expect(
      (await executeQuery(tick(), getOwnAccount, { actor: me, input: {} }))
        .picture,
    ).toEqual({ pictureId, visibility: "general" });
    expect(await picture(me, pictureId!)).toEqual({
      bytes: new TextEncoder().encode(bytes),
      contentType: "image/webp",
    });
    expect(await seenBy(me, me)).toBe(pictureId);
  });

  it("replaces the picture under a new id and deletes the old file", async () => {
    const me = await user();
    const first = await upload(me);
    const second = await upload(me);

    expect(second.pictureId).not.toBe(first.pictureId);
    await deliver();
    expect(filesOf(me)).toEqual([
      profilePictureKey(me.userId, second.pictureId!),
    ]);
    await expect(picture(me, first.pictureId!)).rejects.toMatchObject(notFound);
  });

  it("replays a retried upload without storing it again", async () => {
    const me = await user();
    const key = randomUUID();
    const bytes = `img-${randomUUID()}`;
    const first = await upload(me, bytes, key);
    files.clear();

    expect(await upload(me, bytes, key)).toEqual(first);
    expect(filesOf(me)).toEqual([]);
  });

  it("refuses what is not an image, and deletes nothing it stored", async () => {
    const me = await user();
    const kept = await upload(me);

    await expect(upload(me, "<svg onload=alert(1)>")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await deliver();
    expect(filesOf(me)).toEqual([
      profilePictureKey(me.userId, kept.pictureId!),
    ]);
  });

  it("removes the picture and its file, and removing none is harmless", async () => {
    const me = await user();
    const { pictureId } = await upload(me);

    expect(await run(removeProfilePicture, me, {})).toEqual({
      pictureId: null,
      visibility: "general",
    });
    expect(await run(removeProfilePicture, me, {})).toMatchObject({
      pictureId: null,
    });
    await deliver();
    expect(filesOf(me)).toEqual([]);
    await expect(picture(me, pictureId!)).rejects.toMatchObject(notFound);
  });

  it("removes the picture with the account (PS-ADM-006)", async () => {
    const me = await user();
    await upload(me);
    const { status } = await db
      .selectFrom("app.users")
      .select("status")
      .where("id", "=", me.userId)
      .executeTakeFirstOrThrow();

    await run(
      deleteOwnAccount,
      {
        ...me,
        accountStatus: status as AccountStatus,
        authentication: {
          ...me.authentication,
          methods: [{ method: "otp", at: kit.now() }],
        },
      },
      {},
    );
    await deliver();
    expect(filesOf(me)).toEqual([]);
  });

  it("shows an account that is not active its initials, as its picture is not served", async () => {
    const me = await user();
    await upload(me);
    await run(deactivateAccount, me, {});
    const inactive = { ...me, accountStatus: "deactivated" as const };

    expect(
      (
        await executeQuery(tick(), getOwnAccount, {
          actor: inactive,
          input: {},
        })
      ).picture.pictureId,
    ).toBeNull();
  });
});

describe("who sees a profile picture (PS-USR-002)", () => {
  it("shows it generally to whoever may open the page, and to nobody else", async () => {
    const { environmentId, owner, borrower } = await published();
    const stranger = await user();
    const { pictureId } = await upload(owner);

    expect(await seenBy(borrower, owner)).toBe(pictureId);
    expect(await picture(borrower, pictureId!)).toMatchObject({
      contentType: "image/webp",
    });
    const { members } = await executeQuery(tick(), listEnvironmentMembers, {
      actor: borrower,
      input: { environmentId },
    });
    expect(members.find((m) => m.userId === owner.userId)).toMatchObject({
      profileId: owner.userId,
      pictureId,
    });
    // Someone without access gets the same answer as for no picture at all.
    await expect(picture(stranger, pictureId!)).rejects.toMatchObject(notFound);
    await expect(picture(stranger, randomUUID())).rejects.toMatchObject(
      notFound,
    );
  });

  it("shows it only to friends, or only to the person, when they choose so", async () => {
    const { owner, borrower } = await published();
    const friend = await user();
    await friends(owner, friend);
    const { pictureId } = await upload(owner);

    expect(
      await run(setProfilePictureVisibility, owner, { visibility: "friends" }),
    ).toEqual({ pictureId, visibility: "friends" });
    expect(await seenBy(friend, owner)).toBe(pictureId);
    expect(await seenBy(borrower, owner)).toBeNull();
    await expect(picture(borrower, pictureId!)).rejects.toMatchObject(notFound);
    const overview = await executeQuery(tick(), getSocialOverview, {
      actor: friend,
      input: {},
    });
    expect(
      overview.friends.find((f) => f.userId === owner.userId),
    ).toMatchObject({ pictureId });

    await run(setProfilePictureVisibility, owner, { visibility: "only_me" });
    expect(await seenBy(friend, owner)).toBeNull();
    await expect(picture(friend, pictureId!)).rejects.toMatchObject(notFound);
    expect(await seenBy(owner, owner)).toBe(pictureId);

    // The choice stays when the picture is replaced.
    expect(await upload(owner)).toMatchObject({ visibility: "only_me" });
  });

  it("hides it from those the person blocks the page from", async () => {
    const { owner, borrower } = await published();
    const { pictureId } = await upload(owner);
    await run(blockUser, owner, { userId: borrower.userId });

    await expect(picture(borrower, pictureId!)).rejects.toMatchObject(notFound);
  });
});

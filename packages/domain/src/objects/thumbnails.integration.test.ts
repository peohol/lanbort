import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { deleteOwnAccount } from "../account/deletion";
import { executeQuery } from "../commands/query";
import { cancelLoan } from "../loans/cancellation";
import { loanImageFile, loanRequestImageFile } from "../loans/images";
import { readLoan, readLoanRequest } from "../loans/queries";
import { ConsumerRegistry } from "../outbox/consumer";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { deliverAll } from "../testing/outbox";
import { consentToObjectDeletion } from "./deletion";
import {
  cropObjectImage,
  type ImageStore,
  readImageFile,
  removeObjectImage,
  uploadObjectImage,
} from "./images";
import { thingThumbnails, type ThumbnailMaker } from "./thumbnails";

const db = connectTestDatabase();
afterAll(() => db.destroy());

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
const encoder = new TextEncoder();
// Names the picture and the square it was made from, so a test can tell.
const thumbnails: ThumbnailMaker = async (bytes, square) => ({
  bytes: encoder.encode(
    JSON.stringify({ picture: new TextDecoder().decode(bytes), square }),
  ),
  contentType: "image/webp",
  width: 96,
  height: 96,
});
const consumers = new ConsumerRegistry([
  thingThumbnails({
    store: () => store,
    thumbnails: () => thumbnails,
    db: () => db,
  }),
]);
const kit = loanTestKit(db, { consumers });
const { run } = kit;
const images = {
  store,
  process: async (bytes: Uint8Array) => ({
    bytes,
    contentType: "image/webp" as const,
    width: 200,
    height: 100,
  }),
};

const deliver = () => deliverAll(db, consumers);

async function upload(owner: UserActor, objectId: string, name: string) {
  const { output } = await uploadObjectImage(kit.tick(), images, {
    actor: owner,
    objectId,
    bytes: encoder.encode(name),
    idempotencyKey: randomUUID(),
  });

  return output.imageId;
}

/** What the thing's own thumbnail was made from, or null without one. */
async function madeFrom(objectId: string) {
  const row = await db
    .selectFrom("app.thing_thumbnails")
    .select("bytes")
    .where("object_id", "=", objectId)
    .executeTakeFirst();

  return row ? JSON.parse(new TextDecoder().decode(row.bytes)) : null;
}

const text = (file: { bytes: Uint8Array }) =>
  JSON.parse(new TextDecoder().decode(file.bytes));

describe("a thing's thumbnail (PS-OBJ-021)", () => {
  it("follows its main picture and the square chosen of it", async () => {
    const { owner, objectId } = await kit.published();
    const first = await upload(owner, objectId, "first");
    await upload(owner, objectId, "second");
    await deliver();

    expect(await madeFrom(objectId)).toEqual({
      picture: "first",
      square: null,
    });

    await run(cropObjectImage, owner, {
      objectId,
      imageId: first,
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
    });
    await deliver();
    expect(await madeFrom(objectId)).toEqual({
      picture: "first",
      square: { left: 100, top: 0, side: 100 },
    });

    await run(removeObjectImage, owner, { objectId, imageId: first });
    await deliver();
    expect(await madeFrom(objectId)).toEqual({
      picture: "second",
      square: null,
    });
  });

  it("goes when the thing has no pictures left", async () => {
    const { owner, objectId } = await kit.published();
    const only = await upload(owner, objectId, "only");
    await deliver();
    expect(await madeFrom(objectId)).not.toBeNull();

    await run(removeObjectImage, owner, { objectId, imageId: only });
    await deliver();
    expect(await madeFrom(objectId)).toBeNull();
  });

  it("stays with the loan and the request after the thing is deleted, until the owner's account goes", async () => {
    const { owner, borrower, objectId, requestId, loanId } =
      await kit.reservedLoan();
    const stranger = await kit.user();
    const imageId = await upload(owner, objectId, "lent");
    await deliver();
    await run(cancelLoan, borrower, { loanId });
    expect(
      await run(consentToObjectDeletion, owner, { objectId }),
    ).toMatchObject({ deleted: true });

    const kept = [{ id: imageId, width: 96, height: 96, crop: null }];
    const loan = (actor: UserActor) =>
      executeQuery(kit.domain, readLoan, { actor, input: { loanId } });
    const request = (actor: UserActor) =>
      executeQuery(kit.domain, readLoanRequest, {
        actor,
        input: { requestId },
      });
    expect((await loan(borrower)).images).toEqual(kept);
    expect((await loan(owner)).images).toEqual(kept);
    expect((await request(borrower)).images).toEqual(kept);

    for (const actor of [borrower, owner]) {
      expect(
        text(
          await readImageFile(kit.domain, store, loanImageFile, {
            actor,
            input: { loanId, imageId },
          }),
        ),
      ).toEqual({ picture: "lent", square: null });
    }
    expect(
      text(
        await readImageFile(kit.domain, store, loanRequestImageFile, {
          actor: borrower,
          input: { requestId, imageId },
        }),
      ),
    ).toEqual({ picture: "lent", square: null });
    await expect(
      readImageFile(kit.domain, store, loanImageFile, {
        actor: stranger,
        input: { loanId, imageId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      readImageFile(kit.domain, store, loanImageFile, {
        actor: borrower,
        input: { loanId, imageId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    await run(deleteOwnAccount, owner, {});

    expect((await loan(borrower)).images).toEqual([]);
    expect((await request(borrower)).images).toEqual([]);
    await expect(
      readImageFile(kit.domain, store, loanImageFile, {
        actor: borrower,
        input: { loanId, imageId },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

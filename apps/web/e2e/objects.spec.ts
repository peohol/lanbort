import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import sharp from "sharp";
import { registerThroughApi } from "./helpers";

/** WP-24 end to end: the object API against the local stack and storage. */

const idempotent = () => ({ "Idempotency-Key": randomUUID() });

const newObject = {
  title: "Tilhenger",
  categoryId: "annet",
  description: "Skapbil-tilhenger, 750 kg.",
  availability: [{ start: "2030-06-01", end: "2030-08-31" }],
};

async function createObject(request: APIRequestContext) {
  const response = await request.post("/api/objects", {
    data: newObject,
    headers: idempotent(),
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { objectId: string; version: number };
}

/** A phone photo with the location in its EXIF data. */
const photoWithLocation = () =>
  sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#4a7" },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "Phone", Copyright: "Kari Nordmann" },
      IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "E" },
    })
    .toBuffer();

const uploadImage = (
  request: APIRequestContext,
  objectId: string,
  body: Buffer,
  headers: Record<string, string> = idempotent(),
) =>
  request.post(`/api/objects/${objectId}/images`, {
    data: body,
    headers: { "content-type": "image/jpeg", ...headers },
  });

test("an owner creates, edits, illustrates and archives an object", async ({
  request,
}) => {
  await registerThroughApi(request);

  const categories = await (await request.get("/api/object-categories")).json();
  expect(categories.categories).toContainEqual({
    id: "annet",
    parentId: null,
    label: "Annet",
  });

  const headers = idempotent();
  const created = await request.post("/api/objects", {
    data: newObject,
    headers,
  });
  const retried = await request.post("/api/objects", {
    data: newObject,
    headers,
  });
  const { objectId } = await created.json();
  expect(await retried.json()).toEqual({ objectId, version: 1 });
  expect(retried.headers()["idempotent-replayed"]).toBe("true");

  const edited = await request.patch(`/api/objects/${objectId}`, {
    data: {
      expectedVersion: 1,
      title: "Tilhenger med kalesje",
      availability: [
        { start: "2030-06-01", end: "2030-06-30" },
        { start: "2030-07-01", end: null },
      ],
    },
    headers: idempotent(),
  });
  expect(await edited.json()).toEqual({ objectId, version: 2 });

  // An edit based on the old version would overwrite newer data.
  const stale = await request.patch(`/api/objects/${objectId}`, {
    data: { expectedVersion: 1, description: "Utdatert" },
    headers: idempotent(),
  });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toEqual({
    error: { code: "conflict", fields: ["expectedVersion"] },
  });

  // A body cannot redirect the edit to another object.
  const redirected = await request.patch(`/api/objects/${objectId}`, {
    data: { objectId: randomUUID(), expectedVersion: 2, loanTerms: "Ingen" },
    headers: idempotent(),
  });
  expect(await redirected.json()).toEqual({ objectId, version: 3 });

  const upload = await uploadImage(
    request,
    objectId,
    await photoWithLocation(),
  );
  expect(upload.status()).toBe(200);
  const { imageId } = await upload.json();

  const object = await (await request.get(`/api/objects/${objectId}`)).json();
  expect(object).toMatchObject({
    id: objectId,
    title: "Tilhenger med kalesje",
    loanTerms: "Ingen",
    version: 4,
    // Touching intervals are one logical space.
    availability: [{ start: "2030-06-01", end: null }],
    availableForNewLoans: true,
    images: [{ id: imageId, width: 1200, height: 900 }],
  });

  // The stored image is a re-encoded WebP without the location or name.
  const image = await request.get(`/api/objects/${objectId}/images/${imageId}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/webp");
  expect(image.headers()["cache-control"]).toBe("no-store");
  const stored = await sharp(await image.body()).metadata();
  expect(stored).toMatchObject({ format: "webp", width: 1200, height: 900 });
  expect(stored.exif).toBeUndefined();

  const archived = await request.post(`/api/objects/${objectId}/archive`, {
    headers: idempotent(),
  });
  expect(await archived.json()).toEqual({ objectId, version: 5 });
  const list = await (await request.get("/api/objects")).json();
  expect(list.objects).toEqual([
    expect.objectContaining({
      id: objectId,
      status: "archived",
      availableForNewLoans: false,
    }),
  ]);

  const removed = await request.delete(
    `/api/objects/${objectId}/images/${imageId}`,
    { headers: idempotent() },
  );
  expect(removed.status()).toBe(200);
  expect(
    (await request.get(`/api/objects/${objectId}/images/${imageId}`)).status(),
  ).toBe(404);
});

test("another user's object looks exactly like a missing one", async ({
  playwright,
  request,
}) => {
  await registerThroughApi(request);
  const { objectId } = await createObject(request);
  const { imageId } = await (
    await uploadImage(request, objectId, await photoWithLocation())
  ).json();

  const { baseURL, extraHTTPHeaders } = test.info().project.use;
  const stranger = await playwright.request.newContext({
    baseURL: baseURL as string,
    extraHTTPHeaders: extraHTTPHeaders as Record<string, string>,
  });
  await registerThroughApi(stranger);

  for (const target of [objectId, randomUUID()]) {
    const attempts = [
      stranger.get(`/api/objects/${target}`),
      stranger.patch(`/api/objects/${target}`, {
        data: { expectedVersion: 2, title: "Min" },
        headers: idempotent(),
      }),
      stranger.post(`/api/objects/${target}/archive`, {
        headers: idempotent(),
      }),
      stranger.post(`/api/objects/${target}/restore`, {
        headers: idempotent(),
      }),
      uploadImage(stranger, target, await photoWithLocation()),
      stranger.get(`/api/objects/${target}/images/${imageId}`),
      stranger.delete(`/api/objects/${target}/images/${imageId}`, {
        headers: idempotent(),
      }),
    ];

    for (const response of await Promise.all(attempts)) {
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: { code: "not_found" } });
    }
  }

  expect((await (await stranger.get("/api/objects")).json()).objects).toEqual(
    [],
  );
  expect(
    await (await request.get(`/api/objects/${objectId}`)).json(),
  ).toMatchObject({ title: newObject.title, version: 2, status: "active" });
  await stranger.dispose();
});

test("object APIs refuse anonymous callers and bad uploads", async ({
  request,
}) => {
  for (const response of await Promise.all([
    request.get("/api/objects"),
    request.post("/api/objects", { data: newObject, headers: idempotent() }),
    request.get("/api/object-categories"),
    request.get(`/api/objects/${randomUUID()}`),
  ])) {
    expect(response.status()).toBe(401);
  }

  await registerThroughApi(request);
  const { objectId } = await createObject(request);

  const html = await uploadImage(
    request,
    objectId,
    Buffer.from("<!doctype html><script>alert(1)</script>"),
  );
  expect(html.status()).toBe(400);
  expect(await html.json()).toEqual({
    error: { code: "invalid_input", fields: ["image"] },
  });

  const tooLarge = await uploadImage(
    request,
    objectId,
    Buffer.alloc(4 * 1024 * 1024 + 1),
  );
  expect(tooLarge.status()).toBe(400);
  expect(await tooLarge.json()).toEqual({
    error: { code: "invalid_input", fields: ["image"] },
  });

  const withoutKey = await uploadImage(
    request,
    objectId,
    await photoWithLocation(),
    {},
  );
  expect(await withoutKey.json()).toEqual({
    error: { code: "idempotency_key_required" },
  });

  const object = await (await request.get(`/api/objects/${objectId}`)).json();
  expect(object).toMatchObject({ version: 1, images: [] });
});

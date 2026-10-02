import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { registerThroughApi } from "./helpers";

/** WP-26 over HTTP: co-owners share an object without overriding each other. */

const idempotent = () => ({ "Idempotency-Key": randomUUID() });

const post = (request: APIRequestContext, path: string, data?: object) =>
  request.post(path, { data, headers: idempotent() });

async function accountId(request: APIRequestContext): Promise<string> {
  return (await (await request.get("/api/account")).json()).userId;
}

test("two users co-own an object until a block makes one of them leave", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request);
  const anna = await accountId(request);
  const other = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(other);
  const bo = await accountId(other);

  const { objectId } = await (
    await post(request, "/api/objects", {
      title: "Tilhenger",
      categoryId: "annet",
      description: "Skapbil-tilhenger, 750 kg.",
      availability: [{ start: "2030-06-01", end: null }],
    })
  ).json();

  // Invited is not owner: the object stays hidden until Bo accepts.
  const invited = await post(
    request,
    `/api/objects/${objectId}/co-owners/invitations`,
    { userId: bo },
  );
  const { invitationId } = await invited.json();
  expect((await other.get(`/api/objects/${objectId}`)).status()).toBe(404);
  expect(
    (await (await other.get("/api/object-invitations")).json()).invitations,
  ).toMatchObject([{ id: invitationId, objectId, invitedByUserId: anna }]);

  expect(
    await (
      await post(other, "/api/object-invitations/accept", { invitationId })
    ).json(),
  ).toEqual({ objectId });
  const shared = await (await other.get(`/api/objects/${objectId}`)).json();
  expect(
    shared.owners.map((owner: { userId: string }) => owner.userId),
  ).toEqual([anna, bo]);

  // Bo restricts new loans; Anna can see but not lift it.
  const { restrictionId } = await (
    await post(other, `/api/objects/${objectId}/restrictions`, {
      period: { start: "2030-07-01", end: "2030-07-31" },
    })
  ).json();
  const lift = await post(
    request,
    `/api/objects/${objectId}/restrictions/lift`,
    {
      restrictionId,
    },
  );
  expect(lift.status()).toBe(403);
  expect(await lift.json()).toEqual({ error: { code: "forbidden" } });

  // A block between them freezes new loans; only clarifying ownership ends it.
  await post(request, "/api/social/blocks", { userId: bo });
  expect(
    await (await request.get(`/api/objects/${objectId}`)).json(),
  ).toMatchObject({ frozenForNewLoans: true, availableForNewLoans: false });

  expect(
    (await post(other, `/api/objects/${objectId}/co-owners/leave`)).status(),
  ).toBe(200);
  expect(
    await (await request.get(`/api/objects/${objectId}`)).json(),
  ).toMatchObject({ frozenForNewLoans: false, restrictions: [] });
  expect((await other.get(`/api/objects/${objectId}`)).status()).toBe(404);

  const history = await (
    await request.get(`/api/objects/${objectId}/history`)
  ).json();
  expect(history.revisions).toMatchObject([
    { version: 1, change: "created", actorUserId: anna },
  ]);

  expect(
    await (
      await post(request, `/api/objects/${objectId}/deletion/consent`)
    ).json(),
  ).toEqual({ objectId, deleted: true });
  expect((await request.get(`/api/objects/${objectId}`)).status()).toBe(404);
});

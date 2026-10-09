import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { registerThroughApi } from "./helpers";

/** WP-20 over HTTP: friendships and blocks between two real accounts. */

async function accountId(request: APIRequestContext): Promise<string> {
  return (await (await request.get("/api/account")).json()).userId;
}

const command = (
  request: APIRequestContext,
  path: string,
  userId: string,
  key = randomUUID(),
) =>
  request.post(`/api/social/${path}`, {
    data: { userId },
    headers: { "Idempotency-Key": key },
  });

test("two users become friends, and a block hides the blocker", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request, undefined, "Anna Berg");
  const anna = await accountId(request);
  const other = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(other, undefined, "Bo Dahl");
  const bo = await accountId(other);

  // A retried request replays the first result.
  const key = randomUUID();
  const sent = await command(request, "friend-requests", bo, key);
  expect(await sent.json()).toEqual({
    userId: bo,
    friendship: "outgoing_pending",
    blockedByMe: false,
    canRequest: false,
  });
  const retried = await command(request, "friend-requests", bo, key);
  expect(retried.headers()["idempotent-replayed"]).toBe("true");

  expect(
    (await (await other.get("/api/social")).json()).incomingRequests,
  ).toMatchObject([{ userId: anna, realName: "Anna Berg" }]);
  expect(
    await (await command(other, "friend-requests/accept", anna)).json(),
  ).toMatchObject({ friendship: "friends" });

  const blocked = await command(request, "blocks", bo);
  expect(await blocked.json()).toEqual({
    userId: bo,
    friendship: "none",
    blockedByMe: true,
    canRequest: false,
  });

  // To Bo, Anna now answers exactly like an account that does not exist.
  for (const [method, path] of [
    ["GET", "relation"],
    ["POST", "friend-requests"],
    ["POST", "friends/remove"],
  ] as const) {
    const responses = await Promise.all(
      [anna, randomUUID()].map((userId) =>
        method === "GET"
          ? other.get(`/api/social/${path}?userId=${userId}`)
          : command(other, path, userId),
      ),
    );

    for (const response of responses) {
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({ error: { code: "not_found" } });
    }
  }
  expect(await (await other.get("/api/social")).json()).toEqual({
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    blocked: [],
  });

  // Lifting the block brings nothing back.
  await command(request, "blocks/lift", bo);
  expect(
    await (await request.get(`/api/social/relation?userId=${bo}`)).json(),
  ).toEqual({
    userId: bo,
    friendship: "none",
    blockedByMe: false,
    canRequest: true,
  });

  await other.dispose();
});

test("after a declined request only the recipient can ask, and nothing says why", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request, undefined, "Anna Berg");
  const anna = await accountId(request);
  const other = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(other, undefined, "Bo Dahl");
  const bo = await accountId(other);

  await command(request, "friend-requests", bo);
  await command(other, "friend-requests/decline", anna);

  // A direct call is refused exactly like a request to someone Anna blocks
  // (PS-USR-012): the same status and body, and no reason.
  const again = await command(request, "friend-requests", bo);
  expect(again.status()).toBe(403);
  expect(await again.json()).toEqual({ error: { code: "forbidden" } });
  expect(
    await (await request.get(`/api/social/relation?userId=${bo}`)).json(),
  ).toEqual({
    userId: bo,
    friendship: "none",
    blockedByMe: false,
    canRequest: false,
  });

  // Bo can ask, and that lifts the hold even once Bo withdraws.
  expect(
    await (await command(other, "friend-requests", anna)).json(),
  ).toMatchObject({ friendship: "outgoing_pending" });
  await command(other, "friend-requests/withdraw", anna);
  expect(
    await (await command(request, "friend-requests", bo)).json(),
  ).toMatchObject({ friendship: "outgoing_pending" });

  await other.dispose();
});

test("social APIs need a signed-in user and an idempotency key", async ({
  request,
}) => {
  expect((await request.get("/api/social")).status()).toBe(401);
  expect(
    (await command(request, "friend-requests", randomUUID())).status(),
  ).toBe(401);

  await registerThroughApi(request);
  const missingKey = await request.post("/api/social/blocks", {
    data: { userId: randomUUID() },
  });
  expect(missingKey.status()).toBe(400);
  expect(await missingKey.json()).toEqual({
    error: { code: "idempotency_key_required" },
  });
});

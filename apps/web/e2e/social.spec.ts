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
  ).toEqual({ userId: bo, friendship: "none", blockedByMe: false });

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

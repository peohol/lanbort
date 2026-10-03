import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { registerThroughApi } from "./helpers";

/**
 * WP-40 over HTTP: a friend request becomes a notification through the
 * outbox job, the addressee reads it, and the preferences keep required
 * and action notifications in the app.
 */

const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` };

async function accountId(request: APIRequestContext): Promise<string> {
  return (await (await request.get("/api/account")).json()).userId;
}

/** Drains the outbox until `request` has a notification about `userId`. */
async function notificationAbout(request: APIRequestContext, userId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    expect(
      (await request.get("/api/internal/outbox", { headers: cron })).ok(),
    ).toBe(true);
    const { notifications } = await (
      await request.get("/api/notifications")
    ).json();
    const found = notifications.find(
      (item: { target: { id: string } }) => item.target.id === userId,
    );

    if (found) {
      return found;
    }
  }

  throw new Error("The notification never arrived");
}

test("a friend request reaches the addressee's notification centre", async ({
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

  await request.post("/api/social/friend-requests", {
    data: { userId: bo },
    headers: { "Idempotency-Key": randomUUID() },
  });

  const notification = await notificationAbout(other, anna);
  expect(notification).toMatchObject({
    kind: "social.friend_request",
    level: "action",
    target: { type: "user", id: anna },
    readAt: null,
  });
  // It carries no name or other content: only what it leads to.
  expect(JSON.stringify(notification)).not.toContain("Anna");

  // Anna cannot read or mark Bo's notification.
  const foreign = await request.post("/api/notifications/read", {
    data: { notificationIds: [notification.id] },
  });
  expect(foreign.status()).toBe(404);

  const read = await other.post("/api/notifications/read", {
    data: { notificationIds: [notification.id] },
  });
  expect(read.status()).toBe(200);
  expect(
    (await (await other.get("/api/notifications")).json()).notifications.find(
      (item: { id: string }) => item.id === notification.id,
    ).readAt,
  ).not.toBeNull();
});

test("preferences keep required and action notifications in the app", async ({
  request,
}) => {
  await registerThroughApi(request);

  const required = await request.post("/api/notifications/preferences", {
    data: { level: "required", channel: "in_app", enabled: false },
  });
  expect(required.status()).toBe(400);
  expect(await required.json()).toEqual({
    error: { code: "invalid_input", fields: ["channel"] },
  });

  const information = await request.post("/api/notifications/preferences", {
    data: { level: "information", channel: "in_app", enabled: false },
  });
  expect(information.status()).toBe(200);
  expect(
    (await (await request.get("/api/notifications/preferences")).json())
      .levels[2],
  ).toEqual({
    level: "information",
    channels: [
      { channel: "in_app", enabled: false, configurable: true },
      { channel: "email", enabled: false, configurable: true },
    ],
  });
});

test("the notification centre needs a signed-in user", async ({ request }) => {
  for (const path of ["/api/notifications", "/api/notifications/preferences"]) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

test("the loan deadline job only runs for the scheduler", async ({
  request,
}) => {
  const path = "/api/internal/notification-deadlines";

  expect((await request.get(path)).status()).toBe(401);
  const run = await request.get(path, { headers: cron });
  expect(run.status()).toBe(200);
  expect(await run.json()).toEqual({ notified: expect.any(Number) });
});

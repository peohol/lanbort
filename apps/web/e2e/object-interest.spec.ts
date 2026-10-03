import { randomUUID } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type PlaywrightWorkerArgs,
  test,
} from "@playwright/test";
import { registerThroughApi } from "./helpers";

/**
 * WP-63 over HTTP: a member asks about an object in an environment, the
 * owner is told and answers there, and a member of another environment
 * where the object is also published sees none of it; a member subscribes
 * to the object and is told when its content changes.
 */

const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` };

const post = (request: APIRequestContext, path: string, data: object) =>
  request.post(path, { data, headers: { "Idempotency-Key": randomUUID() } });

/** Subscribing and unsubscribing are harmless to repeat: no key. */
const subscription = (request: APIRequestContext, path: string, data: object) =>
  request.post(`/api/object-subscriptions${path}`, { data });

async function signedInUser(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string,
) {
  const context = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  await registerThroughApi(context);
  return context;
}

async function openEnvironment(owner: APIRequestContext, name: string) {
  const { environmentId } = await (
    await post(owner, "/api/environments", { name, type: "open" })
  ).json();
  return environmentId as string;
}

const join = (member: APIRequestContext, environmentId: string) =>
  post(member, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });

/** Drains the outbox until `request` has a notification of `kind`. */
async function notified(request: APIRequestContext, kind: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    expect(
      (await request.get("/api/internal/outbox", { headers: cron })).ok(),
    ).toBe(true);
    const { notifications } = await (
      await request.get("/api/notifications")
    ).json();
    const found = notifications.find(
      (item: { kind: string }) => item.kind === kind,
    );

    if (found) {
      return found;
    }
  }

  throw new Error(`No ${kind} notification arrived`);
}

test("questions stay in their environment, and subscribers hear of changes", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request);
  const garden = await openEnvironment(request, "Hagelaget");
  const block = await openEnvironment(request, "Borettslaget");
  const { objectId } = await (
    await post(request, "/api/objects", {
      title: "Stige",
      categoryId: "annet",
      description: "Fire meter.",
      availability: [{ start: "2030-06-01", end: null }],
    })
  ).json();
  for (const environmentId of [garden, block]) {
    await post(request, `/api/objects/${objectId}/publications`, {
      environmentId,
    });
  }

  const member = await signedInUser(playwright, baseURL!);
  await join(member, garden);
  const neighbour = await signedInUser(playwright, baseURL!);
  await join(neighbour, block);

  const asked = await post(member, "/api/object-questions", {
    environmentId: garden,
    objectId,
    body: "Rekker den til takrennen?",
  });
  expect(asked.status()).toBe(200);
  const { questionId } = await asked.json();

  const notification = await notified(request, "object.question_asked");
  expect(notification).toMatchObject({
    level: "action",
    target: { type: "object_question", id: questionId },
  });
  // It carries no text: only what it leads to.
  expect(JSON.stringify(notification)).not.toContain("takrennen");

  const answered = await post(request, "/api/object-questions/reply", {
    questionId,
    body: "Ja, med god margin.",
  });
  expect(answered.status()).toBe(200);
  const thread = await (
    await member.get(`/api/object-questions/thread?questionId=${questionId}`)
  ).json();
  expect(
    thread.posts.map((item: { byOwner: boolean }) => item.byOwner),
  ).toEqual([false, true]);

  // The neighbour finds the same object in another environment, without
  // its questions, and cannot reach this one.
  expect(
    (
      await (
        await neighbour.get(
          `/api/object-questions?environmentId=${block}&objectId=${objectId}`,
        )
      ).json()
    ).questions,
  ).toEqual([]);
  expect(
    (
      await neighbour.get(
        `/api/object-questions/thread?questionId=${questionId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await post(neighbour, "/api/object-questions/reply", {
        questionId,
        body: "Hei",
      })
    ).status(),
  ).toBe(404);

  // Subscribing, and hearing of a change.
  expect((await subscription(neighbour, "", { objectId })).status()).toBe(200);
  const { version } = await (
    await request.get(`/api/objects/${objectId}`)
  ).json();
  await request.patch(`/api/objects/${objectId}`, {
    data: {
      expectedVersion: version,
      description: "Fire meter, nye gummiføtter.",
    },
    headers: { "Idempotency-Key": randomUUID() },
  });
  const changed = await notified(neighbour, "object.changed");
  const { subscriptions } = await (
    await neighbour.get("/api/object-subscriptions")
  ).json();
  expect(subscriptions).toEqual([
    expect.objectContaining({
      id: changed.target.id,
      objectId,
      active: true,
      object: expect.objectContaining({
        description: "Fire meter, nye gummiføtter.",
      }),
    }),
  ]);

  expect(
    (await subscription(neighbour, "/cancel", { objectId })).status(),
  ).toBe(200);
});

test("questions and subscriptions need a signed-in user", async ({
  request,
}) => {
  for (const path of [
    "/api/object-subscriptions",
    `/api/object-questions/thread?questionId=${randomUUID()}`,
  ]) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

test("the subscription job only runs for the scheduler", async ({
  request,
}) => {
  const path = "/api/internal/object-subscriptions";

  expect((await request.get(path)).status()).toBe(401);
  const run = await request.get(path, { headers: cron });
  expect(run.status()).toBe(200);
  expect(await run.json()).toEqual({ notified: expect.any(Number) });
});

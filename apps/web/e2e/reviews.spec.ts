import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { registerThroughApi, showToFriends } from "./helpers";

/**
 * WP-50 over HTTP: after a friend's loan is cancelled, both parties may
 * review each other on what they experienced; the first review stays hidden
 * until the other one comes, then both are published, and the reviewed party
 * responds once. Nobody else sees any of it.
 */

const post = (
  request: APIRequestContext,
  path: string,
  data?: object,
  key = randomUUID(),
) => request.post(path, { data, headers: { "Idempotency-Key": key } });

async function accountId(request: APIRequestContext): Promise<string> {
  return (await (await request.get("/api/account")).json()).userId;
}

test("the parties of a cancelled loan review each other double-blind", async ({
  request,
  playwright,
  baseURL,
}) => {
  const context = () =>
    playwright.request.newContext({
      baseURL: baseURL!,
      extraHTTPHeaders: { origin: baseURL! },
    });
  await registerThroughApi(request);
  const anna = await accountId(request);
  const bo = await context();
  await registerThroughApi(bo);
  const boId = await accountId(bo);
  const stranger = await context();
  await registerThroughApi(stranger);

  await post(request, "/api/social/friend-requests", { userId: boId });
  await post(bo, "/api/social/friend-requests/accept", { userId: anna });
  const { objectId } = await (
    await post(request, "/api/objects", {
      title: "Stige",
      categoryId: "annet",
      description: "Aluminiumsstige, 4 meter.",
      availability: [{ start: "2030-07-01", end: null }],
    })
  ).json();
  await showToFriends(request, objectId);
  const preview = await (
    await bo.get(`/api/loan-requests/preview?objectId=${objectId}`)
  ).json();
  const { requestId } = await (
    await post(bo, "/api/loan-requests", {
      objectId,
      origin: { kind: "direct" },
      start: { kind: "date", date: "2030-07-10" },
      end: { kind: "date", date: "2030-07-12" },
      message: "Kan jeg låne stigen?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    })
  ).json();
  await post(request, `/api/loan-requests/${requestId}/responsibility`, {
    declarationVersion: preview.responsibilityDeclarationVersion,
  });
  const { loanId } = await (
    await post(request, `/api/loan-requests/${requestId}/approve`)
  ).json();
  const reviewsPath = `/api/loans/${loanId}/reviews`;

  // Nothing to review before the loan ends.
  expect(await (await bo.get(reviewsPath)).json()).toEqual({
    loanId,
    role: "borrower",
    title: "Stige",
    counterpart: expect.objectContaining({ realName: expect.any(String) }),
    window: null,
    own: null,
    received: null,
  });
  await post(bo, `/api/loans/${loanId}/cancel`);

  // A cancelled loan is reviewed only on what the parties experienced.
  const opened = await (await bo.get(reviewsPath)).json();
  expect(opened.window).toEqual({
    status: "open",
    basis: "cancelled",
    dueAt: expect.any(String),
    dimensions: ["communication"],
  });
  expect((await stranger.get(reviewsPath)).status()).toBe(404);
  expect(
    (
      await post(stranger, reviewsPath, {
        scores: [{ dimension: "communication", score: 5 }],
      })
    ).status(),
  ).toBe(404);

  // A low score needs an explanation.
  const unexplained = await post(request, reviewsPath, {
    scores: [{ dimension: "communication", score: 2 }],
  });
  expect(unexplained.status()).toBe(400);
  expect(await unexplained.json()).toEqual({
    error: { code: "invalid_input", fields: ["text"] },
  });

  const first = await post(request, reviewsPath, {
    scores: [{ dimension: "communication", score: 2 }],
    text: "Avlyste uten å si fra.",
  });
  expect(first.status()).toBe(200);
  const { reviewId } = await first.json();
  // Bo cannot see Anna's review while it is hidden.
  expect(await (await bo.get(reviewsPath)).json()).toMatchObject({
    own: null,
    received: null,
  });

  expect(
    await (
      await post(bo, reviewsPath, {
        scores: [{ dimension: "communication", score: 4 }],
      })
    ).json(),
  ).toMatchObject({ status: "published" });
  expect((await (await bo.get(reviewsPath)).json()).received).toMatchObject({
    id: reviewId,
    authorRole: "lender",
    status: "published",
    scores: [{ dimension: "communication", score: 2, contested: false }],
    text: "Avlyste uten å si fra.",
  });

  // Bo responds once; Anna sees the response with her review.
  const response = `${reviewsPath}/response`;
  expect((await post(stranger, response, { text: "Hei" })).status()).toBe(404);
  expect(
    (await post(bo, response, { text: "Beklager, ble syk." })).status(),
  ).toBe(200);
  expect((await post(bo, response, { text: "En til." })).status()).toBe(409);
  expect(
    (await (await request.get(reviewsPath)).json()).own.response,
  ).toMatchObject({ text: "Beklager, ble syk." });
});

test("the review publication job only runs for the scheduler", async ({
  request,
}) => {
  const path = "/api/internal/loan-reviews";

  expect((await request.get(path)).status()).toBe(401);
  const run = await request.get(path, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  expect(await run.json()).toEqual({ published: expect.any(Number) });
});

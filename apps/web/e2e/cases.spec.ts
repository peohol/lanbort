import { randomUUID } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type PlaywrightWorkerArgs,
  test,
} from "@playwright/test";
import { registerThroughApi } from "./helpers";

/**
 * WP-45 over HTTP: a member contacts the environment's administrators, who
 * find it in their queue and take it; a friend reports that a user may be
 * permanently unavailable, which that user never sees.
 */

const post = (request: APIRequestContext, path: string, data?: object) =>
  request.post(path, { data, headers: { "Idempotency-Key": randomUUID() } });

async function signedInUser(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string,
) {
  const context = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  await registerThroughApi(context);
  const { userId } = await (await context.get("/api/account")).json();

  return { context, userId: userId as string };
}

test("a member's contact goes to the administrators' queue and is taken by one", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request, undefined, "Eva Eier");
  const { environmentId } = await (
    await post(request, "/api/environments", {
      name: "Borettslaget",
      type: "open",
    })
  ).json();
  const member = await signedInUser(playwright, baseURL!);
  await post(member.context, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });
  const outsider = await signedInUser(playwright, baseURL!);

  const opened = await post(member.context, "/api/environments/contact", {
    environmentId,
    body: "Hvem har nøkkelen til boden?",
  });
  expect(opened.status()).toBe(200);
  const { caseId } = await opened.json();
  expect(
    (
      await post(outsider.context, "/api/environments/contact", {
        environmentId,
        body: "Hei",
      })
    ).status(),
  ).toBe(403);

  const queue = await (
    await request.get(
      `/api/cases/queue/environment?environmentId=${environmentId}`,
    )
  ).json();
  expect(queue.items).toEqual([
    expect.objectContaining({ id: caseId, handling: "queued" }),
  ]);
  expect(
    (
      await member.context.get(
        `/api/cases/queue/environment?environmentId=${environmentId}`,
      )
    ).status(),
  ).toBe(403);

  expect((await post(request, `/api/cases/${caseId}/claim`)).status()).toBe(
    200,
  );
  expect(
    (
      await post(request, `/api/cases/${caseId}/entries`, {
        body: "Den henger i gangen.",
        audience: "parties",
      })
    ).status(),
  ).toBe(200);

  const asMember = await (
    await member.context.get(`/api/cases/${caseId}`)
  ).json();
  expect(asMember).toMatchObject({
    viewer: "party",
    handling: "assigned",
    history: [],
  });
  expect(asMember.entries.map((entry: { body: string }) => entry.body)).toEqual(
    ["Hvem har nøkkelen til boden?", "Den henger i gangen."],
  );
  expect((await outsider.context.get(`/api/cases/${caseId}`)).status()).toBe(
    404,
  );
  expect((await (await member.context.get("/api/cases")).json()).items).toEqual(
    [expect.objectContaining({ id: caseId })],
  );
});

test("a report that a friend may be permanently unavailable is hidden from them", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request);
  const { userId: reporterId } = await (
    await request.get("/api/account")
  ).json();
  const friend = await signedInUser(playwright, baseURL!);
  await post(request, "/api/social/friend-requests", { userId: friend.userId });
  await post(friend.context, "/api/social/friend-requests/accept", {
    userId: reporterId,
  });

  const reported = await post(request, "/api/cases/unavailability-reports", {
    userId: friend.userId,
    body: "Jeg har hørt at han er død.",
  });
  expect(reported.status()).toBe(200);
  const { caseId } = await reported.json();

  expect((await friend.context.get(`/api/cases/${caseId}`)).status()).toBe(404);
  expect((await (await friend.context.get("/api/cases")).json()).items).toEqual(
    [],
  );
  // Only platform stewards, with stronger authentication, see the reports.
  expect((await request.get("/api/cases/queue/platform")).status()).toBe(403);
  expect(
    (await post(request, `/api/loans/${randomUUID()}/control`)).status(),
  ).toBe(404);
});

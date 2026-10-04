import { randomUUID } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type PlaywrightWorkerArgs,
  test,
} from "@playwright/test";
import { registerThroughApi } from "./helpers";

/**
 * WP-52 over HTTP: a member reports an object published in the environment;
 * an administrator takes the report, blocks the publication there and sends
 * the report on to the platform. The owner never sees the report, and only
 * its handlers see the measures.
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

  return context;
}

test("an administrator blocks a reported object locally and escalates the report", async ({
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
  const [owner, reporter, outsider] = await Promise.all([
    signedInUser(playwright, baseURL!),
    signedInUser(playwright, baseURL!),
    signedInUser(playwright, baseURL!),
  ]);
  for (const member of [owner, reporter]) {
    await post(member, "/api/environments/membership/join", {
      environmentId,
      answers: [],
    });
  }
  const { objectId } = await (
    await post(owner, "/api/objects", {
      title: "Motorsag",
      categoryId: "annet",
      description: "Bensindrevet.",
      availability: [{ start: "2030-07-01", end: null }],
    })
  ).json();
  expect(
    (
      await post(owner, `/api/objects/${objectId}/publications`, {
        environmentId,
      })
    ).status(),
  ).toBe(200);

  const report = {
    environmentId,
    target: { kind: "object", objectId },
    body: "Den mangler kjedebrems.",
  };
  expect(
    (await post(outsider, "/api/environments/reports", report)).status(),
  ).toBe(403);
  const opened = await post(reporter, "/api/environments/reports", report);
  expect(opened.status()).toBe(200);
  const { caseId } = await opened.json();

  // The owner is what the report is about and never sees it.
  expect((await owner.get(`/api/cases/${caseId}`)).status()).toBe(404);
  expect((await post(owner, `/api/cases/${caseId}/claim`)).status()).toBe(404);

  expect((await post(request, `/api/cases/${caseId}/claim`)).status()).toBe(
    200,
  );
  const measures = `/api/cases/${caseId}/measures`;
  // A local report gets no platform measure.
  expect(
    (
      await post(request, measures, {
        measure: "object_blocked",
        reason: "Farlig.",
      })
    ).status(),
  ).toBe(409);
  const taken = await post(request, measures, {
    measure: "publication_blocked",
    reason: "Farlig uten kjedebrems.",
  });
  expect(taken.status()).toBe(200);
  expect(await taken.json()).toMatchObject({
    caseId,
    measure: "publication_blocked",
  });

  expect((await (await request.get(measures)).json()).items).toEqual([
    expect.objectContaining({
      kind: "publication_blocked",
      scope: "environment",
      reason: "Farlig uten kjedebrems.",
    }),
  ]);
  // The reporter is a participant, not a handler.
  expect((await reporter.get(measures)).status()).toBe(403);
  expect(
    (
      await (
        await reporter.get(
          `/api/environments/objects?environmentId=${environmentId}`,
        )
      ).json()
    ).objects,
  ).toEqual([]);

  const escalated = await post(request, `/api/cases/${caseId}/escalate`, {
    body: "Bør vurderes for hele plattformen.",
  });
  expect(escalated.status()).toBe(200);
  expect((await escalated.json()).caseId).not.toBe(caseId);
});

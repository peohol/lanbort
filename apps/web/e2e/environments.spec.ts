import { randomUUID } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type PlaywrightWorkerArgs,
  test,
} from "@playwright/test";
import { befriend, registerThroughApi } from "./helpers";

/** WP-21 over HTTP: environments, membership flows and hidden environments. */

const post = (request: APIRequestContext, path: string, data: object) =>
  request.post(`/api/environments${path}`, {
    data,
    headers: { "Idempotency-Key": randomUUID() },
  });

const read = (request: APIRequestContext, environmentId: string) =>
  request.get(`/api/environments/details?environmentId=${environmentId}`);

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

test("a closed environment takes members through an administrator's approval", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request, undefined, "Eva Eier");
  const created = await post(request, "", {
    name: "Borettslaget",
    type: "closed",
    requirements: [{ kind: "information", text: "Hvilken leilighet?" }],
  });
  expect(created.status()).toBe(200);
  const { environmentId } = await created.json();

  const applicant = await signedInUser(playwright, baseURL!);
  const preview = await (await read(applicant.context, environmentId)).json();
  expect(preview).toMatchObject({ type: "closed", membership: null });

  const applied = await post(applicant.context, "/membership/join", {
    environmentId,
    answers: [{ requirementId: preview.requirements[0].id, answer: "H0201" }],
  });
  expect(await applied.json()).toMatchObject({ state: "pending" });

  // Only the administrator sees and decides on applications.
  expect(
    (
      await applicant.context.get(
        `/api/environments/memberships?environmentId=${environmentId}`,
      )
    ).status(),
  ).toBe(403);
  const { memberships } = await (
    await request.get(
      `/api/environments/memberships?environmentId=${environmentId}`,
    )
  ).json();
  const application = memberships.find(
    (membership: { userId: string }) => membership.userId === applicant.userId,
  );
  expect(application).toMatchObject({
    state: "pending",
    answers: [{ answer: "H0201" }],
  });

  const approved = await post(request, "/memberships/approve", {
    environmentId,
    membershipId: application.id,
  });
  expect(await approved.json()).toEqual({
    membershipId: application.id,
    state: "active",
  });
  expect(
    (await (await read(applicant.context, environmentId)).json()).membership
      .state,
  ).toBe("active");
});

test("a hidden environment does not exist for anyone it has not invited", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request);
  const { environmentId } = await (
    await post(request, "", { name: "Hemmelig", type: "hidden" })
  ).json();
  const outsider = await signedInUser(playwright, baseURL!);
  const missing = randomUUID();

  // The same answer as for an environment that does not exist.
  for (const id of [environmentId, missing]) {
    const response = await read(outsider.context, id);
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "not_found" } });

    const join = await post(outsider.context, "/membership/join", {
      environmentId: id,
      answers: [],
    });
    expect(join.status()).toBe(404);
  }
  expect(
    await (await outsider.context.get("/api/environments")).json(),
  ).toEqual([]);

  // After an account-bound invitation the invited user sees and accepts it.
  // An administrator invites only someone they may see (PS-ENV-018).
  await befriend(request, outsider.context);
  await post(request, "/memberships/invite", {
    environmentId,
    userId: outsider.userId,
  });
  expect(
    await (await outsider.context.get("/api/environments")).json(),
  ).toMatchObject([{ id: environmentId, membershipState: "pending" }]);
  const accepted = await post(outsider.context, "/membership/accept", {
    environmentId,
    answers: [],
  });
  expect(await accepted.json()).toMatchObject({ state: "active" });
});

test("environment APIs require a signed-in user and the app's own origin", async ({
  request,
}) => {
  expect((await request.get("/api/environments")).status()).toBe(401);

  await registerThroughApi(request);
  const crossSite = await request.post("/api/environments", {
    data: { name: "X", type: "open" },
    headers: {
      "Idempotency-Key": randomUUID(),
      origin: "https://evil.example",
    },
  });
  expect(crossSite.status()).toBe(403);
  const withoutKey = await request.post("/api/environments", {
    data: { name: "X", type: "open" },
  });
  expect(await withoutKey.json()).toEqual({
    error: { code: "idempotency_key_required" },
  });
});

test("the transition job only runs for the scheduler", async ({ request }) => {
  const path = "/api/internal/environment-memberships";

  expect((await request.get(path)).status()).toBe(401);
  const run = await request.get(path, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  expect(await run.json()).toMatchObject({ passivated: expect.any(Number) });
});

test("roles are taken on by accepting, and ownership is handed over (WP-22)", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request, undefined, "Eva Eier");
  const { environmentId } = await (
    await post(request, "", { name: "Borettslaget", type: "open" })
  ).json();
  const candidate = await signedInUser(playwright, baseURL!);
  await post(candidate.context, "/membership/join", {
    environmentId,
    answers: [],
  });

  const invited = await post(request, "/roles/invite-administrator", {
    environmentId,
    userId: candidate.userId,
  });
  const { invitationId } = await invited.json();
  // The role is not active before the member accepts.
  expect(
    (
      await candidate.context.get(
        `/api/environments/roles?environmentId=${environmentId}`,
      )
    ).status(),
  ).toBe(403);
  expect(
    await (
      await post(candidate.context, "/roles/accept", {
        environmentId,
        invitationId,
      })
    ).json(),
  ).toEqual({ roles: ["administrator"] });

  // Another administrator cannot use the owner's powers.
  expect(
    (await post(candidate.context, "/wind-down", { environmentId })).status(),
  ).toBe(403);

  // The owner signed in just now, which handing over requires.
  const offer = await (
    await post(request, "/roles/offer-ownership", {
      environmentId,
      userId: candidate.userId,
    })
  ).json();
  await post(candidate.context, "/roles/accept", {
    environmentId,
    invitationId: offer.invitationId,
  });
  const { holders } = await (
    await candidate.context.get(
      `/api/environments/roles?environmentId=${environmentId}`,
    )
  ).json();
  expect(holders.map((holder: { roles: string[] }) => holder.roles)).toEqual([
    ["administrator"],
    ["owner", "administrator"],
  ]);
});

test("the continuity job only runs for the scheduler", async ({ request }) => {
  const path = "/api/internal/environment-continuity";

  expect((await request.get(path)).status()).toBe(401);
  const run = await request.get(path, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  expect(await run.json()).toMatchObject({ finalized: expect.any(Number) });
});

test("type changes: stricter at once, weaker only as a proposal (WP-23)", async ({
  request,
  playwright,
  baseURL,
}) => {
  await registerThroughApi(request);
  const { environmentId } = await (
    await post(request, "", { name: "Nabolaget", type: "closed" })
  ).json();
  const outsider = await signedInUser(playwright, baseURL!);

  // Weaker privacy waits for the members; the type stays closed meanwhile.
  const proposed = await (
    await post(request, "/type", {
      environmentId,
      expectedType: "closed",
      type: "open",
    })
  ).json();
  expect(proposed).toMatchObject({
    type: "closed",
    proposal: { process: "consent" },
  });
  expect(
    await (
      await post(request, "/type/respond", {
        environmentId,
        proposalId: proposed.proposal.id,
        support: true,
      })
    ).json(),
  ).toEqual({ proposalId: proposed.proposal.id, support: true });
  expect(
    (await (await read(outsider.context, environmentId)).json()).type,
  ).toBe("closed");
  expect(
    (
      await post(outsider.context, "/type/respond", {
        environmentId,
        proposalId: proposed.proposal.id,
        support: true,
      })
    ).status(),
  ).toBe(404);

  // Stricter privacy applies at once; the hidden environment disappears.
  expect(
    await (
      await post(request, "/type", {
        environmentId,
        expectedType: "closed",
        type: "hidden",
      })
    ).json(),
  ).toEqual({ type: "hidden", proposal: null });
  expect((await read(outsider.context, environmentId)).status()).toBe(404);
});

test("the type change job only runs for the scheduler", async ({ request }) => {
  const path = "/api/internal/environment-type-changes";

  expect((await request.get(path)).status()).toBe(401);
  const run = await request.get(path, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  expect(await run.json()).toMatchObject({ adopted: expect.any(Number) });
});

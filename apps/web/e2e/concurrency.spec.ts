import { randomUUID } from "node:crypto";
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  test,
} from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  showToFriends,
  today,
} from "./helpers";

/**
 * WP-71 over HTTP and in a real browser: retries and double presses reach
 * the server at the same time, and each logical command still happens once,
 * with the same answer to every press and never a server error
 * (PS-NFR-004–005, UX-P05). The domain suite
 * (`stress.integration.test.ts`) covers the bursts in depth; this shows the
 * route boundary and the buttons keep what it proves.
 */

/** An owner and a friend with a direct request for the owner's ladder. */
async function directRequest(
  owner: APIRequestContext,
  borrower: APIRequestContext,
  start = today(),
) {
  const ownerId = await accountId(owner);
  await postCommand(owner, "/api/social/friend-requests", {
    userId: await accountId(borrower),
  });
  await postCommand(borrower, "/api/social/friend-requests/accept", {
    userId: ownerId,
  });
  const { objectId } = await (
    await postCommand(owner, "/api/objects", {
      title: "Stige",
      categoryId: "annet",
      description: "Aluminiumsstige, 4 meter.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await showToFriends(owner, objectId);

  return { objectId, requestId: await ask(borrower, objectId, start, owner) };
}

/** The borrower's request for days `start`–`start + 2`, ready to approve. */
async function ask(
  borrower: APIRequestContext,
  objectId: string,
  start: string,
  owner: APIRequestContext,
) {
  const preview = await (
    await borrower.get(`/api/loan-requests/preview?objectId=${objectId}`)
  ).json();
  const { requestId } = await (
    await postCommand(borrower, "/api/loan-requests", {
      objectId,
      origin: { kind: "direct" },
      start: { kind: "date", date: start },
      end: { kind: "duration", days: 2 },
      message: "Kan jeg låne den?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    })
  ).json();
  await postCommand(owner, `/api/loan-requests/${requestId}/responsibility`, {
    declarationVersion: preview.responsibilityDeclarationVersion,
  });

  return requestId as string;
}

/** Sends every request at once. */
const burst = (calls: readonly (() => Promise<APIResponse>)[]) =>
  Promise.all(calls.map((call) => call()));

const statuses = (responses: readonly APIResponse[]) =>
  responses.map((response) => response.status());

test("retries and double presses over HTTP do each command once", async ({
  request,
  playwright,
  baseURL,
}) => {
  const context = async () => {
    const other = await playwright.request.newContext({
      baseURL: baseURL!,
      extraHTTPHeaders: { origin: baseURL! },
    });
    await registerThroughApi(other);
    return other;
  };
  await registerThroughApi(request);
  const bo = await context();
  const { requestId } = await directRequest(request, bo);
  const approve = `/api/loan-requests/${requestId}/approve`;

  // A client retrying the same approval six times at once: one approval,
  // the same answer to all, and five of them replayed.
  const key = randomUUID();
  const retried = await burst(
    Array.from(
      { length: 6 },
      () => () =>
        request.post(approve, { headers: { "Idempotency-Key": key } }),
    ),
  );
  expect(statuses(retried)).toEqual(Array(6).fill(200));
  const bodies = await Promise.all(retried.map((response) => response.json()));
  expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
  expect(
    retried.filter(
      (response) => response.headers()["idempotent-replayed"] === "true",
    ),
  ).toHaveLength(5);
  const { loanId } = bodies[0];

  // Presses with new keys get the same loan, not a second one.
  const pressed = await burst(
    Array.from(
      { length: 4 },
      () => () =>
        request.post(approve, {
          headers: { "Idempotency-Key": randomUUID() },
        }),
    ),
  );
  expect(statuses(pressed)).toEqual(Array(4).fill(200));
  for (const response of pressed) {
    expect((await response.json()).loanId).toBe(loanId);
  }

  // Both parties cancel again and again at once: cancelled once, and
  // everyone hears who was first.
  const cancelled = await burst(
    [request, bo, request, bo].map(
      (party) => () =>
        party.post(`/api/loans/${loanId}/cancel`, {
          headers: { "Idempotency-Key": randomUUID() },
        }),
    ),
  );
  expect(statuses(cancelled)).toEqual(Array(4).fill(200));
  const answers = await Promise.all(
    cancelled.map((response) => response.json()),
  );
  expect(new Set(answers.map((answer) => answer.endedBy)).size).toBe(1);
  const history = await (await bo.get(`/api/loans/${loanId}/history`)).json();
  expect(
    history.entries.filter(
      (entry: { event: string }) => entry.event === "cancelled",
    ),
  ).toHaveLength(1);

  // Two friends ask for the same days and the owner approves both at once:
  // one loan, one clear refusal, no server error.
  const kari = await context();
  const { objectId, requestId: first } = await directRequest(request, kari);
  const per = await context();
  await postCommand(request, "/api/social/friend-requests", {
    userId: await accountId(per),
  });
  await postCommand(per, "/api/social/friend-requests/accept", {
    userId: await accountId(request),
  });
  const second = await ask(per, objectId, today(), request);
  const raced = await burst(
    [first, second].map(
      (id) => () =>
        request.post(`/api/loan-requests/${id}/approve`, {
          headers: { "Idempotency-Key": randomUUID() },
        }),
    ),
  );
  expect(statuses(raced).sort()).toEqual([200, 409]);
});

test("a double click on a loan's next step acts once", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  const bo = page.request;
  await registerThroughApi(bo, undefined, "Bo Dahl");
  const anna = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(anna, undefined, "Anna Berg");
  const { requestId } = await directRequest(anna, bo);
  const { loanId } = await (
    await postCommand(anna, `/api/loan-requests/${requestId}/approve`)
  ).json();

  // Every command the page sends, held back a moment so the second click
  // lands while the first is still under way.
  const sent: { path: string; key: string | undefined }[] = [];
  await page.route(`**/api/loans/${loanId}/**`, async (route) => {
    if (route.request().method() === "POST") {
      sent.push({
        path: new URL(route.request().url()).pathname,
        key: route.request().headers()["idempotency-key"],
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await route.continue();
  });

  await page.goto(`/lan/${loanId}`);
  const status = page.getByRole("region", { name: "Status" });
  await status.getByRole("button", { name: "Stige er overlevert" }).dblclick();
  await expect(status).toContainText("Du har lånt Stige av Anna Berg");
  await status
    .getByRole("button", { name: "Jeg har levert tilbake Stige" })
    .dblclick();
  await expect(status).toContainText("Du har bekreftet returen");

  // One request per step, each with its key, and one statement each in the
  // history.
  expect(sent.map((each) => each.path)).toEqual([
    `/api/loans/${loanId}/handover`,
    `/api/loans/${loanId}/return`,
  ]);
  expect(sent.every((each) => each.key)).toBe(true);
  const { entries } = await (
    await bo.get(`/api/loans/${loanId}/history`)
  ).json();
  expect(
    entries.filter(
      (entry: { event: string }) => entry.event === "handover_reported",
    ),
  ).toHaveLength(1);
  expect(problems).toEqual([]);
});

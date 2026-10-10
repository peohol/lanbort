import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import {
  agreeLoan,
  axeViolations,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  showToFriends,
} from "./helpers";

/**
 * WP-64: a loan's own page shows its status in words that name who it waits
 * for, the next step as a button, and the history only when asked for
 * (UX-IA-008, UX-INT-001, UX-INT-004, UX-INT-008), in a real browser.
 */

const post = (request: APIRequestContext, path: string, data?: object) =>
  request.post(path, { data, headers: { "Idempotency-Key": randomUUID() } });

async function accountId(request: APIRequestContext): Promise<string> {
  return (await (await request.get("/api/account")).json()).userId;
}

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

test("a borrower follows a loan from its page, and nobody else sees it", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  const context = () =>
    playwright.request.newContext({
      baseURL: baseURL!,
      extraHTTPHeaders: { origin: baseURL! },
    });
  const bo = page.request;
  await registerThroughApi(bo, undefined, "Bo Dahl");
  const boId = await accountId(bo);
  const anna = await context();
  await registerThroughApi(anna, undefined, "Anna Berg");
  const annaId = await accountId(anna);
  await post(anna, "/api/social/friend-requests", { userId: boId });
  await post(bo, "/api/social/friend-requests/accept", { userId: annaId });

  const { objectId } = await (
    await post(anna, "/api/objects", {
      title: "Stige",
      categoryId: "annet",
      description: "Aluminiumsstige, 4 meter.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await showToFriends(anna, objectId);
  const preview = await (
    await bo.get(`/api/loan-requests/preview?objectId=${objectId}`)
  ).json();
  const { requestId } = await (
    await post(bo, "/api/loan-requests", {
      objectId,
      origin: { kind: "direct" },
      start: { kind: "date", date: today() },
      end: { kind: "duration", days: 2 },
      message: "Kan jeg låne den i dag?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    })
  ).json();
  await post(anna, `/api/loan-requests/${requestId}/responsibility`, {
    declarationVersion: preview.responsibilityDeclarationVersion,
  });
  const { loanId } = await (
    await post(anna, `/api/loan-requests/${requestId}/approve`)
  ).json();

  // The Lån list leads to the loan's own page.
  await page.goto("/lan");
  const underWay = page.getByRole("region", { name: "Pågår og kommende" });
  await expect(underWay).toContainText("Stige fra Anna Berg");
  await expect(underWay).toContainText("I dag henter du Stige");
  await page.getByRole("link", { name: "Stige" }).click();
  await expect(page).toHaveURL(`/lan/${loanId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Stige fra Anna Berg",
  );
  await expect(page.getByText("Direkte mellom venner")).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Lånets steg" })
      .locator('[aria-current="step"]'),
  ).toHaveText("Reservert");

  // The status says what today asks; the other party has a row of their own.
  const status = page.getByRole("region", { name: "Status" });
  await expect(status).toContainText("I dag henter du Stige");
  await expect(
    page
      .getByRole("region", { name: "Ansvarlig utlåner" })
      .getByText("Anna Berg", { exact: true }),
  ).toBeVisible();

  // The timeline is secondary: closed until asked for.
  const history = page.getByRole("list", { name: "Tidslinje, nyeste først" });
  await expect(history).toBeHidden();

  await status.getByRole("button", { name: "Jeg har fått Stige" }).click();
  await expect(status).toContainText("Stige er hos deg til");

  // A return confirmation waits, and can be undone.
  await status.getByRole("button", { name: "Meld returnert" }).click();
  await expect(status).toContainText("Du har meldt Stige returnert");
  await status.getByRole("button", { name: "Angre" }).click();
  await expect(status).toContainText("Stige er hos deg til");

  await page.getByText("Tidslinje", { exact: true }).click();
  await expect(history.getByRole("listitem")).toHaveText([
    /Stige ble lånt ut$/,
    /Du sa at Stige ble overlevert$/,
    /Anna Berg godkjente lånet$/,
    /Anna Berg godtok ansvarserklæringen$/,
    /Du godtok ansvarserklæringen$/,
    /Du sendte forespørselen$/,
  ]);

  // The same timeline over the API, for the lender too.
  expect(
    (await (await anna.get(`/api/loans/${loanId}/history`)).json()).entries,
  ).toHaveLength(6);

  // On a phone the page fits without sideways scrolling.
  await page.setViewportSize({ width: 360, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("loan-page.png"),
    fullPage: true,
  });
  expect(problems).toEqual([]);

  // Nobody else learns that the loan exists.
  const stranger = await context();
  await registerThroughApi(stranger);
  expect((await stranger.get(`/api/loans/${loanId}/history`)).status()).toBe(
    404,
  );
  await page.context().clearCookies();
  await registerThroughApi(page.request);
  expect((await page.goto(`/lan/${loanId}`))?.status()).toBe(404);
  expect((await page.goto("/lan/ikke-et-lan"))?.status()).toBe(404);
});

/** The calendar date `days` after `date`. */
const after = (date: string, days: number) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

test("a borrower changes, cancels and reviews a loan on its page (WP-87)", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  const bo = page.request;
  await registerThroughApi(bo, undefined, "Bo Dahl");
  const boId = await accountId(bo);
  const anna = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(anna, undefined, "Anna Berg");
  const annaId = await accountId(anna);
  await postCommand(anna, "/api/social/friend-requests", { userId: boId });
  await postCommand(bo, "/api/social/friend-requests/accept", {
    userId: annaId,
  });
  const loanId = await agreeLoan(anna, bo, "Stige");

  await page.goto(`/lan/${loanId}`);
  const status = page.getByRole("region", { name: "Status" });
  const moreActions = page.getByRole("group", { name: "Flere valg" });
  // «Flere valg» stays as the user left it when the page reads again.
  const more = async () => {
    const details = page.locator("details.more-actions");
    if (!(await details.evaluate((element) => element.hasAttribute("open")))) {
      await details.getByText("Flere valg", { exact: true }).click();
    }
  };

  // A new return day is only a proposal until Anna accepts it.
  await more();
  await moreActions.getByText("Foreslå ny periode", { exact: true }).click();
  // A later handover day takes the return day along, so the period holds.
  const end = moreActions.getByLabel("Leveres tilbake");
  const agreedEnd = await end.inputValue();
  await moreActions.getByLabel("Overlevering").fill(after(today(), 10));
  await expect(end).toHaveValue(after(agreedEnd, 10));
  await expect(end).toHaveAttribute("min", after(today(), 10));
  await moreActions.getByLabel("Overlevering").fill(today());
  await end.fill(after(today(), 3));
  await moreActions.getByRole("button", { name: "Send forslaget" }).click();
  await expect(status).toContainText("Du har foreslått ny returdag");
  await expect(status).toContainText("Venter på Anna Berg");

  await more();
  await moreActions.getByRole("button", { name: "Trekk forslaget" }).click();
  await expect(status).toContainText("I dag henter du Stige");

  // Cancelling shows what it means first.
  await more();
  await moreActions.getByRole("button", { name: "Kanseller lånet" }).click();
  const dialog = page.getByRole("dialog", { name: "Kansellere lånet?" });
  await expect(dialog).toContainText("Perioden blir ledig for andre lån.");
  await expect(dialog).toContainText(
    "Anna Berg får varsel om at du har kansellert.",
  );
  await dialog.getByRole("button", { name: "Kanseller lånet" }).click();
  await expect(status).toContainText("Du kansellerte lånet");
  await expect(
    page
      .getByRole("list", { name: "Lånets steg" })
      .locator('[aria-current="step"]'),
  ).toHaveText("Kansellert");

  // Only what could be assessed is asked, and the review stays hidden.
  const reviews = page.getByRole("region", { name: "Anmeldelser" });
  await expect(reviews).toContainText(
    "Anmeldelsen din er skjult til Anna Berg også har anmeldt deg",
  );
  await expect(reviews.getByRole("group")).toHaveCount(1);
  await reviews
    .getByRole("group", { name: "Kommunikasjon" })
    .getByLabel("4")
    .check();
  expect(await axeViolations(page)).toEqual([]);
  await reviews.getByRole("button", { name: "Send anmeldelsen" }).click();
  await expect(
    reviews.getByRole("article", { name: "Din anmeldelse av Anna Berg" }),
  ).toContainText("4 av 5");

  // Once Anna has reviewed, both appear, and Bo answers once.
  await postCommand(anna, `/api/loans/${loanId}/reviews`, {
    scores: [{ dimension: "communication", score: 2 }],
    text: "Avlyste sent.",
  });
  await page.reload();
  const received = reviews.getByRole("article", {
    name: "Anna Berg sin anmeldelse av deg",
  });
  await expect(received).toContainText("2 av 5");
  await expect(received).toContainText("Avlyste sent.");
  await received.getByText("Gi et tilsvar", { exact: true }).click();
  await received.getByLabel("Tilsvar").fill("Beklager, ble syk.");
  await received.getByRole("button", { name: "Send tilsvaret" }).click();
  await expect(received).toContainText("Beklager, ble syk.");
  await expect(received.getByText("Gi et tilsvar")).toBeHidden();

  expect(problems).toEqual([]);
});

test("the lender ends the loan at once instead of waiting out the undo time (PS-LOAN-016)", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  const anna = page.request;
  await registerThroughApi(anna, undefined, "Anna Berg");
  const annaId = await accountId(anna);
  const bo = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(bo, undefined, "Bo Dahl");
  await postCommand(anna, "/api/social/friend-requests", {
    userId: await accountId(bo),
  });
  await postCommand(bo, "/api/social/friend-requests/accept", {
    userId: annaId,
  });
  const loanId = await agreeLoan(anna, bo, "Stige");
  await postCommand(anna, `/api/loans/${loanId}/handover`, {
    agreementVersion: 1,
    outcome: "handed_over",
  });
  await postCommand(bo, `/api/loans/${loanId}/return`, {
    agreementVersion: 1,
    outcome: "returned",
    immediately: true,
  });

  await page.goto(`/lan/${loanId}`);
  const status = page.getByRole("region", { name: "Status" });
  await status
    .getByRole("button", { name: "Jeg har fått tilbake Stige" })
    .click();
  await expect(status).toContainText("Du kan angre til");
  await status.getByRole("button", { name: "Avslutt lånet nå" }).click();
  await expect(status).toContainText("Lånet er avsluttet");
  await expect(status.getByRole("button", { name: "Angre" })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("a former lender keeps their reviews on the loan's page, and nothing more of the loan", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  const context = async (name: string) => {
    const request = await playwright.request.newContext({
      baseURL: baseURL!,
      extraHTTPHeaders: { origin: baseURL! },
    });
    await registerThroughApi(request, undefined, name);
    return request;
  };
  const anna = page.request;
  await registerThroughApi(anna, undefined, "Anna Berg");
  const bo = await context("Bo Dahl");
  const dag = await context("Dag Lie");
  const boId = await accountId(bo);
  await postCommand(anna, "/api/social/friend-requests", { userId: boId });
  await postCommand(bo, "/api/social/friend-requests/accept", {
    userId: await accountId(anna),
  });

  // Dag co-owns the ladder before Bo borrows it.
  const { objectId } = await (
    await postCommand(anna, "/api/objects", {
      title: "Stige",
      categoryId: "annet",
      description: "Stige til utlån.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await showToFriends(anna, objectId);
  const { invitationId } = await (
    await postCommand(anna, `/api/objects/${objectId}/co-owners/invitations`, {
      userId: await accountId(dag),
    })
  ).json();
  await postCommand(dag, "/api/object-invitations/accept", { invitationId });
  const preview = await (
    await bo.get(`/api/loan-requests/preview?objectId=${objectId}`)
  ).json();
  const { requestId } = await (
    await postCommand(bo, "/api/loan-requests", {
      objectId,
      origin: { kind: "direct" },
      start: { kind: "date", date: today() },
      end: { kind: "duration", days: 2 },
      message: "Kan jeg låne den?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    })
  ).json();
  await postCommand(anna, `/api/loan-requests/${requestId}/responsibility`, {
    declarationVersion: preview.responsibilityDeclarationVersion,
  });
  const { loanId } = await (
    await postCommand(anna, `/api/loan-requests/${requestId}/approve`)
  ).json();
  const loan = `/api/loans/${loanId}`;

  // Returned and reviewed, then reopened: Dag takes over as lender.
  await postCommand(anna, `${loan}/handover`, {
    agreementVersion: 1,
    outcome: "handed_over",
  });
  await postCommand(anna, `${loan}/return`, {
    agreementVersion: 1,
    outcome: "received",
    immediately: true,
  });
  await postCommand(anna, `${loan}/reviews`, {
    loanId,
    scores: [
      "pickup_on_time",
      "return_on_time",
      "condition_at_return",
      "communication",
    ].map((dimension) => ({ dimension, score: 5 })),
  });
  await postCommand(bo, `${loan}/return`, {
    agreementVersion: 1,
    outcome: "still_has",
    immediately: true,
  });
  const { transferId } = await (
    await postCommand(anna, `${loan}/responsibility`, {
      toUserId: await accountId(dag),
    })
  ).json();
  await postCommand(dag, `${loan}/responsibility/${transferId}/accept`);
  expect((await anna.get(loan)).status()).toBe(404);

  // Anna's review is still hers; what Bo and Dag do now is not.
  await page.goto(`/lan/${loanId}`);
  const reviews = page.getByRole("region", { name: "Anmeldelser" });
  await expect(
    reviews.getByRole("article", { name: "Din anmeldelse av Bo Dahl" }),
  ).toBeVisible();
  await expect(reviews).toContainText(
    "Lånet er åpnet igjen. Anmeldelsene venter til det er avsluttet på nytt.",
  );
  await expect(page.getByText("Tidslinje")).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
  expect(problems).toEqual([]);
});

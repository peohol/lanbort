import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
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
  await page.getByRole("link", { name: "Stige" }).click();
  await expect(page).toHaveURL(`/lan/${loanId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stige");

  // The status names the other party; the next step is the handover.
  const status = page.getByRole("region", { name: "Status" });
  await expect(status).toContainText("Avtalt: du låner Stige av Anna Berg");
  await expect(
    page.getByRole("region", { name: "Avtalen" }).getByText("Anna Berg"),
  ).toBeVisible();

  // History is secondary: closed until asked for.
  const history = page.getByRole("list", { name: "Historikk, nyeste først" });
  await expect(history).toBeHidden();

  await status.getByRole("button", { name: "Stige er overlevert" }).click();
  await expect(status).toContainText("Du har lånt Stige av Anna Berg");

  // A return confirmation waits, and can be undone.
  await status
    .getByRole("button", { name: "Jeg har levert tilbake Stige" })
    .click();
  await expect(status).toContainText("Du har bekreftet returen");
  await status.getByRole("button", { name: "Angre bekreftelsen" }).click();
  await expect(status).toContainText("Du har lånt Stige av Anna Berg");

  await page.getByText("Historikk", { exact: true }).click();
  await expect(history.getByRole("listitem")).toHaveText([
    /^Stige ble lånt ut/,
    /^Du sa at Stige ble overlevert/,
    /^Anna Berg godkjente lånet/,
    /^Anna Berg godtok ansvarserklæringen/,
    /^Du godtok ansvarserklæringen/,
    /^Du sendte forespørselen/,
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

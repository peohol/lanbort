import { randomUUID } from "node:crypto";
import {
  type APIRequest,
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { loanRequestPageSize } from "@lanbort/contracts";
import {
  collectBrowserProblems,
  enterEmailCode,
  registerThroughApi,
  showToFriends,
} from "./helpers";

/**
 * WP-60: the five areas, the notification layer, the account context and
 * an action-first Home (UX-IA-001–003, UX-IA-005), in a real browser.
 */

const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` };

async function accountId(request: APIRequestContext): Promise<string> {
  return (await (await request.get("/api/account")).json()).userId;
}

/** Runs the outbox job until `request` has an unread notification. */
async function untilNotified(request: APIRequestContext) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await request.get("/api/internal/outbox", { headers: cron });
    const { unreadCount } = await (
      await request.get("/api/notifications/unread")
    ).json();

    if (unreadCount > 0) return;
  }

  throw new Error("The notification never arrived");
}

/** Where a friend request leads: the page of the one who asked (WP-86). */
const personPage = /\/personer\/[0-9a-f-]{36}$/;

/** Bo asks Anna, signed in on `page`, to be friends; returns Anna's address. */
async function befriended(page: Page, other: APIRequestContext) {
  const email = await registerThroughApi(page.request, undefined, "Anna Berg");
  const anna = await accountId(page.request);
  await registerThroughApi(other, undefined, "Bo Dahl");
  await other.post("/api/social/friend-requests", {
    data: { userId: anna },
    headers: { "Idempotency-Key": randomUUID() },
  });
  return email;
}

/** A second user's own API session, as a browser on the same site. */
const otherUser = (
  playwright: { request: { newContext: APIRequest["newContext"] } },
  baseURL: string,
) =>
  playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });

const mainNavigation = (page: Page) =>
  page.getByRole("navigation", { name: "Hovedmeny" });

test("the five areas are the main navigation, and the current one is marked", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Kari Nordmann");
  await page.goto("/");

  const links = mainNavigation(page).getByRole("link");
  await expect(links).toHaveText([
    "Hjem",
    "Finn",
    "Lån",
    "Mine ting",
    "Samtaler",
  ]);
  await expect(
    mainNavigation(page).getByRole("link", { name: "Hjem" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hei, Kari Nordmann",
  );
  await expect(page.getByText("Ingenting venter på deg nå.")).toBeVisible();

  for (const [label, heading] of [
    ["Finn", "Finn"],
    ["Lån", "Lån"],
    ["Mine ting", "Mine ting"],
    ["Samtaler", "Samtaler"],
  ] as const) {
    await mainNavigation(page).getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(
      mainNavigation(page).getByRole("link", { name: label }),
    ).toHaveAttribute("aria-current", "page");
  }

  // Notifications and the account are not areas of their own.
  await expect(links).toHaveCount(5);
  await page.getByRole("link", { name: "Varsler, ingen uleste" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Varsler");
  await page
    .getByRole("link", { name: "Konto og innstillinger for Kari Nordmann" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Konto");
  await expect(mainNavigation(page).locator("[aria-current=page]")).toHaveCount(
    0,
  );
  expect(problems).toEqual([]);
});

test("Home asks for what waits, and leads to where it is answered", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await befriended(page, await otherUser(playwright, baseURL!));
  await page.goto("/");

  const waiting = page.getByRole("region", { name: /Venter på deg/ });
  await waiting
    .getByRole("link", { name: "Bo Dahl vil bli venn med deg" })
    .click();
  await expect(page).toHaveURL(personPage);
  await page.getByRole("button", { name: "Godta" }).click();
  await expect(page.getByRole("button", { name: "Godta" })).toHaveCount(0);

  await mainNavigation(page).getByRole("link", { name: "Hjem" }).click();
  await expect(page.getByText("Ingenting venter på deg nå.")).toBeVisible();
  expect(problems).toEqual([]);
});

test("the way back follows the path taken, also through the browser's back and forward", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await befriended(page, await otherUser(playwright, baseURL!));
  const title = page.getByRole("heading", { level: 1 });
  const steps = page
    .getByRole("navigation", { name: "Du er her" })
    .getByRole("listitem");

  await page.goto("/");
  await page.getByRole("link", { name: /^Konto og innstillinger/ }).click();
  await expect(title).toHaveText("Konto");
  await page.getByRole("link", { name: "Bo Dahl" }).click();
  await expect(title).toHaveText("Bo Dahl");
  await expect(steps).toHaveText(["Hjem", "Konto", "Bo Dahl"]);

  await page.goBack();
  await expect(steps).toHaveText(["Hjem", "Konto"]);
  await page.goForward();
  await expect(title).toHaveText("Bo Dahl");
  await expect(steps).toHaveText(["Hjem", "Konto", "Bo Dahl"]);

  // A form is a bounded task: only «Avbryt» leads out of it (UX-IA-013).
  await page.goto("/ting/ny");
  await expect(page.getByRole("link", { name: "Avbryt" })).toBeVisible();
  for (const name of ["Lånbort", "Hjem"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeHidden();
  }
  expect(problems).toEqual([]);
});

test("a notification's e-mail link leads to its context and marks it read", async ({
  browser,
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  const other = await otherUser(playwright, baseURL!);
  await befriended(page, other);
  await untilNotified(page.request);
  const [notification] = (
    await (await page.request.get("/api/notifications")).json()
  ).notifications;

  // Someone else's notification is just Home, and nothing is marked.
  const strangers = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(strangers.request, undefined, "Cleo Eng");
  const stranger = await strangers.newPage();
  await stranger.goto(`/?varsel=${notification.id}`);
  await expect(stranger.getByRole("heading", { level: 1 })).toHaveText(
    "Hei, Cleo Eng",
  );
  await strangers.close();
  expect(
    (await (await page.request.get("/api/notifications/unread")).json())
      .unreadCount,
  ).toBeGreaterThan(0);

  await page.goto(`/?varsel=${notification.id}`);
  await expect(page).toHaveURL(personPage);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bo Dahl");
  await expect(
    page.getByRole("link", { name: "Varsler, ingen uleste" }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test("a notification's e-mail link survives signing in", async ({
  browser,
  page,
  playwright,
  baseURL,
}) => {
  const email = await befriended(page, await otherUser(playwright, baseURL!));
  await untilNotified(page.request);
  const [notification] = (
    await (await page.request.get("/api/notifications")).json()
  ).notifications;

  // The e-mail is opened in a browser without a session.
  const signedOut = await browser.newContext({ baseURL: baseURL! });
  const mail = await signedOut.newPage();
  await mail.goto(`/?varsel=${notification.id}`);
  await mail
    .getByRole("link", { name: "Logg inn eller opprett konto" })
    .click();
  await enterEmailCode(mail, email);
  await expect(mail).toHaveURL(personPage);
  await expect(
    mail.getByRole("link", { name: "Varsler, ingen uleste" }),
  ).toBeVisible();

  // A return path never leads off the site.
  await mail.goto("/logg-inn?neste=//example.com");
  await expect(mail).toHaveURL(/\/$/);
  await signedOut.close();
});

test("the indicator counts unread notifications until they are read", async ({
  page,
  playwright,
  baseURL,
}) => {
  await befriended(page, await otherUser(playwright, baseURL!));
  await untilNotified(page.request);
  await page.goto("/");

  await page.getByRole("link", { name: "Varsler, 1 uleste" }).click();
  await expect(page.getByText("Du har fått en venneforespørsel")).toBeVisible();
  await page.getByRole("button", { name: "Merk alle som lest" }).click();
  await expect(
    page.getByRole("link", { name: "Varsler, ingen uleste" }),
  ).toBeVisible();
});

test("Lån shows further pages of a list in place", async ({
  page,
  playwright,
  baseURL,
}) => {
  const bo = await otherUser(playwright, baseURL!);
  await befriended(page, bo);
  const boId = await accountId(bo);
  await page.request.post("/api/social/friend-requests/accept", {
    data: { userId: boId },
    headers: { "Idempotency-Key": randomUUID() },
  });
  const { objectId } = await (
    await bo.post("/api/objects", {
      data: {
        title: "Tilhenger",
        categoryId: "annet",
        description: "Skapbil-tilhenger, 750 kg.",
        availability: [{ start: "2030-06-01", end: null }],
      },
      headers: { "Idempotency-Key": randomUUID() },
    })
  ).json();
  await showToFriends(bo, objectId);
  const preview = await (
    await page.request.get(`/api/loan-requests/preview?objectId=${objectId}`)
  ).json();

  for (let index = 0; index <= loanRequestPageSize; index += 1) {
    const response = await page.request.post("/api/loan-requests", {
      data: {
        objectId,
        origin: { kind: "direct" },
        start: { kind: "date", date: "2030-06-10" },
        end: { kind: "duration", days: 1 },
        message: "Kan jeg låne den?",
        termsVersion: preview.termsVersion,
        responsibilityDeclarationVersion:
          preview.responsibilityDeclarationVersion,
      },
      headers: { "Idempotency-Key": randomUUID() },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  await page.goto("/lan?side=borrower");
  const requests = page.getByRole("region", { name: "Forespørsler" });
  await expect(requests.getByRole("listitem")).toHaveCount(loanRequestPageSize);
  await requests.getByRole("link", { name: "Vis flere forespørsler" }).click();
  await expect(page).toHaveURL(/side=borrower&foresporsler=2#/);
  await expect(requests.getByRole("listitem")).toHaveCount(
    loanRequestPageSize + 1,
  );
  await expect(
    requests.getByRole("link", { name: "Vis flere forespørsler" }),
  ).toHaveCount(0);
});

test("on a phone the areas sit at the bottom, without sideways scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await registerThroughApi(page.request);
  await page.goto("/");

  const box = await mainNavigation(page).boundingBox();
  expect(box!.y + box!.height).toBeCloseTo(740, 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  // The first Tab reaches the skip link, which moves past the navigation.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Hopp til innholdet" }),
  ).toBeFocused();
});

test("the areas need a signed-in user", async ({ page, request }) => {
  for (const path of [
    "/finn",
    "/lan",
    "/mine-ting",
    "/samtaler",
    "/varsler",
    "/konto",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/logg-inn$/);
  }

  for (const path of [
    "/api/home",
    "/api/loans?state=current",
    "/api/notifications/unread",
  ]) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

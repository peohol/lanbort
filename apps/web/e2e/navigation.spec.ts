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
  axeViolations,
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hjem");
  await expect(
    page.getByRole("link", {
      name: "Konto og innstillinger for Kari Nordmann",
    }),
  ).toBeVisible();
  await expect(page.getByText("Ingenting venter på deg")).toBeVisible();

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

  // Notifications and the account are layers over the area, not areas of
  // their own (UX-IA-002, UX-IA-020).
  await expect(links).toHaveCount(5);
  await page.getByRole("link", { name: "Varsler, ingen uleste" }).click();
  const notifications = page.getByRole("dialog", { name: "Varsler" });
  await expect(notifications.getByRole("heading", { level: 1 })).toHaveText(
    "Varsler",
  );
  await notifications.getByRole("button", { name: "Lukk Varsler" }).click();
  await expect(notifications).toHaveCount(0);
  await expect(page).toHaveURL("/samtaler");
  await page
    .getByRole("link", { name: "Konto og innstillinger for Kari Nordmann" })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Konto" })
      .getByRole("heading", { level: 1 }),
  ).toHaveText("Konto");
  expect(problems).toEqual([]);
});

test("Konto is a layer with its own stack, and Lukk returns to exactly the screen under it", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await befriended(page, await otherUser(playwright, baseURL!));
  await page.goto("/lan?side=borrower");
  const account = page.getByRole("dialog", { name: "Konto" });
  const title = account.getByRole("heading", { level: 1 });

  await page.getByRole("link", { name: /^Konto og innstillinger/ }).click();
  await expect(title).toHaveText("Konto");
  await expect(title).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await account.getByRole("link", { name: /Venner/ }).click();
  await expect(title).toHaveText("Venner");

  // A person opened from Konto lies in Konto's stack.
  await account.getByRole("link", { name: "Bo Dahl" }).click();
  await expect(title).toHaveText("Bo Dahl");
  await expect(page).toHaveURL(/\/konto\/personer\//);
  await account.getByRole("link", { name: "Venner" }).click();
  await expect(title).toHaveText("Venner");
  await account.getByRole("link", { name: "Konto" }).click();
  await expect(title).toHaveText("Konto");

  // «Lukk» goes back to the screen Konto was opened over, filter and all,
  // with focus where it was.
  await account.getByRole("button", { name: "Lukk Konto" }).click();
  await expect(account).toHaveCount(0);
  await expect(page).toHaveURL("/lan?side=borrower");
  await expect(
    page.getByRole("link", { name: /^Konto og innstillinger/ }),
  ).toBeFocused();

  // Reached from outside, Konto has nothing under it: Lukk leads to Hjem.
  await page.goto("/konto/venner");
  // The key only works once the page has come alive.
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/", { timeout: 1000 });
  }).toPass();
  expect(problems).toEqual([]);
});

test("a layer keeps the screen under it through the browser's history, and a reloaded one is replaced", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Kari Nordmann");
  const account = page.getByRole("dialog", { name: "Konto" });
  const close = account.getByRole("button", { name: "Lukk Konto" });

  await page.goto("/lan?side=borrower");
  await page.getByRole("link", { name: /^Konto og innstillinger/ }).click();
  await expect(account.getByRole("heading", { level: 1 })).toHaveText("Konto");
  await close.click();
  await expect(page).toHaveURL("/lan?side=borrower");

  // Forward into the layer again: it still lies over the same screen.
  await page.goForward();
  await expect(account.getByRole("heading", { level: 1 })).toHaveText("Konto");
  await close.click();
  await expect(account).toHaveCount(0);
  await expect(page).toHaveURL("/lan?side=borrower");

  // Konto reached from outside is the page; what it opens takes its place
  // instead of lying on top, and closes to Hjem.
  await page.goto("/konto");
  await page.getByRole("link", { name: /Venner/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Venner");
  await expect(page.locator(".layer:visible")).toHaveCount(1);
  await close.click();
  await expect(page).toHaveURL("/");
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

  // The only task is a full card, with the step that opens it (UX-IA-018).
  const waiting = page.getByRole("region", { name: "1 venter på deg" });
  const task = waiting.getByRole("article", {
    name: "Bo Dahl vil bli venn med deg",
  });
  await task.getByRole("link", { name: "Se forespørselen" }).click();
  await expect(page).toHaveURL(personPage);
  await page.getByRole("button", { name: "Godta" }).click();
  await expect(page.getByRole("button", { name: "Godta" })).toHaveCount(0);

  await mainNavigation(page).getByRole("link", { name: "Hjem" }).click();
  await expect(page.getByText("Ingenting venter på deg")).toBeVisible();
  expect(problems).toEqual([]);
});

test("the way back follows the path taken, also through the browser's back and forward", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await befriended(page, await otherUser(playwright, baseURL!));
  const account = page.getByRole("dialog", { name: "Konto" });
  const title = account.getByRole("heading", { level: 1 });

  await page.goto("/");
  await page.getByRole("link", { name: /^Konto og innstillinger/ }).click();
  await expect(title).toHaveText("Konto");
  await account.getByRole("link", { name: /Venner/ }).click();
  await expect(title).toHaveText("Venner");
  await account.getByRole("link", { name: "Bo Dahl" }).click();
  await expect(title).toHaveText("Bo Dahl");

  await page.goBack();
  await expect(title).toHaveText("Venner");
  await page.goForward();
  await expect(title).toHaveText("Bo Dahl");
  await expect(account.getByRole("link", { name: "Venner" })).toBeVisible();

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
  await expect(stranger.getByRole("heading", { level: 1 })).toHaveText("Hjem");
  await expect(
    stranger.getByRole("link", { name: "Konto og innstillinger for Cleo Eng" }),
  ).toBeVisible();
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
  await expect(
    page
      .getByRole("region", { name: "Uleste · 1" })
      .getByRole("link", { name: /Bo Dahl vil bli venn med deg/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Marker alle som lest" }).click();
  await expect(
    page.getByRole("link", { name: "Varsler, ingen uleste" }),
  ).toBeVisible();
  // Read is not handled: the notification stays, among the earlier ones,
  // and says the task still waits on Home (UX-IA-019).
  await expect(
    page
      .getByRole("region", { name: "Tidligere" })
      .getByRole("link", { name: /Bo Dahl vil bli venn med deg/ }),
  ).toContainText("oppgaven står på Hjem");
});

test("an empty notification centre says what will come, and leads to the choices", async ({
  page,
}) => {
  await registerThroughApi(page.request);
  await page.goto("/varsler");
  await expect(
    page.getByRole("heading", { name: "Ingen varsler" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Varslingsvalg" }).click();
  await expect(page).toHaveURL("/konto/varslingsvalg");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Varslingsvalg",
  );
});

test("Lån groups every open request by whom it waits on, beyond a page, and keeps the ended ones apart", async ({
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

  // Every one waits on the owner, also those past the first page.
  await page.goto("/lan?side=borrower");
  const others = page.getByRole("region", { name: "Venter på andre" });
  await expect(others.getByRole("listitem")).toHaveCount(
    loanRequestPageSize + 1,
  );
  await expect(
    others.getByRole("link", { name: /^Tilhenger Venter på svar fra eieren/ }),
  ).toHaveCount(loanRequestPageSize + 1);
  await expect(page.getByRole("region", { name: "Venter på deg" })).toHaveCount(
    0,
  );

  // The ended loans lie behind a row of their own, on the same side.
  await page.getByRole("link", { name: "Avsluttede lån" }).click();
  await expect(page).toHaveURL("/lan/avsluttede?side=borrower");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Avsluttede lån",
  );
  await expect(page.getByText("Ingen avsluttede lån.")).toBeVisible();
  await page.getByRole("link", { name: "Lån", exact: true }).first().click();
  await expect(page).toHaveURL(/\/lan(\?side=borrower)?$/);
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

test("on a phone a form stays still when a field in view is chosen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerThroughApi(page.request);
  await page.goto("/ting/ny");
  await expect(mainNavigation(page)).toBeHidden();

  // A field in view: nothing covers it, so nothing scrolls.
  const field = page
    .locator("main :is(input, textarea, select):visible")
    .first();
  await expect(field).toBeInViewport({ ratio: 1 });
  const before = await page.evaluate(() => window.scrollY);
  await field.focus();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
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
    // And back to the area once signed in.
    await expect(page).toHaveURL(`/logg-inn?neste=${encodeURIComponent(path)}`);
  }

  for (const path of [
    "/api/home",
    "/api/loans?state=current",
    "/api/notifications/unread",
  ]) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

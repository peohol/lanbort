import { randomUUID } from "node:crypto";
import {
  type APIRequest,
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { collectBrowserProblems, registerThroughApi } from "./helpers";

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

/** A registered user signed in in `page`, with a friend request from `other`. */
async function befriended(page: Page, other: APIRequestContext) {
  await registerThroughApi(page.request, undefined, "Anna Berg");
  const anna = await accountId(page.request);
  await registerThroughApi(other, undefined, "Bo Dahl");
  await other.post("/api/social/friend-requests", {
    data: { userId: anna },
    headers: { "Idempotency-Key": randomUUID() },
  });
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
  await expect(page).toHaveURL(/\/konto#venner$/);
  await page.getByRole("button", { name: "Godta" }).click();
  await expect(page.getByRole("button", { name: "Godta" })).toHaveCount(0);

  await mainNavigation(page).getByRole("link", { name: "Hjem" }).click();
  await expect(page.getByText("Ingenting venter på deg nå.")).toBeVisible();
  expect(problems).toEqual([]);
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
  await expect(page.getByText("Noen vil bli venn med deg")).toBeVisible();
  await page.getByRole("button", { name: "Merk alle som lest" }).click();
  await expect(
    page.getByRole("link", { name: "Varsler, ingen uleste" }),
  ).toBeVisible();
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

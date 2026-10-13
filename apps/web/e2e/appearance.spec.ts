import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  axeViolations,
  collectBrowserProblems,
  registerThroughApi,
} from "./helpers";

/**
 * Konto › Utseende: light, dark, or as the device is set. The choice
 * belongs to the device, so it holds after signing out, and it is on the
 * page from the server, so the page never shows the other theme first.
 */

const pageColour = { light: "rgb(243, 244, 247)", dark: "rgb(20, 23, 28)" };

async function signedIn(
  browser: Browser,
  baseURL: string,
  colorScheme: "light" | "dark",
) {
  const context = await browser.newContext({ baseURL, colorScheme });
  const page = await context.newPage();
  await registerThroughApi(page.request, undefined, "Tea Tema");
  return page;
}

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** The theme in the page as the server sent it, before any script ran. */
const servedTheme = async (page: Page, path: string) =>
  /<html[^>]*data-theme="(\w+)"/.exec(
    await (await page.request.get(path)).text(),
  )?.[1] ?? null;

/** Konto › Utseende, opened over Hjem as people reach it. */
async function openAppearance(page: Page, shown: string) {
  await page.goto("/");
  await page.getByRole("link", { name: /^Konto og innstillinger/ }).click();
  const row = page.getByRole("link", { name: /Utseende/ });
  await expect(row).toContainText(shown);
  await row.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Utseende" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: shown })).toBeChecked();
}

async function choose(page: Page, label: string) {
  await page.getByRole("radio", { name: label }).check();
  await expect(page.getByRole("radio", { name: label })).toBeChecked();
}

test("a member on a light device chooses dark, which stays after signing out", async ({
  browser,
  baseURL,
}) => {
  const page = await signedIn(browser, baseURL!, "light");
  const problems = collectBrowserProblems(page);

  await openAppearance(page, "Følg systemet");
  expect(await background(page)).toBe(pageColour.light);

  await choose(page, "Mørkt");
  await expect.poll(() => background(page)).toBe(pageColour.dark);
  expect(await axeViolations(page)).toEqual([]);
  expect(await servedTheme(page, "/")).toBe("dark");

  await openAppearance(page, "Mørkt");
  expect(await background(page)).toBe(pageColour.dark);

  await page.context().clearCookies({ name: /^sb-/ });
  expect(await servedTheme(page, "/logg-inn")).toBe("dark");
  await page.goto("/logg-inn");
  expect(await background(page)).toBe(pageColour.dark);
  expect(problems).toEqual([]);
  await page.context().close();
});

test("a member on a dark device chooses light, and then the device again", async ({
  browser,
  baseURL,
}) => {
  const page = await signedIn(browser, baseURL!, "dark");

  await openAppearance(page, "Følg systemet");
  expect(await background(page)).toBe(pageColour.dark);

  await choose(page, "Lyst");
  await expect.poll(() => background(page)).toBe(pageColour.light);
  expect(await axeViolations(page)).toEqual([]);
  expect(await servedTheme(page, "/")).toBe("light");

  await openAppearance(page, "Lyst");
  await choose(page, "Følg systemet");
  await expect.poll(() => background(page)).toBe(pageColour.dark);
  expect(await servedTheme(page, "/")).toBeNull();
  expect(
    (await page.context().cookies()).some(
      ({ name }) => name === "lanbort-tema",
    ),
  ).toBe(false);
  await page.context().close();
});

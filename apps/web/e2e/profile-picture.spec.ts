import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import {
  accountId,
  axeViolations,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
} from "./helpers";

/**
 * Profile pictures (PS-USR-002) in a real browser: a member places a photo
 * in the picture frame, and a fellow member sees the picture beside the
 * name, until it is shown only to its owner.
 */

async function signedIn(browser: Browser, baseURL: string, name: string) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await registerThroughApi(page.request, undefined, name);
  return { page, id: await accountId(page.request) };
}

/** A landscape photo with a sideways camera orientation, as phones take. */
const photo = () =>
  sharp({
    create: { width: 900, height: 600, channels: 3, background: "#3a7d6b" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

/** Whether the picture beside a name has loaded from the API. */
const loaded = (page: Page, name: string) =>
  page
    .getByRole("link", { name })
    .locator("img")
    .evaluate((image: HTMLImageElement) =>
      image.decode().then(() => image.naturalWidth),
    );

test("a member frames a picture that fellow members see beside the name", async ({
  browser,
  baseURL,
}) => {
  const anna = await signedIn(browser, baseURL!, "Anna Berg");
  const bo = await signedIn(browser, baseURL!, "Bo Dahl");
  const problems = collectBrowserProblems(anna.page);
  const { environmentId } = await (
    await postCommand(anna.page.request, "/api/environments", {
      name: `Gården ${randomUUID().slice(0, 8)}`,
      type: "open",
    })
  ).json();
  await postCommand(bo.page.request, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });

  // Anna chooses a photo and places it in the frame.
  await anna.page.goto("/konto/profilbilde");
  await anna.page.getByLabel("Legg til profilbilde").setInputFiles({
    name: "meg.jpg",
    mimeType: "image/jpeg",
    buffer: await photo(),
  });
  const stage = anna.page.getByRole("img", { name: "Utsnitt av bildet" });
  await expect(stage).toBeVisible();
  expect(await axeViolations(anna.page)).toEqual([]);
  await stage.focus();
  await anna.page.keyboard.press("ArrowDown");
  await anna.page.keyboard.press("]");
  await anna.page.getByLabel("Zoom").fill("1.5");
  await anna.page
    .getByRole("button", { name: "Roter en kvart omdreining" })
    .click();
  await expect(anna.page.getByText("Rotasjon: 91°")).toBeVisible();
  const uploaded = anna.page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account/picture") && response.ok(),
  );
  await anna.page.getByRole("button", { name: "Lagre bildet" }).click();
  await uploaded;

  // The picture replaces her initials at the top of every page.
  await anna.page.goto("/");
  const account = anna.page.getByRole("link", {
    name: "Konto og innstillinger for Anna Berg",
  });
  await expect(account.locator("img")).toBeVisible();
  const src = await account.locator("img").getAttribute("src");
  const stored = await anna.page.request.get(src!);
  expect(stored.headers()["content-type"]).toBe("image/webp");
  // Cropped to the frame and no larger than it is shown.
  expect(await sharp(await stored.body()).metadata()).toMatchObject({
    format: "webp",
    width: 384,
    height: 384,
  });

  // Bo sees it beside her name among the members, and on her page.
  await bo.page.goto(`/miljoer/${environmentId}`);
  expect(await loaded(bo.page, "Anna Berg")).toBeGreaterThan(0);
  await bo.page.goto(`/personer/${anna.id}`);
  await expect(bo.page.locator(".page-picture img")).toBeVisible();
  // Beside her name, as on a person's page in the design.
  const picture = await bo.page.locator(".page-picture").boundingBox();
  const name = await bo.page.getByRole("heading", { level: 1 }).boundingBox();
  expect(picture!.x + picture!.width).toBeLessThanOrEqual(name!.x);

  // Shown only to herself, it is gone for Bo, also at its address.
  await anna.page.goto("/konto/profilbilde");
  const saved = anna.page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account/picture/visibility") &&
      response.ok(),
  );
  await anna.page.getByLabel("Bare deg").check();
  await saved;
  await bo.page.goto(`/miljoer/${environmentId}`);
  await expect(
    bo.page.getByRole("link", { name: "Anna Berg" }).locator("img"),
  ).toHaveCount(0);
  expect((await bo.page.request.get(src!)).status()).toBe(404);

  // Removed, her initials are back.
  const removed = anna.page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account/picture/removal") && response.ok(),
  );
  await anna.page.getByRole("button", { name: "Fjern profilbildet" }).click();
  await removed;
  await anna.page.goto("/");
  await expect(account.locator("img")).toHaveCount(0);
  await expect(account).toContainText("AB");
  expect(problems.filter((problem) => !problem.includes("404"))).toEqual([]);
});

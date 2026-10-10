import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  axeViolations,
  befriend,
  collectBrowserProblems,
  enterEmailCode,
  newEmail,
  postCommand,
  registerThroughApi,
  requestLoan,
  uniqueWord,
} from "./helpers";

/**
 * Hard states in the browser: pages that are not there, a session that has
 * run out, a command whose answer was lost after the server did it, a
 * press made with no connection, and a page the other party changed while
 * it was open.
 */

/**
 * The next `method` call to `path` reaches the server and is done there,
 * but its answer never reaches the page, as when a mobile connection drops.
 */
async function loseNextAnswer(page: Page, path: string, method = "POST") {
  let lost = false;
  await page.route(`**${path}`, async (route) => {
    if (lost || route.request().method() !== method) {
      await route.fallback();
      return;
    }
    lost = true;
    await route.fetch();
    await route.abort("connectionreset");
  });
}

const lostAnswer = /Fikk ikke svar fra Lånbort/;

/** What went wrong, as the page says it (Next.js's route announcer is an empty alert too). */
const alertOn = (page: Page) =>
  page.getByRole("alert").filter({ hasText: /\S/ });

test("a hidden page and a missing one look the same, and lead home", async ({
  browser,
  page,
}) => {
  const owner = await browser.newContext();
  await registerThroughApi(owner.request);
  const { environmentId } = await (
    await postCommand(owner.request, "/api/environments", {
      name: "Det skjulte laget",
      type: "hidden",
    })
  ).json();
  await owner.close();

  await registerThroughApi(page.request);
  const problems = collectBrowserProblems(page);
  const shown: string[] = [];

  // PS-NFR-002: the same page whether it is hidden, gone or never was.
  for (const path of [
    `/miljoer/${environmentId}`,
    `/miljoer/${randomUUID()}`,
    `/ting/${randomUUID()}`,
    "/ingen-slik-side",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "Finnes ikke" }),
    ).toBeVisible();
    shown.push(await page.locator("main").innerText());
  }

  expect(new Set(shown).size).toBe(1);
  expect(shown[0]).not.toContain("Det skjulte laget");
  expect(await axeViolations(page)).toEqual([]);
  // The browser itself logs the 404 answers; the page logs nothing.
  expect(problems.filter((problem) => !problem.includes("404"))).toEqual([]);

  await page.getByRole("link", { name: "Til Hjem" }).click();
  await expect(page).toHaveURL("/");
});

test("signing in again leads back to the page the user asked for", async ({
  page,
}) => {
  const email = newEmail();
  await registerThroughApi(page.request, email);
  await page.context().clearCookies();

  await page.goto("/lan/avsluttede");
  await expect(page).toHaveURL("/logg-inn?neste=%2Flan%2Favsluttede");
  await enterEmailCode(page, email);
  await expect(page).toHaveURL("/lan/avsluttede");
});

test("a command whose answer was lost, sent again after an edit, is not done twice", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request);
  const word = uniqueWord();

  await page.goto("/miljoer/ny");
  await page.getByLabel("Navn").fill(`Laget ${word}`);
  await page.getByLabel("Åpent miljø").check();
  await loseNextAnswer(page, "/api/environments");
  await page.getByRole("button", { name: "Opprett miljøet" }).click();
  await expect(alertOn(page)).toHaveText(lostAnswer);

  await page.getByLabel("Navn").fill(`Laget ${word} og venner`);
  await page.getByRole("button", { name: "Opprett miljøet" }).click();
  await expect(alertOn(page)).toHaveText(
    "Det du sendte før forbindelsen brøt, kom fram slik det var da. Sjekk at det ble som du ville før du sender igjen.",
  );
  const environments = await (
    await page.request.get("/api/environments")
  ).json();
  expect(environments).toMatchObject([{ name: `Laget ${word}` }]);
  expect(
    problems.filter(
      (problem) => !problem.startsWith("Failed to load resource"),
    ),
  ).toEqual([]);
});

test("a thing whose registration answer was lost is registered once", async ({
  page,
}) => {
  await registerThroughApi(page.request);
  const word = uniqueWord();

  await page.goto("/ting/ny");
  await page.getByLabel("Navn").fill(`Sag ${word}`);
  await page.getByLabel("Kategori").selectOption({ label: "Verktøy" });
  await page.getByLabel("Beskrivelse").fill("Fintannet håndsag.");
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Videre" }).click();
  }
  await loseNextAnswer(page, "/api/objects");
  await page.getByRole("button", { name: "Lagre uten å publisere" }).click();
  await expect(alertOn(page)).toHaveText(lostAnswer);

  // Back to the first step from the review, which every screen size has,
  // a new name, and saved again.
  await page.getByRole("button", { name: "Endre om tingen" }).click();
  await page.getByLabel("Navn").fill(`Baufil ${word}`);
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Videre" }).click();
  }
  await page.getByRole("button", { name: "Lagre uten å publisere" }).click();
  await expect(alertOn(page)).toContainText(
    "Tingen ble registrert før forbindelsen brøt",
  );
  await page.getByRole("link", { name: "Gå til Mine ting" }).click();
  await expect(page).toHaveURL("/mine-ting");
  await expect(page.getByText(`Sag ${word}`)).toBeVisible();
  await expect(page.getByText(`Baufil ${word}`)).toHaveCount(0);
});

test("a press made with no connection says so, keeps what was filled in, and is done once afterwards", async ({
  page,
  context,
}) => {
  await registerThroughApi(page.request);
  const name = `Laget ${uniqueWord()}`;

  await page.goto("/miljoer/ny");
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Åpent miljø").check();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Opprett miljøet" }).click();
  await expect(alertOn(page)).toHaveText(lostAnswer);
  await expect(page.getByLabel("Navn")).toHaveValue(name);

  await context.setOffline(false);
  await page.getByRole("button", { name: "Opprett miljøet" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  const environments = await (
    await page.request.get("/api/environments")
  ).json();
  expect(environments).toMatchObject([{ name }]);
});

test("an approval of a request the borrower withdrew meanwhile says what changed, and shows what holds", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  const anna = page.request;
  await registerThroughApi(anna, undefined, "Anna Berg");
  const bo = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(bo, undefined, "Bo Dahl");
  await befriend(anna, bo);
  const title = `Stige ${uniqueWord()}`;
  const requestId = await requestLoan(anna, bo, title);

  await page.goto(`/lan/foresporsel/${requestId}`);
  const approve = page.getByRole("button", { name: /^Godkjenn lån / });
  const label = await approve.textContent();
  await approve.click();
  // Bo takes it back while Anna reads what approving means.
  await postCommand(bo, `/api/loan-requests/${requestId}/withdraw`);
  await page.getByRole("dialog").getByRole("button", { name: label! }).click();

  await expect(alertOn(page)).toHaveText(/^Noe endret seg mens du så på siden/);
  await expect(page.getByText("Låntakeren trakk forespørselen")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Godkjenn lån / }),
  ).toHaveCount(0);
  expect(
    await (await anna.get(`/api/loan-requests/${requestId}`)).json(),
  ).toMatchObject({ status: "ended", endReason: "withdrawn" });
  expect(
    problems.filter(
      (problem) => !problem.startsWith("Failed to load resource"),
    ),
  ).toEqual([]);
});

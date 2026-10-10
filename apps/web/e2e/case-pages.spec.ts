import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  uniqueWord,
} from "./helpers";

/**
 * WP-88: cases in their context, in a real browser. A member writes to an
 * environment's administrators; one of them finds it from Home, takes it,
 * answers and closes it; the member sees the answer as the function's. A
 * report never reaches the person it is about (UX-IA-007, PS-COM-010–011).
 */

async function signedIn(browser: Browser, baseURL: string, name: string) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await registerThroughApi(page.request, undefined, name);
  return page;
}

const statusCard = (page: Page) => page.locator(".status-card");
const entry = (page: Page, text: string) =>
  page.getByRole("listitem").filter({ hasText: text });

test("a member's contact is taken from Home, answered and closed in the case", async ({
  browser,
  baseURL,
}) => {
  const eva = await signedIn(browser, baseURL!, "Eva Eier");
  const ola = await signedIn(browser, baseURL!, "Ola Medlem");
  const problems = [eva, ola].map(collectBrowserProblems);
  const name = `Borettslaget ${uniqueWord()}`;
  const { environmentId } = await (
    await postCommand(eva.request, "/api/environments", { name, type: "open" })
  ).json();
  await postCommand(ola.request, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });

  await ola.goto(`/saker/ny?kontakt=${environmentId}`);
  await expect(ola.locator(".tag-context")).toContainText(name);
  await ola.getByLabel("Melding").fill("Hvem har nøkkelen til boden?");
  await ola.getByRole("button", { name: "Send til administratorene" }).click();
  await expect(ola).toHaveURL(/\/saker\/[0-9a-f-]{36}$/);
  await expect(statusCard(ola)).toContainText(
    `Venter på at administratorene i ${name} tar saken`,
  );
  const caseUrl = ola.url();

  // The administrator's Home leads to the queue, and the queue to the case.
  await eva.goto("/");
  await eva
    .getByRole("group", { name })
    .getByRole("link", { name: "Svar på 1 henvendelse" })
    .click();
  await expect(eva.getByRole("heading", { level: 1 })).toHaveText("Saker");
  await eva.getByRole("link", { name: /Henvendelse fra Ola Medlem/ }).click();
  await expect(eva).toHaveURL(caseUrl);
  await expect(eva.getByText("Hvem har nøkkelen til boden?")).toBeVisible();
  await eva.getByRole("button", { name: "Ta saken" }).click();
  await expect(statusCard(eva)).toContainText("Du har saken");

  await eva
    .getByRole("textbox", { name: "Innlegg" })
    .fill("Nøkkelen henger i gangen.");
  await eva.getByRole("button", { name: "Send innlegget" }).click();
  await expect(entry(eva, "Nøkkelen henger i gangen.")).toContainText(
    "Ola Medlem ser dette",
  );
  await eva.getByRole("button", { name: "Lukk saken" }).click();
  await eva
    .getByRole("dialog")
    .getByRole("button", { name: "Lukk saken" })
    .click();
  await expect(statusCard(eva)).toContainText("Saken er lukket");
  await eva.getByText("Historikk", { exact: true }).click();
  await expect(eva.getByText("Eva Eier lukket saken")).toBeVisible();
  // A handler still corrects a factual error once it is closed (PS-COM-014).
  await eva
    .getByRole("textbox", { name: "Rettelse" })
    .fill("Nøkkelen henger i kjelleren.");
  await eva.getByRole("button", { name: "Send rettelsen" }).click();
  await expect(entry(eva, "Nøkkelen henger i kjelleren.")).toContainText(
    "Retter innlegget fra",
  );

  // The member sees the answer as the administrators', not as Eva's.
  await ola.goto(caseUrl);
  await expect(entry(ola, "Nøkkelen henger i gangen.")).toContainText(
    `Administratorene i ${name}`,
  );
  await expect(entry(ola, "Nøkkelen henger i kjelleren.")).toBeVisible();
  await expect(ola.getByText("Eva Eier")).toHaveCount(0);
  await expect(ola.getByRole("button", { name: "Ta saken" })).toHaveCount(0);
  await expect(ola.getByRole("textbox")).toHaveCount(0);
  await ola.goto("/saker");
  await expect(ola.getByRole("list", { name: "Lukkede" })).toContainText(
    "Henvendelse til administratorene",
  );

  for (const each of problems) expect(each).toEqual([]);

  // The queue is the administrators' only.
  expect((await ola.goto(`/saker/miljo/${environmentId}`))?.status()).toBe(404);
  await Promise.all([eva, ola].map((page) => page.context().close()));
});

test("a report reaches the administrators, and never the person it is about", async ({
  browser,
  baseURL,
}) => {
  const eva = await signedIn(browser, baseURL!, "Eva Eier");
  const ola = await signedIn(browser, baseURL!, "Ola Medlem");
  const kim = await signedIn(browser, baseURL!, "Kim Rapportert");
  const name = `Lag ${uniqueWord()}`;
  const { environmentId } = await (
    await postCommand(eva.request, "/api/environments", { name, type: "open" })
  ).json();
  for (const member of [ola, kim]) {
    await postCommand(member.request, "/api/environments/membership/join", {
      environmentId,
      answers: [],
    });
  }
  const kimId = await accountId(kim.request);

  await ola.goto(`/saker/ny?miljo=${environmentId}&person=${kimId}`);
  await expect(ola.getByRole("heading", { level: 1 })).toHaveText(
    "Rapporter Kim Rapportert",
  );
  await ola.getByLabel("Hva har skjedd").fill("Truende meldinger i lobbyen.");
  await ola
    .getByRole("button", { name: "Send rapporten til administratorene" })
    .click();
  await expect(ola).toHaveURL(/\/saker\/[0-9a-f-]{36}$/);
  const caseUrl = ola.url();
  await expect(ola.getByRole("heading", { level: 1 })).toHaveText(
    "Rapport om Kim Rapportert",
  );

  await eva.goto(caseUrl);
  await expect(eva.getByRole("heading", { level: 1 })).toHaveText(
    "Rapport om Kim Rapportert",
  );
  // Lånbort cannot take a report yet, and the page says so (UX-EXC-011).
  await eva.getByText("Flere valg").click();
  await expect(eva.getByText("Send videre til Lånbort")).toBeVisible();
  await expect(eva.getByRole("button", { name: /Lånbort/ })).toHaveCount(0);

  // A report is closed with a closing message to the reporter (PS-COM-020).
  await eva.getByRole("button", { name: "Ta saken" }).click();
  await expect(statusCard(eva)).toContainText("Du har saken");
  await eva.getByRole("button", { name: "Lukk saken" }).click();
  const sheet = eva.getByRole("dialog");
  await sheet
    .getByLabel("Avslutningsmelding til partene")
    .fill("Takk for rapporten. Saken er vurdert og avsluttet.");
  await sheet.getByRole("button", { name: "Lukk saken" }).click();
  await expect(statusCard(eva)).toContainText("Saken er lukket");
  await ola.goto(caseUrl);
  await expect(
    entry(ola, "Takk for rapporten. Saken er vurdert og avsluttet."),
  ).toContainText("Avslutningsmelding");

  expect((await kim.goto(caseUrl))?.status()).toBe(404);
  await kim.goto("/saker");
  await expect(kim.getByText(/Du har ingen saker\./)).toBeVisible();
  await Promise.all([eva, ola, kim].map((page) => page.context().close()));
});

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
  await expect(ola.getByText(`Administratorene i ${name}`)).toBeVisible();
  await ola.getByLabel("Melding").fill("Hvem har nøkkelen til boden?");
  await ola.getByRole("button", { name: "Send til administratorene" }).click();
  await expect(ola).toHaveURL(/\/saker\/[0-9a-f-]{36}$/);
  await expect(statusCard(ola)).toContainText(
    "Venter på at miljøets administratorer tar saken",
  );
  const caseUrl = ola.url();

  // The administrator's Home leads to the queue, and the queue to the case.
  await eva.goto("/");
  await eva
    .getByRole("group", { name })
    .getByRole("link", { name: "Svar på 1 henvendelse" })
    .click();
  await expect(eva.getByRole("heading", { level: 1 })).toHaveText("Saker");
  await eva.getByRole("link", { name: "Kontakt med administratorene" }).click();
  await expect(eva).toHaveURL(caseUrl);
  await expect(eva.getByText("Hvem har nøkkelen til boden?")).toBeVisible();
  await eva.getByRole("button", { name: "Ta saken" }).click();
  await expect(statusCard(eva)).toContainText("Du har saken");

  await eva.getByLabel("Nytt innlegg").fill("Nøkkelen henger i gangen.");
  await eva.getByRole("button", { name: "Send innlegget" }).click();
  await expect(
    eva.locator(".entry", { hasText: "Nøkkelen henger i gangen." }),
  ).toContainText("Alle parter ser dette");
  await eva.getByRole("button", { name: "Lukk saken" }).click();
  await eva
    .getByRole("dialog")
    .getByRole("button", { name: "Lukk saken" })
    .click();
  await expect(statusCard(eva)).toContainText("Saken er lukket");
  await eva.getByText("Historikk", { exact: true }).click();
  await expect(eva.getByText("Eva Eier lukket saken")).toBeVisible();

  // The member sees the answer as the administrators', not as Eva's.
  await ola.goto(caseUrl);
  await expect(
    ola.locator(".entry", { hasText: "Nøkkelen henger i gangen." }),
  ).toContainText("Miljøets administratorer");
  await expect(ola.getByText("Eva Eier")).toHaveCount(0);
  await expect(ola.getByRole("button", { name: "Ta saken" })).toHaveCount(0);
  await expect(ola.getByLabel("Nytt innlegg")).toHaveCount(0);
  await ola.goto("/saker");
  await expect(
    ola.getByRole("list", { name: "Dine saker, nyeste først" }),
  ).toContainText("Saken er lukket");

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
    "Rapporter en person",
  );
  await ola.getByLabel("Hva har skjedd").fill("Truende meldinger i lobbyen.");
  await ola
    .getByRole("button", { name: "Send rapporten til administratorene" })
    .click();
  await expect(ola).toHaveURL(/\/saker\/[0-9a-f-]{36}$/);
  const caseUrl = ola.url();
  await expect(ola.getByRole("heading", { level: 1 })).toHaveText(
    "Rapport til miljøet om Kim Rapportert",
  );

  await eva.goto(caseUrl);
  await expect(eva.getByRole("heading", { level: 1 })).toHaveText(
    "Rapport til miljøet om Kim Rapportert",
  );
  // Taking it further is a rarer step, under «Flere valg».
  await eva.getByText("Flere valg").click();
  await expect(
    eva.getByRole("button", { name: "Send rapporten videre til Lånbort" }),
  ).toBeVisible();

  expect((await kim.goto(caseUrl))?.status()).toBe(404);
  await kim.goto("/saker");
  await expect(kim.getByText("Du er ikke part i noen saker.")).toBeVisible();
  await Promise.all([eva, ola, kim].map((page) => page.context().close()));
});

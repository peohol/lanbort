import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  uniqueWord,
  untilOutboxSettles,
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

  // The reporter withdraws it: nothing is removed, and the administrators
  // may still finish the assessment (PS-COM-021).
  await ola.getByText("Flere valg").click();
  await ola.getByRole("button", { name: "Trekk rapporten" }).click();
  await ola
    .getByRole("dialog")
    .getByRole("button", { name: "Trekk rapporten" })
    .click();
  await expect(ola.getByText(/^Du trakk rapporten/)).toBeVisible();
  await expect(entry(ola, "Truende meldinger i lobbyen.")).toBeVisible();
  await expect(
    ola.getByRole("button", { name: "Trekk rapporten" }),
  ).toHaveCount(0);
  await eva.reload();
  await expect(
    eva.getByText(/^Ola Medlem trakk rapporten .+dere kan likevel/),
  ).toBeVisible();

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

test("a member ends their own contact, and the administrators see who did", async ({
  browser,
  baseURL,
}) => {
  const eva = await signedIn(browser, baseURL!, "Eva Eier");
  const ola = await signedIn(browser, baseURL!, "Ola Medlem");
  const name = `Lia ${uniqueWord()}`;
  const { environmentId } = await (
    await postCommand(eva.request, "/api/environments", { name, type: "open" })
  ).json();
  await postCommand(ola.request, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });

  await ola.goto(`/saker/ny?kontakt=${environmentId}`);
  await ola.getByLabel("Melding").fill("Kan vi få en felles stige?");
  await ola.getByRole("button", { name: "Send til administratorene" }).click();
  await expect(ola).toHaveURL(/\/saker\/[0-9a-f-]{36}$/);
  const caseUrl = ola.url();

  // Nothing disappears, so nothing asks to confirm (PS-COM-021).
  await ola.getByText("Flere valg").click();
  await ola.getByRole("button", { name: "Avslutt henvendelsen" }).click();
  await expect(statusCard(ola)).toContainText("Saken er lukket");
  await expect(ola.getByRole("textbox")).toHaveCount(0);

  await eva.goto(caseUrl);
  await expect(statusCard(eva)).toContainText("Saken er lukket");
  await eva.getByText("Historikk", { exact: true }).click();
  await expect(
    eva.getByText("Ola Medlem avsluttet henvendelsen"),
  ).toBeVisible();
  await Promise.all([eva, ola].map((page) => page.context().close()));
});

test("the owner of a blocked thing is told what, where and why, never of the report", async ({
  browser,
  baseURL,
}) => {
  const eva = await signedIn(browser, baseURL!, "Eva Eier");
  const jonas = await signedIn(browser, baseURL!, "Jonas Vik");
  const kari = await signedIn(browser, baseURL!, "Kari Nordmann");
  const name = `Lia ${uniqueWord()}`;
  const { environmentId } = await (
    await postCommand(eva.request, "/api/environments", { name, type: "open" })
  ).json();
  for (const member of [jonas, kari]) {
    await postCommand(member.request, "/api/environments/membership/join", {
      environmentId,
      answers: [],
    });
  }
  const { objectId } = await (
    await postCommand(jonas.request, "/api/objects", {
      title: "Gassflaske 11 kg",
      categoryId: "annet",
      description: "Full.",
      availability: [{ start: "2030-07-01", end: null }],
    })
  ).json();
  await postCommand(jonas.request, `/api/objects/${objectId}/publications`, {
    environmentId,
  });
  const { caseId } = await (
    await postCommand(kari.request, "/api/environments/reports", {
      environmentId,
      target: { kind: "object", objectId },
      body: "Flasken er fylt med propan.",
    })
  ).json();
  await postCommand(eva.request, `/api/cases/${caseId}/claim`, {});
  await postCommand(eva.request, `/api/cases/${caseId}/measures`, {
    measure: "publication_blocked",
    reason: "Fylt gassflaske står på listen over det som ikke kan lånes ut.",
  });

  // A required notice to the owner (PS-TRUST-018).
  await untilOutboxSettles(jonas.request, async () =>
    (
      await (await jonas.request.get("/api/notifications")).json()
    ).notifications.some(
      (notification: { kind: string }) =>
        notification.kind === "moderation.measure_taken",
    ),
  );
  await jonas.goto("/varsler");
  await jonas
    .getByRole("link", {
      name: /Tingen din er sperret for publisering i et miljø/,
    })
    .click();
  await expect(jonas).toHaveURL(/\/saker\/tiltak\/[0-9a-f-]{36}$/);
  await expect(jonas.getByRole("heading", { level: 1 })).toHaveText(
    "Gassflaske 11 kg",
  );
  await expect(statusCard(jonas)).toContainText(
    `Publiseringen er sperret i ${name}`,
  );
  await expect(statusCard(jonas)).toContainText(
    "Begrunnelse: Fylt gassflaske står på listen over det som ikke kan lånes ut.",
  );
  await expect(
    jonas.getByRole("link", { name: "Be om ny vurdering" }),
  ).toHaveAttribute("href", `/saker/ny?kontakt=${environmentId}`);
  // Nothing says there was a report, or who sent it.
  await expect(jonas.getByText(/rapport|Kari/i)).toHaveCount(0);

  // Nobody else learns that the measure exists.
  expect((await kari.goto(jonas.url()))?.status()).toBe(404);
  await Promise.all([eva, jonas, kari].map((page) => page.context().close()));
});

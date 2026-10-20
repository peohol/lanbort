import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDatabase } from "@lanbort/database";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  axeViolations,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  uniqueWord,
} from "./helpers";

/**
 * The closed pilot's workspace in a real browser on a phone
 * (docs/implementation/pilot-ui.md): the lead runs a campaign, records
 * results in few taps, gives a participant a task and downloads the
 * results; the participant sees only their own task; anyone else finds
 * nothing at all.
 */

const phone = { width: 390, height: 844 };

/** The owner's connection, as the lead role is granted in production. */
function owner() {
  return createDatabase({
    connectionString: process.env.ADMIN_DATABASE_URL!,
    maxConnections: 1,
  });
}

async function signedIn(browser: Browser, baseURL: string, name: string) {
  const context = await browser.newContext({ baseURL, viewport: phone });
  const page = await context.newPage();
  const email = await registerThroughApi(page.request, undefined, name);
  return { page, email };
}

async function noAccessibilityProblems(page: Page) {
  expect(await axeViolations(page)).toEqual([]);
}

test.beforeAll(async () => {
  expect(
    process.env.ADMIN_DATABASE_URL,
    "ADMIN_DATABASE_URL (pnpm env:local)",
  ).toBeTruthy();
  // A campaign another run left open would stop this one.
  const db = owner();
  await db
    .updateTable("app.pilot_campaigns")
    .set((eb) => ({
      closed_at: eb.fn("greatest", [eb.fn("now"), eb.ref("started_at")]),
      closed_by: eb.ref("started_by"),
    }))
    .where("closed_at", "is", null)
    .execute();
  await db.destroy();
});

test("the pilot lead runs the pilot from a phone, and a participant sees only their task", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const lead = await signedIn(browser, baseURL!, "Lea Leder");
  // A name of its own: participants stay in the shared database.
  const participantName = `Kari ${uniqueWord()}`;
  const participant = await signedIn(browser, baseURL!, participantName);
  const outsider = await signedIn(browser, baseURL!, "Ola Utenfor");

  // Nobody is in the pilot until the database owner says so.
  for (const path of ["/pilot", "/pilot/oppgaver"]) {
    const response = await lead.page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  const problems = collectBrowserProblems(lead.page);
  const db = owner();
  await db
    .selectNoFrom((eb) =>
      eb
        .fn("app.grant_pilot_lead", [eb.val(lead.email), eb.val("E2E")])
        .as("id"),
    )
    .execute();
  await db.destroy();

  // Konto leads the lead in; the campaign starts from «Kampanje».
  await lead.page.goto("/konto");
  await lead.page.getByRole("link", { name: "Pilot", exact: true }).click();
  await expect(lead.page.getByRole("heading", { level: 1 })).toHaveText(
    "Pilot",
  );
  await lead.page
    .getByRole("navigation", { name: "Piloten" })
    .getByRole("link", { name: "Kampanje" })
    .click();
  await lead.page.getByRole("button", { name: "Start kampanjen" }).click();
  await expect(lead.page.getByText("Pågår")).toBeVisible();
  await noAccessibilityProblems(lead.page);

  // One tap passes the first of the next tests.
  await lead.page
    .getByRole("navigation", { name: "Piloten" })
    .getByRole("link", { name: "Oversikt" })
    .click();
  await expect(lead.page.getByText("Viser 98 av 98 tester")).toBeVisible();
  await noAccessibilityProblems(lead.page);
  await lead.page
    .getByRole("button", { name: "Registrer A01 som bestått" })
    .click();
  await expect(lead.page.getByText("Viser 97 av 98 tester")).toBeVisible();

  // A failure on the test's own page, with its defect.
  const defect = `Koden kom ikke ${uniqueWord()}`;
  const note = `Ingen e-post ${uniqueWord()}`;
  await lead.page.getByRole("searchbox", { name: "Søk" }).fill("A02");
  await lead.page.getByRole("button", { name: "Vis" }).click();
  await lead.page.getByRole("link", { name: /^A02 / }).click();
  await expect(lead.page.getByRole("heading", { level: 1 })).toHaveText(
    /^A02 /,
  );
  await lead.page.getByRole("radio", { name: "Feilet" }).check();
  await lead.page.getByLabel("Hva er feil, kort").fill(defect);
  await lead.page.getByLabel("Hvor alvorlig").selectOption("P1");
  await lead.page.getByLabel("Hvorfor (må fylles ut)").fill(note);
  await lead.page.getByRole("button", { name: "Lagre resultat" }).click();
  const history = lead.page.getByRole("region", { name: "Historikk" });
  await expect(history.getByText(defect)).toBeVisible();
  await expect(history.getByText(note)).toBeVisible();
  await noAccessibilityProblems(lead.page);

  // The overview warns about it.
  await lead.page.goto("/pilot");
  await expect(
    lead.page.getByText("1 alvorlige feil stopper piloten"),
  ).toBeVisible();

  // The participant joins by their address and gets a task.
  await lead.page
    .getByRole("navigation", { name: "Piloten" })
    .getByRole("link", { name: "Deltakere" })
    .click();
  await lead.page
    .getByLabel("E-postadressen deltakeren logger inn med")
    .fill(participant.email);
  await lead.page.getByRole("button", { name: "Legg til" }).click();
  const row = lead.page.getByText(new RegExp(`P-\\d+ – ${participantName}`));
  await expect(row).toBeVisible();
  const pseudonym = (await row.textContent())!.split(" ")[0]!;
  await noAccessibilityProblems(lead.page);

  await lead.page.goto("/pilot/tester/T01");
  await lead.page.getByText("Gi oppgaven til en deltaker").click();
  await lead.page
    .getByLabel("Deltaker", { exact: true })
    .selectOption({ label: pseudonym });
  await lead.page
    .getByLabel("Mål for deltakeren")
    .fill("Legg ut en ting du kan låne bort");
  await lead.page.getByRole("button", { name: "Gi oppgaven" }).click();
  await expect(
    lead.page.getByRole("region", { name: "Oppgaver til deltakere" }),
  ).toContainText(pseudonym);

  // The participant has only their task, and the lead's pages are not there.
  await participant.page.goto("/konto");
  await participant.page
    .getByRole("link", { name: "Mine pilotoppgaver" })
    .click();
  await expect(
    participant.page.getByText("Legg ut en ting du kan låne bort"),
  ).toBeVisible();
  await expect(participant.page.getByText("T01")).toHaveCount(0);
  await noAccessibilityProblems(participant.page);
  await participant.page.getByLabel("Kommentar (valgfritt)").fill("Fant ikke");
  await participant.page.getByRole("button", { name: "Trenger hjelp" }).click();
  await expect(participant.page.getByText("Sist sa du:")).toBeVisible();
  expect((await participant.page.goto("/pilot"))?.url()).toMatch(
    /\/pilot\/oppgaver$/,
  );
  for (const path of ["/pilot/feil", "/pilot/tester/A01", "/pilot/rapport"]) {
    expect((await participant.page.goto(path))?.status(), path).toBe(404);
  }
  for (const path of ["/api/pilot", "/api/pilot/tests/A01"]) {
    expect((await participant.page.request.get(path)).status(), path).toBe(404);
  }

  // The lead sees what the participant said, under the pseudonym.
  await lead.page.goto("/pilot/tester/T01");
  await expect(
    lead.page.getByRole("region", { name: "Oppgaver til deltakere" }),
  ).toContainText("Trenger hjelp");

  // The results download as a spreadsheet, the testers by pseudonym only.
  await lead.page.goto("/pilot/rapport");
  await noAccessibilityProblems(lead.page);
  const download = lead.page.waitForEvent("download");
  await lead.page
    .getByRole("button", { name: "Resultater som regneark (CSV)" })
    .click();
  const sheet = readFileSync((await (await download).path())!, "utf8");
  expect(sheet).toContain('"A02"');
  expect(sheet).toContain('"Feilet"');
  expect(sheet).not.toContain(participantName);

  // Anyone else finds nothing: no page, no route, no export.
  for (const path of ["/pilot", "/pilot/oppgaver", "/pilot/rapport"]) {
    expect((await outsider.page.goto(path))?.status(), path).toBe(404);
  }
  await outsider.page.goto("/konto");
  await expect(
    outsider.page.getByRole("link", { name: /Pilot|pilotoppgaver/ }),
  ).toHaveCount(0);
  for (const path of ["/api/pilot", "/api/pilot/tasks"]) {
    expect((await outsider.page.request.get(path)).status(), path).toBe(404);
  }
  for (const [path, data] of [
    ["/api/pilot/campaigns", { name: "Kapret" }],
    ["/api/pilot/export", { kind: "results", format: "csv" }],
  ] as const) {
    const response = await outsider.page.request.post(path, {
      data,
      headers: { "Idempotency-Key": randomUUID() },
    });
    expect(response.status(), path).toBe(404);
  }

  // Closing the campaign makes it read-only.
  await lead.page.goto("/pilot/kampanje");
  await lead.page.getByRole("button", { name: "Avslutt kampanjen" }).click();
  await lead.page
    .getByRole("dialog")
    .getByRole("button", { name: "Avslutt kampanjen" })
    .click();
  await expect(lead.page.getByText(/^Avsluttet /)).toBeVisible();
  await lead.page.goto("/pilot/tester/A03");
  await expect(
    lead.page.getByRole("button", { name: "Lagre resultat" }),
  ).toHaveCount(0);
  await postCommand(lead.page.request, "/api/pilot/campaigns", {
    name: "Neste",
  });
  expect(problems).toEqual([]);

  // Leave nothing open for the next run.
  const after = owner();
  await after
    .updateTable("app.pilot_campaigns")
    .set((eb) => ({
      closed_at: eb.fn("greatest", [eb.fn("now"), eb.ref("started_at")]),
      closed_by: eb.ref("started_by"),
    }))
    .where("closed_at", "is", null)
    .execute();
  await after.destroy();
});

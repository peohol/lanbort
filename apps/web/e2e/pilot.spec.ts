import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDatabase } from "@lanbort/database";
import { pilotCases, pilotRequirementsOf } from "@lanbort/contracts";
import { pilotCaseRevision } from "@lanbort/domain";
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
  await expect(
    lead.page.getByRole("button", { name: "Gå videre til fase 1" }),
  ).toBeDisabled();
  await noAccessibilityProblems(lead.page);

  // One tap passes the first of the next tests.
  await lead.page
    .getByRole("navigation", { name: "Piloten" })
    .getByRole("link", { name: "Oversikt" })
    .click();
  await expect(lead.page.getByText("Viser 98 av 98 oppgaver")).toBeVisible();
  await expect(lead.page.locator("#phase-0")).toBeVisible();
  await expect(lead.page.locator("#phase-1")).toBeVisible();
  await expect(
    lead.page.locator('section[aria-labelledby="phase-1"] details'),
  ).not.toHaveAttribute("open");
  await expect(
    lead.page.getByRole("heading", { name: "Konto, innlogging og vennskap" }),
  ).toBeVisible();
  await noAccessibilityProblems(lead.page);
  await lead.page
    .getByRole("button", { name: "Registrer D10 som bestått" })
    .click();
  await expect(lead.page.getByText("Viser 97 av 98 oppgaver")).toBeVisible();

  // A failure on the test's own page, with its defect.
  const defect = `Koden kom ikke ${uniqueWord()}`;
  const note = `Ingen e-post ${uniqueWord()}`;
  await lead.page.getByRole("searchbox", { name: "Søk" }).fill("A02");
  await lead.page.getByRole("button", { name: "Vis" }).click();
  await lead.page.locator('a[href="/pilot/tester/A02"]').click();
  await expect(lead.page.getByRole("heading", { level: 1 })).toHaveText(
    "Prøv å lage konto med en e-postadresse som ikke er invitert",
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
  for (const part of [
    "Før du starter",
    "Slik gjør du det",
    "Testen er bestått når",
  ]) {
    await expect(
      lead.page.getByRole("heading", { name: part, exact: true }),
    ).toBeVisible();
  }
  await noAccessibilityProblems(lead.page);
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
  const next = await postCommand(lead.page.request, "/api/pilot/campaigns", {
    name: "Neste",
  });
  const { id: campaignId } = await next.json();

  // An isolated campaign at its conclusion: all 98 tests have a result, so
  // the default "remaining tasks" view is empty. Its phase must still show.
  const after = owner();
  const { user_id: leadId } = await after
    .selectFrom("app.verified_contacts")
    .select("user_id")
    .where("kind", "=", "email")
    .where("address", "=", lead.email)
    .executeTakeFirstOrThrow();
  await after
    .insertInto("app.pilot_case_revisions")
    .values(
      pilotCases.map((test) => ({
        test_id: test.id,
        revision: pilotCaseRevision(test),
        priority: test.priority,
        action: test.action,
        expected: test.expected,
        prepare: [...test.prepare],
        steps: [...test.steps],
        pass_when: [...test.passWhen],
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(["test_id", "revision"]).doNothing(),
    )
    .execute();
  await after
    .insertInto("app.pilot_runs")
    .values(
      pilotCases.map((test) => ({
        campaign_id: campaignId as string,
        test_id: test.id,
        revision: pilotCaseRevision(test),
        status: "passed" as const,
        recorded_at: new Date(),
        recorded_by: leadId,
        app_version: "e2e",
        environment: "isolated" as const,
        device: "mobile" as const,
        helped: false,
      })),
    )
    .execute();
  await after
    .updateTable("app.pilot_campaigns")
    .set({ phase: 4 })
    .where("id", "=", campaignId as string)
    .execute();
  await lead.page.goto("/pilot");
  await expect(
    lead.page.locator('section[aria-labelledby="phase-4"]'),
  ).toContainText("Alle oppgavene i denne fasen har et registrert resultat.");
  await lead.page.goto("/pilot?vis=all&fase=2");
  await expect(lead.page.locator("#phase-2")).toBeVisible();
  await expect(lead.page.locator("#phase-4")).toHaveCount(0);

  await after
    .updateTable("app.pilot_campaigns")
    .set({ phase: 5 })
    .where("id", "=", campaignId as string)
    .execute();

  await lead.page.goto("/pilot");
  await expect(lead.page.getByText("Viser 0 av 98 oppgaver")).toBeVisible();
  await expect(lead.page.locator("#phase-5")).toContainText(
    "Selvstendig bruk og avslutning",
  );
  await expect(lead.page.locator("#phase-5")).toContainText("Nå");
  await expect(
    lead.page.getByText("Ingen oppgaver passer med dette utvalget."),
  ).toHaveCount(0);
  expect(problems).toEqual([]);

  // Leave nothing open for the next run.
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

test("phase 0 is a checklist: checked by the server, confirmed by the lead, and enforced", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const lead = await signedIn(browser, baseURL!, "Lise Leder");
  const outsider = await signedIn(browser, baseURL!, "Otto Utenfor");
  const problems = collectBrowserProblems(lead.page);
  const db = owner();
  await db
    .selectNoFrom((eb) =>
      eb
        .fn("app.grant_pilot_lead", [eb.val(lead.email), eb.val("E2E")])
        .as("id"),
    )
    .execute();
  const started = await postCommand(lead.page.request, "/api/pilot/campaigns", {
    name: "Klargjøring",
  });
  const { id: campaignId } = (await started.json()) as { id: string };

  // The overview leads to the checklist.
  await lead.page.goto("/pilot");
  await lead.page
    .getByRole("link", { name: "Åpne sjekklisten for klargjøring" })
    .click();
  await expect(lead.page.getByRole("heading", { level: 1 })).toHaveText(
    "Klargjøring",
  );
  const requirement = (title: string) =>
    lead.page.getByRole("listitem").filter({
      has: lead.page.getByRole("heading", { name: title }),
    });

  // Nothing passes before it is checked or confirmed.
  await expect(requirement("Databasen er oppdatert")).toContainText(
    "Ikke kontrollert",
  );
  await expect(
    requirement("Deltakerne er informert og har sagt ja"),
  ).toContainText("Krever manuell bekreftelse");
  await expect(lead.page.getByText("Ikke klar ennå")).toBeVisible();
  await noAccessibilityProblems(lead.page);

  // The server runs its checks; here, outside production, it says what it
  // could not check and what it found.
  await lead.page.getByRole("button", { name: "Kontroller nå" }).click();
  await expect(requirement("Databasen er oppdatert")).toContainText("Bestått");
  await expect(requirement("Pilotjournalen er privat")).toContainText(
    "Bestått",
  );
  // Locally anyone may make an account, and it says so.
  await expect(requirement("Bare inviterte kan lage konto")).toContainText(
    "Feilet",
  );
  await expect(requirement("De automatiske testene er grønne")).toContainText(
    "Kontrolleres bare i den publiserte appen",
  );
  await requirement("Databasen er oppdatert").getByText("Vis detaljer").click();
  await expect(requirement("Databasen er oppdatert")).toContainText(
    "Lånbort sammenligner databaseendringene",
  );
  await expect(requirement("Databasen er oppdatert")).toContainText(
    /Bygget med \d+ databaseendringer/,
  );

  // A manual requirement: confirmed with how, by whom and when; and taken back.
  const consent = requirement("Deltakerne er informert og har sagt ja");
  await consent
    .getByLabel("Hvordan kontrollerte du det?")
    .fill("Informasjonsskriv sendt, ja på e-post");
  await consent.getByRole("button", { name: "Bekreft", exact: true }).click();
  await expect(consent).toContainText("Bestått");
  await expect(consent).toContainText("Bekreftet av Lise Leder");
  await consent.getByText("Vis detaljer").click();
  await expect(consent).toContainText("Informasjonsskriv sendt, ja på e-post");
  await noAccessibilityProblems(lead.page);
  await consent
    .getByRole("button", { name: "Trekk tilbake bekreftelsen" })
    .click();
  await expect(consent).toContainText("Krever manuell bekreftelse");

  // Not ready: the button is off, and the server refuses it anyway.
  await expect(
    lead.page.getByRole("button", { name: "Gå videre til fase 1" }),
  ).toBeDisabled();
  await expect(
    lead.page.getByText("Dette må være på plass først:"),
  ).toBeVisible();
  const early = await lead.page.request.post(
    `/api/pilot/campaigns/${campaignId}/phase`,
    { data: { phase: 1 }, headers: { "Idempotency-Key": randomUUID() } },
  );
  expect(early.status()).toBe(409);

  // Everything else holds, as production's checks would find it: the
  // phase's tests pass, the other manual requirements are confirmed, and
  // the automatic checks passed just now.
  for (const testId of ["A02", "D10", "S02", "S09"]) {
    await postCommand(lead.page.request, "/api/pilot/runs", {
      campaignId,
      testId,
      status: "passed",
      environment: "isolated",
      device: "mobile",
      helped: false,
      testerId: null,
    });
  }
  for (const requirementId of [
    "backup",
    "security-channel",
    "feedback-channel",
    "consent",
  ]) {
    await postCommand(
      lead.page.request,
      `/api/pilot/campaigns/${campaignId}/requirements/${requirementId}/confirm`,
      { note: "Kontrollert" },
    );
  }
  const { user_id: leadId } = await db
    .selectFrom("app.verified_contacts")
    .select("user_id")
    .where("kind", "=", "email")
    .where("address", "=", lead.email)
    .executeTakeFirstOrThrow();
  await db
    .insertInto("app.pilot_readiness_checks")
    .values(
      pilotRequirementsOf(0)
        .filter((each) => each.check === "automatic")
        .map((each) => ({
          campaign_id: campaignId,
          requirement_id: each.id,
          status: "passed",
          summary: "Bestått i produksjon",
          recorded_at: new Date(),
          recorded_by: leadId,
        })),
    )
    .execute();

  await lead.page.reload();
  await expect(lead.page.getByText("Alle krav er bestått")).toBeVisible();
  await lead.page.getByRole("button", { name: "Gå videre til fase 1" }).click();
  await expect(lead.page.getByText("Piloten har gått videre.")).toBeVisible();
  await expect(
    lead.page.getByRole("button", { name: "Bekreft", exact: true }),
  ).toHaveCount(0);
  await lead.page.goto("/pilot");
  await expect(
    lead.page.getByText(/· Fase 1\. Førstegangsbruk · Pågår/),
  ).toBeVisible();

  // Anyone else finds neither the page nor its actions.
  expect((await outsider.page.goto("/pilot/klargjoring"))?.status()).toBe(404);
  for (const path of [
    `/api/pilot/campaigns/${campaignId}/readiness`,
    `/api/pilot/campaigns/${campaignId}/requirements/consent/confirm`,
    `/api/pilot/campaigns/${campaignId}/requirements/consent/withdraw`,
  ]) {
    const response = await outsider.page.request.post(path, {
      data: { note: "Kapret" },
      headers: { "Idempotency-Key": randomUUID() },
    });
    expect(response.status(), path).toBe(404);
  }
  expect(problems).toEqual([]);

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

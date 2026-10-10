import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  accountId,
  axeViolations,
  befriend,
  collectBrowserProblems,
  newEmail,
  postCommand,
  registerThroughApi,
  signInThroughApi,
} from "./helpers";

/**
 * A platform steward's passkeys in a real browser (ADR-0011, OD-0023,
 * «Plattformforvaltning v1»): the operator grants the role and an
 * enrollment code, the steward sets up two passkeys, opens Forvaltning and
 * the platform queue, confirms a new session on another device, and
 * removes a passkey. Chromium's virtual authenticators stand in for the
 * devices. WebAuthn needs a domain, so this runs on APP_URL (localhost),
 * not the bare IP address the other tests use.
 */

const appUrl = process.env.APP_URL ?? "";
const repository = fileURLToPath(new URL("../../..", import.meta.url));

/** An operational command, as the operator runs it; returns what it says. */
function ops(script: string, ...args: string[]): string {
  return execFileSync("pnpm", ["--silent", script, ...args], {
    cwd: repository,
    encoding: "utf8",
  });
}

/** The page's status card. */
const status = (page: Page) => page.getByRole("region", { name: "Status" });

async function signedIn(
  browser: Browser,
  email: string,
  register: boolean,
  name = "Nora Forvalter",
) {
  const context = await browser.newContext({
    baseURL: appUrl,
    extraHTTPHeaders: { origin: appUrl },
  });

  await (register
    ? registerThroughApi(context.request, email, name)
    : signInThroughApi(context.request, email));

  return context;
}

/** A device with a passkey authenticator that answers without a person. */
async function device(context: BrowserContext, page: Page) {
  const cdp: CDPSession = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );

  return {
    async credentials(): Promise<object[]> {
      return (await cdp.send("WebAuthn.getCredentials", { authenticatorId }))
        .credentials;
    },
    async remove() {
      await cdp.send("WebAuthn.removeVirtualAuthenticator", {
        authenticatorId,
      });
    },
    /** A copy of a passkey from another device, as a synced one is. */
    async add(credential: object) {
      await cdp.send("WebAuthn.addCredential", {
        authenticatorId,
        credential: credential as never,
      });
    },
  };
}

test("a platform steward sets up passkeys, confirms a session and removes one", async ({
  browser,
}) => {
  expect(appUrl, "APP_URL must be http://localhost:<port>").toMatch(
    /^http:\/\/localhost:\d+$/,
  );
  const email = newEmail();
  const first = await signedIn(browser, email, true);
  const page = await first.newPage();

  ops(
    "ops:platform-role",
    "grant",
    "--email",
    email,
    "--reason",
    "E2E-forvalter",
  );
  const code = /Enrollment code: ([0-9A-Z-]+)/.exec(
    ops("ops:steward-passkeys", "enroll", "--email", email, "--reason", "E2E"),
  )?.[1];
  expect(code).toBeTruthy();

  // Home shows the role in a section of its own, with its first step.
  await page.goto("/");
  const role = page.getByRole("group", { name: "Forvaltning" });
  await expect(role).toContainText("Du er plattformforvalter");
  await role.getByRole("link", { name: /Sett opp passkeys/ }).click();

  // The first passkey, with the operator's code.
  const phone = await device(first, page);
  await expect(page.getByText("Steg 1 av 2: Første passkey")).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByLabel("Registreringskode").fill("AAAA-BBBB-CCCC-DDDD");
  await page.getByLabel("Navn på passkeyen").fill("Telefonen");
  await page.getByRole("button", { name: "Lag passkey" }).click();
  await expect(page.getByText(/Koden stemmer ikke/)).toBeVisible();
  // The refused code is the one failed request the browser should see.
  const problems = collectBrowserProblems(page);
  await page.getByLabel("Registreringskode").fill(code!.toLowerCase());
  await page.getByRole("button", { name: "Lag passkey" }).click();

  // The second, on another device, from the session the first confirmed.
  await expect(page.getByText("Steg 2 av 2: Andre passkey")).toBeVisible();
  const phoneKeys = await phone.credentials();
  await phone.remove();
  const key = await device(first, page);
  await page.getByLabel("Navn på passkeyen").fill("Nøkkel i skuffen");
  await page.getByRole("button", { name: "Legg til passkey nr. 2" }).click();

  await expect(page).toHaveURL(/\/forvaltning\/passkeys$/);
  await expect(status(page)).toContainText("Forvalterhandlingene er åpne");
  expect(await axeViolations(page)).toEqual([]);
  await expect(page.getByText("Telefonen", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Nøkkel i skuffen", { exact: true }),
  ).toBeVisible();

  // Steward actions are open: Forvaltning and the queue.
  await page.goto("/forvaltning");
  await expect(status(page)).toContainText("Bekreftet");
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole("link", { name: /Plattformkøen/ }).click();
  // Other tests' platform cases may be there too, so only the queue itself.
  await expect(
    page.getByRole("navigation", { name: "Åpne eller lukkede" }),
  ).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  expect(problems).toEqual([]);

  // A report to Lånbort about Tor: the steward takes it and suspends the
  // account from the case, with the basis, then reinstates it
  // (PS-ADM-014–015).
  const torEmail = newEmail();
  const [ida, tor] = await Promise.all(
    [
      ["Ida Melder", newEmail()],
      ["Tor Rapportert", torEmail],
    ].map(([name, address]) => signedIn(browser, address!, true, name)),
  );
  await befriend(ida!.request, tor!.request);
  const { caseId } = await (
    await postCommand(ida!.request, "/api/cases/platform-reports", {
      target: { kind: "user", userId: await accountId(tor!.request) },
      body: "Ber om betaling for lån og truer når noen sier nei.",
    })
  ).json();
  await page.goto(`/saker/${caseId}`);
  await page.getByRole("button", { name: "Ta saken" }).click();
  await expect(page.getByText("Tor Rapportert · konto aktiv")).toBeVisible();
  await page.getByRole("link", { name: "Gjør et inngrep" }).click();
  await expect(
    page.getByRole("heading", { name: "Velg inngrep" }),
  ).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await expect(page.getByRole("link", { name: /Gjeninnsett/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Suspender kontoen/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Suspendere kontoen til Tor Rapportert?",
    }),
  ).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Neste: begrunnelse" }).click();
  await page
    .getByLabel("Begrunnelse")
    .fill("Flere meldinger om trusler etter avslag.");
  await page.getByRole("button", { name: "Neste: se over" }).click();
  await page.getByRole("button", { name: "Suspender kontoen" }).click();
  await expect(page).toHaveURL(new RegExp(`/saker/${caseId}$`));
  await expect(
    page.getByText("Tor Rapportert · konto suspendert"),
  ).toBeVisible();
  const recorded = page.getByRole("region", { name: /Inngrep/ });
  await expect(recorded).toContainText("Suspendert konto");
  await expect(recorded).toContainText(
    "Flere meldinger om trusler etter avslag.",
  );
  await expect(recorded).toContainText("Deg");
  expect(await axeViolations(page)).toEqual([]);
  // Tor's own account says it is suspended.
  expect((await (await tor!.request.get("/api/account")).json()).status).toBe(
    "suspended",
  );

  await page.getByRole("link", { name: "Gjør et inngrep" }).click();
  await expect(
    page.getByRole("link", { name: /Suspender kontoen/ }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: /Gjeninnsett kontoen/ }).click();
  await page.getByRole("button", { name: "Neste: begrunnelse" }).click();
  await page.getByLabel("Begrunnelse").fill("Avklart med begge parter.");
  await page.getByRole("button", { name: "Neste: se over" }).click();
  await page.getByRole("button", { name: "Gjeninnsett kontoen" }).click();
  await expect(page.getByText("Tor Rapportert · konto aktiv")).toBeVisible();
  await expect(recorded).toContainText("Gjeninnsatt konto");

  // Without a report, the steward opens an inquiry of their own, finding
  // the account by its full address and never by name (OD-0055).
  await page.goto("/forvaltning");
  await page.getByRole("link", { name: /Åpne saksgrunnlag/ }).click();
  expect(await axeViolations(page)).toEqual([]);
  const lookup = page.getByLabel("Lenke eller e-postadresse");
  const next = page.getByRole("button", { name: "Neste: grunnlag" });
  await lookup.fill("Tor Rapportert");
  await page.getByRole("button", { name: "Finn" }).click();
  await expect(
    page.getByText(
      "Skriv hele e-postadressen, eller lim inn lenken til personens side.",
      { exact: true },
    ),
  ).toBeVisible();
  await lookup.fill(email);
  await page.getByRole("button", { name: "Finn" }).click();
  await expect(
    page.getByText("Du kan ikke åpne saksgrunnlag om din egen konto."),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await lookup.fill(torEmail.toUpperCase());
  await page.getByRole("button", { name: "Finn" }).click();
  await expect(page.getByText("Konto aktiv")).toBeVisible();
  await next.click();
  await page
    .getByLabel("Hvorfor åpner du saken?")
    .fill("Flere har fortalt om trusler i samtaler.");
  await page.getByRole("button", { name: "Neste: se over" }).click();
  await expect(
    page.getByRole("heading", { name: "Åpne saksgrunnlag om Tor Rapportert?" }),
  ).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Åpne saksgrunnlaget" }).click();
  await expect(page).toHaveURL(/\/saker\/[0-9a-f-]+$/);
  await expect(page.getByText("Tor Rapportert · konto aktiv")).toBeVisible();
  await expect(
    page.getByText("Flere har fortalt om trusler i samtaler."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Gjør et inngrep" }),
  ).toBeVisible();
  await Promise.all([ida!.close(), tor!.close()]);

  // A new session must be confirmed first, here on the phone.
  const second = await signedIn(browser, email, false);
  const laptop = await second.newPage();
  await laptop.goto("/forvaltning");
  await expect(status(laptop)).toContainText("Bekreft først");
  await expect(laptop.getByRole("link", { name: /Plattformkøen/ })).toHaveCount(
    0,
  );
  const borrowed = await device(second, laptop);
  await borrowed.add(phoneKeys[0]!);
  await laptop.getByRole("button", { name: "Bekreft med passkey" }).click();
  await laptop
    .getByRole("dialog", { name: "Bekreft at det er deg" })
    .getByRole("button", { name: "Bruk passkey" })
    .click();
  await expect(status(laptop)).toContainText("Bekreftet");
  await expect(
    laptop.getByRole("link", { name: /Plattformkøen/ }),
  ).toBeVisible();

  // Removing one leaves too few: steward actions close, the last stays.
  await laptop.goto("/forvaltning/passkeys");
  await laptop
    .getByRole("button", { name: "Fjern «Nøkkel i skuffen»" })
    .click();
  const sheet = laptop.getByRole("dialog", {
    name: "Fjerne «Nøkkel i skuffen»?",
  });
  await expect(sheet).toContainText("Du har bare 1 igjen");
  await sheet.getByRole("button", { name: "Fjern passkeyen" }).click();
  await expect(status(laptop)).toContainText("forvalterhandlinger er stengt");
  await expect(
    laptop.getByText("Den siste passkeyen kan ikke fjernes."),
  ).toBeVisible();
  await expect(laptop.getByRole("button", { name: /^Fjern/ })).toHaveCount(0);

  await key.remove();
  await Promise.all([first.close(), second.close()]);
});

test("anyone but a steward finds no Forvaltning", async ({ browser }) => {
  const context = await signedIn(browser, newEmail(), true);
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "For Lånbort" })).toHaveCount(
    0,
  );
  for (const path of [
    "/forvaltning",
    "/forvaltning/passkeys",
    "/forvaltning/ko",
  ]) {
    expect((await page.goto(path))?.status()).toBe(404);
  }

  await context.close();
});

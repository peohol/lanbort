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
  axeViolations,
  collectBrowserProblems,
  newEmail,
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

async function signedIn(browser: Browser, email: string, register: boolean) {
  const context = await browser.newContext({
    baseURL: appUrl,
    extraHTTPHeaders: { origin: appUrl },
  });

  await (register
    ? registerThroughApi(context.request, email, "Nora Forvalter")
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
  await expect(page.getByText("Ingen saker venter nå.")).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  expect(problems).toEqual([]);

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

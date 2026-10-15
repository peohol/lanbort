import { randomUUID } from "node:crypto";
import { type Browser, expect, test } from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  newEmail,
  postCommand,
  registerThroughApi,
} from "./helpers";

/**
 * PS-USR-013–014 in a real browser: a friend request by e-mail address and
 * by QR code. The sender learns nothing about the address, and a code only
 * shows a name until a request is asked for.
 */

async function signedIn(browser: Browser, baseURL: string, name: string) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const email = await registerThroughApi(page.request, undefined, name);
  return { page, email, id: await accountId(page.request) };
}

test("a friend request by e-mail is told the same whether the address has an account", async ({
  browser,
  baseURL,
}) => {
  const anna = await signedIn(browser, baseURL!, "Anna Berg");
  const bo = await signedIn(browser, baseURL!, "Bo Dahl");
  const problems = collectBrowserProblems(anna.page);

  await anna.page.goto("/konto/venner");
  // The form sends nothing until the page is ready.
  await anna.page.waitForLoadState("networkidle");
  await anna.page
    .getByRole("link", { name: /Venneforespørsel på e-post/ })
    .click();
  await expect(anna.page.getByRole("heading", { level: 1 })).toHaveText(
    "Venneforespørsel på e-post",
  );
  // Only those who may invite new people choose whether to befriend.
  await expect(anna.page.getByRole("checkbox")).toHaveCount(0);

  const confirmations: string[] = [];
  for (const address of [bo.email.toUpperCase(), newEmail()]) {
    await anna.page.getByLabel("E-postadresse").fill(address);
    await anna.page.getByRole("button", { name: "Send forespørsel" }).click();
    const status = anna.page
      .getByRole("status")
      .filter({ hasText: "Sendt til" });
    await expect(status).toBeVisible();
    confirmations.push(
      (await status.textContent())!.replace(address.toLowerCase(), "…"),
    );
  }
  expect(confirmations[0]).toBe(confirmations[1]);

  // Bo has the request in the app; Anna sees only her invitations.
  const overview = await (await bo.page.request.get("/api/social")).json();
  expect(overview.incomingRequests).toMatchObject([{ userId: anna.id }]);
  await anna.page.goto("/konto/venner");
  const sent = anna.page.getByRole("region", { name: /Sendt på e-post/ });
  await expect(sent).toContainText(bo.email);
  await expect(
    anna.page.getByRole("heading", { name: /Du har spurt/ }),
  ).toHaveCount(0);

  // A decline changes nothing Anna can see.
  await postCommand(bo.page.request, "/api/social/friend-requests/decline", {
    userId: anna.id,
  });
  await anna.page.reload();
  await expect(sent).toContainText(bo.email);
  await expect(sent.getByRole("listitem")).toHaveCount(2);

  // Withdrawing ends it.
  await sent
    .getByRole("group", { name: bo.email })
    .getByRole("button", { name: "Trekk" })
    .click();
  await expect(sent.getByRole("listitem")).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("a friend code shows only a name until a request is sent", async ({
  browser,
  baseURL,
}) => {
  const anna = await signedIn(browser, baseURL!, "Anna Berg");
  const bo = await signedIn(browser, baseURL!, "Bo Dahl");
  const problems = collectBrowserProblems(bo.page);

  await anna.page.goto("/konto/venner/min-kode");
  await expect(
    anna.page.getByRole("img", { name: "QR-kode for å bli venn med deg" }),
  ).toBeVisible();
  const shown = (await anna.page.locator("p.friend-code").textContent())!;
  expect(shown).toMatch(/^[0-9A-Z]{5} [0-9A-Z]{5}$/);

  // A browser that cannot scan here gets the field for the code.
  await bo.page.goto("/konto/venner/skann");
  await bo.page.getByLabel("Kode", { exact: true }).fill("00000-00000");
  await bo.page.getByRole("button", { name: "Finn personen" }).click();
  await expect(
    bo.page.getByRole("alert").filter({ hasText: "Fant ingen gyldig kode" }),
  ).toBeVisible();
  await bo.page
    .getByRole("button", { name: "Skann eller skriv en annen kode" })
    .click();
  await bo.page
    .getByLabel("Kode", { exact: true })
    .fill(shown.toLowerCase().replace(" ", "-"));
  await bo.page.getByRole("button", { name: "Finn personen" }).click();
  await expect(bo.page.getByRole("listitem")).toContainText("Anna Berg");
  await expect(
    bo.page.getByRole("status").filter({ hasText: "Som venner kan dere" }),
  ).toBeVisible();
  // Looking is not asking.
  expect(
    (await (await anna.page.request.get("/api/social")).json())
      .incomingRequests,
  ).toEqual([]);

  await bo.page.getByRole("button", { name: "Send venneforespørsel" }).click();
  await expect(
    bo.page
      .getByRole("status")
      .filter({ hasText: "Dere blir venner når Anna Berg godtar" }),
  ).toBeVisible();
  expect(
    (await (await anna.page.request.get("/api/social")).json())
      .incomingRequests,
  ).toMatchObject([{ userId: bo.id, realName: "Bo Dahl" }]);

  // The QR code's link opens the same, and leaves no code in the address.
  const code = shown.replace(" ", "");
  await bo.page.goto("/konto/venner");
  await bo.page.goto(`/konto/venner/skann#${code}`);
  await expect(bo.page.getByRole("listitem")).toContainText("Anna Berg");
  expect(new URL(bo.page.url()).hash).toBe("");

  // A new code replaces the old one.
  await anna.page.getByRole("button", { name: "Vis ny kode" }).click();
  await expect(anna.page.locator("p.friend-code")).not.toHaveText(shown);
  const stale = await bo.page.request.get(
    `/api/social/friend-codes/read?code=${code}`,
  );
  expect(stale.status()).toBe(404);
  // Anna's own code is not a way to herself.
  const own = (await anna.page.locator("p.friend-code").textContent())!;
  const self = await anna.page.request.post(
    "/api/social/friend-codes/request",
    {
      data: { code: own },
      headers: { "Idempotency-Key": randomUUID() },
    },
  );
  expect(self.status()).toBe(404);
  // The only failed load is the code that did not exist.
  expect(problems).toEqual([
    "Failed to load resource: the server responded with a status of 404 (Not Found)",
  ]);
});

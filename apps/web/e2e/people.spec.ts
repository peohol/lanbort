import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
} from "./helpers";

/**
 * WP-86 in a real browser: two members of an environment find each other's
 * page, become friends there, and a block takes the blocker's page away
 * from the one blocked (PS-USR-003–006, UX-PRIV-007).
 */

async function signedIn(browser: Browser, baseURL: string, name: string) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await registerThroughApi(page.request, undefined, name);
  return { page, id: await accountId(page.request) };
}

const status = (page: Page) => page.getByRole("region", { name: "Dere to" });

test("members befriend each other on their pages, and a block hides the blocker", async ({
  browser,
  baseURL,
}) => {
  const anna = await signedIn(browser, baseURL!, "Anna Berg");
  const bo = await signedIn(browser, baseURL!, "Bo Dahl");
  const problems = collectBrowserProblems(bo.page);
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

  // Fellow members see each other, with what others said about them.
  await bo.page.goto(`/personer/${anna.id}`);
  await expect(bo.page.getByRole("heading", { level: 1 })).toHaveText(
    "Anna Berg",
  );
  await expect(status(bo.page)).toContainText("Dere er ikke venner");
  // Why Bo sees Anna, and where (UX-PRIV-003).
  await expect(
    bo.page.getByText("Du ser Anna Berg fordi dere begge er med i Gården"),
  ).toBeVisible();
  await expect(
    bo.page.getByRole("heading", { name: "Erfaringer fra lån" }),
  ).toBeVisible();
  await bo.page.getByRole("button", { name: "Send venneforespørsel" }).click();
  await expect(status(bo.page)).toContainText("Venneforespørselen er sendt");
  await expect(status(bo.page)).toContainText("Dere blir venner når Anna Berg");

  await anna.page.goto(`/personer/${bo.id}`);
  await expect(status(anna.page)).toContainText("Bo Dahl vil bli venn med deg");
  await anna.page
    .getByRole("button", { name: "Godta venneforespørselen" })
    .click();
  await expect(status(anna.page)).toContainText("Dere er venner");
  await expect(status(anna.page)).toContainText("Siden ");

  // The account lists the friend, linked to their page.
  await bo.page.goto("/konto");
  await bo.page.getByRole("link", { name: "Anna Berg" }).click();
  await expect(bo.page).toHaveURL(`/personer/${anna.id}`);

  // Blocking says what it ends and what stays before it happens.
  await anna.page.getByText("Flere valg").click();
  // A report goes to the administrators of the environment they share.
  await expect(
    anna.page.getByRole("link", { name: "Rapporter Bo Dahl" }),
  ).toHaveAttribute("href", `/saker/ny?miljo=${environmentId}&person=${bo.id}`);
  await anna.page.getByRole("button", { name: "Blokker Bo Dahl" }).click();
  const dialog = anna.page.getByRole("dialog", { name: "Blokkere Bo Dahl?" });
  await expect(dialog).toContainText("Vennskapet avsluttes.");
  await expect(dialog).toContainText("Lån dere allerede har avtalt.");
  await dialog.getByRole("button", { name: "Blokker Bo Dahl" }).click();
  await expect(status(anna.page)).toContainText("Du har blokkert Bo Dahl");
  await expect(anna.page.getByText("Flere valg")).toHaveCount(0);

  // To Bo, Anna is now no one, exactly like an address that names nobody.
  for (const userId of [anna.id, randomUUID()]) {
    expect((await bo.page.goto(`/personer/${userId}`))?.status()).toBe(404);
  }
  expect(problems.filter((problem) => !problem.includes("404"))).toEqual([]);
});

test("a declined sender only learns that they cannot ask now, and the entry's role comes first", async ({
  browser,
  baseURL,
}) => {
  const anna = await signedIn(browser, baseURL!, "Anna Berg");
  const bo = await signedIn(browser, baseURL!, "Bo Dahl");
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
  await postCommand(bo.page.request, "/api/social/friend-requests", {
    userId: anna.id,
  });
  await anna.page.goto(`/personer/${bo.id}`);
  await anna.page.getByRole("button", { name: "Avslå" }).click();
  // The shared environment still gives Anna the page, so she stays.
  await expect(status(anna.page)).toContainText("Dere er ikke venner");
  await expect(anna.page).toHaveURL(`/personer/${bo.id}`);

  // PS-USR-012: Bo sees no way to ask again, and nothing says why.
  await bo.page.goto(`/personer/${anna.id}`);
  await expect(status(bo.page)).toContainText(
    "Du kan ikke sende Anna Berg en venneforespørsel nå.",
  );
  await expect(
    bo.page.getByRole("button", { name: "Send venneforespørsel" }),
  ).toHaveCount(0);
  await expect(bo.page.getByText(/avslått|avslo|avslag/i)).toHaveCount(0);

  // UX-PRIV-012: the role the page is opened in comes first; both stay.
  const roles = bo.page
    .getByRole("region", { name: "Erfaringer fra lån" })
    .getByRole("heading", { level: 3, name: /^Som / });
  await expect(roles).toHaveText(["Som låntaker", "Som utlåner"]);
  await bo.page.goto(`/personer/${anna.id}?rolle=utlaaner`);
  await expect(roles).toHaveText(["Som utlåner", "Som låntaker"]);

  // A role without reviews says so, and its own page has nothing more.
  await expect(
    bo.page.getByRole("region", { name: "Som utlåner" }),
  ).toContainText("Ingen anmeldelser ennå");
  await bo.page.goto(`/personer/${anna.id}/som-utlaaner`);
  await expect(bo.page.getByRole("heading", { level: 1 })).toHaveText(
    "Anna Berg som utlåner",
  );
  await expect(bo.page.getByText("Ingen anmeldelser ennå.")).toBeVisible();
  expect((await bo.page.goto(`/personer/${anna.id}/noe-annet`))?.status()).toBe(
    404,
  );
});

test("a stranger's page does not exist for the reader", async ({
  browser,
  baseURL,
}) => {
  const anna = await signedIn(browser, baseURL!, "Anna Berg");
  const stranger = await signedIn(browser, baseURL!, "Cleo Eng");

  expect((await stranger.page.goto(`/personer/${anna.id}`))?.status()).toBe(
    404,
  );
  expect((await stranger.page.goto("/personer/ikke-en-person"))?.status()).toBe(
    404,
  );
  expect(
    (await stranger.page.goto(`/personer/${anna.id}/som-laantaker`))?.status(),
  ).toBe(404);
});

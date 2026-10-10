import { expect, test } from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  showToFriends,
  today,
  uniqueWord,
} from "./helpers";

/**
 * WP-83 (UX-JRN-004–006, UX-JRN-013): from a found thing to an approved
 * loan in the browser, the same course through an environment and directly
 * between friends. The message is optional; the owner approves with a
 * button that names the agreement, and lands on the loan.
 */

test("a member asks to borrow a thing in the environment, and the owner approves it", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Anna Berg");
  const word = uniqueWord();
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name: `Gården ${word}`,
      type: "open",
    })
  ).json();
  const { objectId } = await (
    await postCommand(page.request, "/api/objects", {
      title: `Stige ${word}`,
      categoryId: "annet",
      description: "Aluminiumsstige, 4 meter.",
      loanTerms: "Må vaskes etter bruk.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await postCommand(page.request, `/api/objects/${objectId}/publications`, {
    environmentId,
  });

  const members = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(members.request, undefined, "Bo Dahl");
  await postCommand(members.request, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });
  const bo = await members.newPage();
  const boProblems = collectBrowserProblems(bo);
  await bo.goto(`/ting/${objectId}?miljo=${environmentId}`);

  // Follow it, and ask about it where it was found.
  await bo.getByRole("button", { name: "Følg tingen" }).click();
  await expect(bo.getByRole("button", { name: "Slutt å følge" })).toBeVisible();
  await bo.getByLabel("Spør om tingen").fill("Er den lett å bære?");
  await bo.getByRole("button", { name: "Still spørsmålet" }).click();
  await expect(bo.getByText("Er den lett å bære?")).toBeVisible();
  await expect(bo.getByLabel("Spør om tingen")).toHaveValue("");

  await bo.getByRole("link", { name: "Be om å låne" }).click();
  await expect(bo).toHaveURL(
    new RegExp(`/ting/${objectId}/lan\\?miljo=${environmentId}`),
  );
  // When first, in one step; then exactly what is sent.
  const review = bo.getByRole("region", { name: "Forespørselen" });
  await bo.getByLabel("Så snart som mulig").check();
  await bo.getByLabel("Varighet").check();
  await bo.getByLabel("Antall dager").fill("2");
  await expect(
    bo.getByText("Valgt: Så snart som mulig i 2 dager"),
  ).toBeVisible();
  await expect(review).toHaveCount(0);
  await bo.getByRole("button", { name: "Videre" }).click();
  await expect(
    bo.getByRole("heading", { level: 1, name: "Se over og send" }),
  ).toBeVisible();
  await expect(review).toContainText("Så snart som mulig i 2 dager");
  await expect(review).toContainText("Må vaskes etter bruk.");
  await expect(bo.getByText("Ingenting er avtalt ennå.")).toBeVisible();
  // Going back keeps what was filled in.
  await bo.getByRole("button", { name: "Periode" }).click();
  await expect(bo.getByLabel("Antall dager")).toHaveValue("2");
  await bo.getByRole("button", { name: "Videre" }).click();
  await bo.getByRole("button", { name: "Send forespørselen" }).click();

  await expect(bo).toHaveURL(/\/lan\/foresporsel\//);
  await expect(bo.getByText("Venter på svar fra eieren")).toBeVisible();
  const requestUrl = bo.url();
  // The sent form is done with: back from the request leads to the thing.
  await bo.goBack();
  await expect(bo).toHaveURL(
    new RegExp(`/ting/${objectId}\\?miljo=${environmentId}$`),
  );
  await members.close();

  // The owner finds it in Lån, and sees who asks and what approving means.
  await page.goto("/lan");
  await page.getByRole("link", { name: `Stige ${word}` }).click();
  await expect(page).toHaveURL(requestUrl);
  await expect(page.getByText("Bo Dahl vil låne")).toBeVisible();
  const approve = page.getByRole("button", { name: /^Godkjenn lån / });
  const label = await approve.textContent();
  await approve.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Bo Dahl låner");
  await dialog.getByRole("button", { name: label! }).click();

  await expect(page).toHaveURL(/\/lan\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Stige ${word} til Bo Dahl`,
  );
  // The approved request is done with: back from the loan leads to Lån.
  await expect(
    page.locator(`a[href="${new URL(requestUrl).pathname}"]`),
  ).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/lan$/);
  expect(problems).toEqual([]);
  expect(boProblems).toEqual([]);
});

test("a friend asks directly, and both accept the declaration first", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Cleo Eng");
  const cleo = await accountId(page.request);
  const friends = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(friends.request, undefined, "Dan Fjeld");
  await postCommand(friends.request, "/api/social/friend-requests", {
    userId: cleo,
  });
  await postCommand(page.request, "/api/social/friend-requests/accept", {
    userId: await accountId(friends.request),
  });
  const { objectId } = await (
    await postCommand(page.request, "/api/objects", {
      title: "Tilhenger",
      categoryId: "annet",
      description: "Skapbil-tilhenger, 750 kg.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await showToFriends(page.request, objectId);

  const dan = await friends.newPage();
  await dan.goto(`/ting/${objectId}`);
  await expect(dan.getByText("Direkte mellom venner")).toBeVisible();
  await expect(
    dan.getByText("Du ser tingen fordi eieren viser den for venner."),
  ).toBeVisible();
  await dan.getByRole("link", { name: "Be om å låne" }).click();
  await dan.getByLabel("Varighet").check();
  await dan.getByLabel("Antall dager").fill("1");
  await dan.getByRole("button", { name: "Videre" }).click();
  await dan
    .getByLabel("Melding til Cleo Eng (valgfri)")
    .fill("Trenger den til flytting.");
  // The declaration must be accepted before the request is sent.
  const send = dan.getByRole("button", { name: /^Send forespørsel / });
  await send.click();
  await expect(dan).toHaveURL(new RegExp(`/ting/${objectId}/lan`));
  await dan.getByLabel("Jeg godtar ansvarserklæringen for dette lånet").check();
  await send.click();
  await expect(dan.getByText("Venter på svar fra eieren")).toBeVisible();
  const requestUrl = dan.url();
  await friends.close();

  await page.goto(requestUrl);
  await expect(page.getByText("Trenger den til flytting.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Godkjenn lån / }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Godta ansvarserklæringen" }).click();
  await page.getByRole("button", { name: /^Godkjenn lån / }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Godkjenn lån / })
    .click();
  await expect(page).toHaveURL(/\/lan\/[0-9a-f-]{36}$/);
  expect(problems).toEqual([]);
});

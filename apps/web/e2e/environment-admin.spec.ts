import { expect, test } from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  today,
  uniqueWord,
} from "./helpers";

/**
 * WP-85: an environment's administration as tasks on the environment
 * (UX-JRN-012): an application decided with the answers in view, a thing
 * approved, a weaker type proposed with its consequences shown first
 * (UX-INT-007, UX-PRIV-008). Members without a role see no such page.
 */
test("administrators decide memberships, things and the type on the environment", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Eva Eier");
  const word = uniqueWord();
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name: `Borettslaget ${word}`,
      type: "closed",
      requirements: [{ kind: "information", text: "Hvilken leilighet?" }],
    })
  ).json();
  const adminPage = `/miljoer/${environmentId}/administrer`;

  const kari = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(kari.request, undefined, "Kari Nord");
  const { requirements } = await (
    await kari.request.get(
      `/api/environments/details?environmentId=${environmentId}`,
    )
  ).json();
  await postCommand(kari.request, "/api/environments/membership/join", {
    environmentId,
    answers: [{ requirementId: requirements[0].id, answer: "H0201" }],
  });

  await page.goto(adminPage);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Borettslaget ${word}`,
  );
  await expect(page.getByText("1 avgjørelse venter")).toBeVisible();
  const applications = page.getByRole("region", { name: "Innmeldinger" });
  await applications.getByText("Svar til miljøets innmelding").click();
  await expect(applications.getByText("H0201")).toBeVisible();
  await applications
    .getByRole("button", { name: "Godkjenn Kari Nord" })
    .click();
  await expect(
    applications.getByText("Ingen innmeldinger venter."),
  ).toBeVisible();

  // Things need approval once it is required; the dialog says what happens.
  const things = page.getByRole("region", { name: "Ting i miljøet" });
  await things.getByRole("button", { name: "Krev godkjenning" }).click();
  const approvalDialog = page.getByRole("dialog", {
    name: "Krev godkjenning av nye ting",
  });
  await expect(
    approvalDialog.getByText("Nye ting må godkjennes før medlemmene ser dem."),
  ).toBeVisible();
  await approvalDialog
    .getByRole("button", { name: "Krev godkjenning" })
    .click();
  await expect(things.getByText("Nye ting må godkjennes")).toBeVisible();

  const { objectId } = await (
    await postCommand(kari.request, "/api/objects", {
      title: `Stige ${word}`,
      categoryId: "annet",
      description: "Aluminiumsstige, 4 meter.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await postCommand(kari.request, `/api/objects/${objectId}/publications`, {
    environmentId,
  });
  await page.reload();
  const waiting = things.getByRole("region", { name: "Venter på godkjenning" });
  await expect(
    waiting.getByText(`Stige ${word}`, { exact: true }),
  ).toBeVisible();
  await expect(waiting.getByText("lagt ut av Kari Nord")).toBeVisible();
  await waiting.getByRole("button", { name: "Godkjenn" }).click();
  await expect(
    things
      .getByRole("region", { name: "Synlige for medlemmene" })
      .getByText(`Stige ${word}`, { exact: true }),
  ).toBeVisible();

  // A weaker type is only proposed, after its consequences are shown.
  const type = page.getByRole("region", { name: "Miljøtype" });
  await type.getByRole("button", { name: "Foreslå åpent miljø" }).click();
  const proposal = page.getByRole("dialog", {
    name: "Foreslå at miljøet blir åpent",
  });
  await expect(
    proposal.getByText(/får 7 dager til å godta at miljøet blir åpent/),
  ).toBeVisible();
  await proposal
    .getByRole("button", { name: "Send forslaget til medlemmene" })
    .click();
  await expect(type.getByText("Foreslått: åpent miljø")).toBeVisible();

  // A member without a role finds no administration.
  const response = await kari.newPage().then((other) => other.goto(adminPage));
  expect(response?.status()).toBe(404);
  await kari.close();
  expect(problems).toEqual([]);
});

/**
 * PS-ENV-004: someone rejected and barred is still listed by name once the
 * application has ended, cannot be invited, and can apply again once an
 * administrator lifts the bar.
 */
test("a barred applicant stays listed until the bar is lifted", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Eva Eier");
  const word = uniqueWord();
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name: `Vellet ${word}`,
      type: "closed",
    })
  ).json();

  const ola = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(ola.request, undefined, "Ola Vest");
  await postCommand(page.request, "/api/social/friend-requests", {
    userId: await accountId(ola.request),
  });
  await postCommand(ola.request, "/api/social/friend-requests/accept", {
    userId: await accountId(page.request),
  });
  const apply = () =>
    ola.request.post("/api/environments/membership/join", {
      data: { environmentId, answers: [] },
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  expect((await apply()).ok()).toBe(true);

  await page.goto(`/miljoer/${environmentId}/administrer`);
  const applications = page.getByRole("region", { name: "Innmeldinger" });
  await applications
    .getByRole("group", { name: "Ola Vest" })
    .getByText("Flere valg")
    .click();
  await applications
    .getByRole("button", { name: "Avvis og steng ute", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Avvis og steng ute Ola Vest" })
    .getByRole("button", { name: "Avvis og steng ute Ola Vest" })
    .click();

  const barred = applications.getByRole("listitem").filter({
    hasText: "Ola Vest",
  });
  await expect(barred.getByText(/Kan ikke søke eller inviteres/)).toBeVisible();
  // A barred friend is not offered as someone to invite.
  await expect(
    applications.getByRole("option", { name: "Ola Vest" }),
  ).toHaveCount(0);
  expect((await apply()).status()).toBe(403);

  await barred.getByRole("button", { name: "Opphev utestengelsen" }).click();
  await expect(applications.getByText("Stengt ute fra nye forsøk")).toHaveCount(
    0,
  );
  expect((await apply()).ok()).toBe(true);
  await page.reload();
  await expect(
    applications.getByRole("button", { name: "Godkjenn Ola Vest" }),
  ).toBeVisible();

  // Bars from before the administrator came are lifted without the page
  // telling whether there were any (PS-ENV-009).
  await applications.getByText("Tidligere utestengelser").click();
  await applications
    .getByRole("button", { name: "Opphev utestengelser fra før du ble med" })
    .click();
  await page
    .getByRole("dialog", { name: "Opphev utestengelser fra før du ble med" })
    .getByRole("button", { name: "Opphev utestengelsene" })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Opphev utestengelser fra før du ble med",
    }),
  ).toBeHidden();
  await expect(
    applications.getByRole("button", { name: "Godkjenn Ola Vest" }),
  ).toBeVisible();
  await ola.close();
  expect(problems).toEqual([]);
});

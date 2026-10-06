import { expect, type Page, test } from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  today,
  uniqueWord,
} from "./helpers";

/** Confirms the consequence dialog `opener` opens (UX-INT-007). */
async function confirm(page: Page, opener: string, confirmLabel = opener) {
  await page.getByRole("button", { name: opener, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(dialog).toBeHidden();
}

/**
 * WP-82: the owners' page of a thing. One owner publishes it, sees a
 * request come in, invites a friend as co-owner, brings an earlier version
 * back and takes it out of the environment; the co-owner stops new loans,
 * which the first owner sees but cannot lift, and steps out again; at last
 * the thing is deleted (UX-JRN-011, PS-OBJ-006–013).
 */
test("the owners manage a thing from its page", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Anna Berg");
  const annaId = await accountId(page.request);
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
      availability: [{ start: today(), end: null }],
    })
  ).json();

  const bos = await browser.newContext({ baseURL: baseURL! });
  const bo = bos.request;
  await registerThroughApi(bo, undefined, "Bo Dahl");
  await postCommand(bo, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });
  await postCommand(bo, "/api/social/friend-requests", { userId: annaId });
  await postCommand(page.request, "/api/social/friend-requests/accept", {
    userId: await accountId(bo),
  });

  // Not published anywhere yet: only the owners see it.
  await page.goto(`/ting/${objectId}`);
  await expect(page.getByText("Ledig nå")).toBeVisible();
  await expect(
    page.getByText("Tingen er ikke publisert i noen miljøer."),
  ).toBeVisible();
  await page.getByLabel("Publiser i et miljø").selectOption(environmentId);
  await page.getByRole("button", { name: "Publiser i miljøet" }).click();
  await expect(page.getByText("Synlig for medlemmene")).toBeVisible();

  // A request through the environment shows up with what it asks of Anna.
  const preview = await (
    await bo.get(
      `/api/loan-requests/preview?objectId=${objectId}&environmentId=${environmentId}`,
    )
  ).json();
  await postCommand(bo, "/api/loan-requests", {
    objectId,
    origin: { kind: "environment", environmentId },
    start: { kind: "asap" },
    end: { kind: "duration", days: 2 },
    message: "Kan jeg låne den?",
    termsVersion: preview.termsVersion,
  });
  await page.reload();
  await expect(
    page.getByText(`Venter på deg: Svar på forespørselen om å låne Stige`),
  ).toBeVisible();

  // Anna invites Bo, a friend, who accepts.
  await page
    .getByLabel("Inviter en venn som medeier")
    .selectOption({ label: "Bo Dahl" });
  await page.getByRole("button", { name: "Inviter som medeier" }).click();
  await expect(page.getByText("har ikke svart ennå")).toBeVisible();
  const [invitation] = (await (await bo.get("/api/object-invitations")).json())
    .invitations;
  await postCommand(bo, "/api/object-invitations/accept", {
    invitationId: invitation.id,
  });

  // Bo stops every new loan; only Bo can lift it.
  const boPage = await bos.newPage();
  await boPage.goto(`/ting/${objectId}`);
  await expect(boPage.getByText("Dere er 2 eiere")).toBeVisible();
  await confirm(boPage, "Stans alle nye lån");
  await expect(boPage.getByText("Du har stanset alle nye lån.")).toBeVisible();
  await expect(
    boPage.getByRole("button", { name: "Opphev stansen" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByText("Bo Dahl har stanset alle nye lån."),
  ).toBeVisible();
  await expect(page.getByText("Bare Bo Dahl kan oppheve den.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Opphev stansen" }),
  ).toHaveCount(0);

  // Bo steps out again, and the restriction goes with them.
  await confirm(boPage, "Tre ut som eier");
  await expect(boPage).toHaveURL(/\/mine-ting$/);
  await page.reload();
  await expect(page.getByText("Ledig nå")).toBeVisible();

  // An edit, and the version before it brought back (PS-OBJ-013).
  const { version } = await (
    await page.request.get(`/api/objects/${objectId}`)
  ).json();
  await page.request.patch(`/api/objects/${objectId}`, {
    data: { expectedVersion: version, title: `Lang stige ${word}` },
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  await page.reload();
  await page.getByText("Versjonshistorikk", { exact: true }).last().click();
  await confirm(page, "Hent tilbake", `Hent tilbake versjon ${version}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Stige ${word}`,
  );

  // Taken out of the environment, with the reason said.
  await confirm(page, "Trekk tilbake", `Trekk tilbake fra Gården ${word}`);
  await expect(page.getByText("Trukket tilbake av en eier")).toBeVisible();

  // Anna, the only owner again, deletes it.
  await page.getByText("Flere valg").click();
  await confirm(page, "Slett tingen", `Slett Stige ${word}`);
  await expect(page).toHaveURL(/\/mine-ting$/);
  await expect(page.getByRole("link", { name: `Stige ${word}` })).toHaveCount(
    0,
  );

  await bos.close();
  expect(problems).toEqual([]);
});

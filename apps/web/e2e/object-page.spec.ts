import { expect, test } from "@playwright/test";
import {
  accountId,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  today,
  uniqueWord,
  untilOutboxSettles,
} from "./helpers";

/**
 * WP-80: a thing's own page. Its owner reaches it from Mine ting; a member
 * finds it in Finn and sees it through the environment, with the owner
 * named and linked (PS-ENV-015, WP-89); anyone else sees nothing, like a
 * thing that does not exist (PS-NFR-002).
 */
test("a thing has one page, seen by its owner or through an environment", async ({
  browser,
  page,
  baseURL,
}) => {
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
  await postCommand(page.request, `/api/objects/${objectId}/publications`, {
    environmentId,
  });

  // Mine ting says where each thing is shown (PS-OBJ-006).
  await page.goto("/mine-ting");
  const card = page.getByRole("listitem").filter({ hasText: `Stige ${word}` });
  await expect(card).toContainText(`Vises i: Gården ${word}`);
  await expect(card).toContainText("Kan lånes ut");
  await card.getByRole("link", { name: `Stige ${word}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Stige ${word}`,
  );
  await expect(page.getByText("Ledig nå")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mine ting" }).first(),
  ).toBeVisible();

  const members = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(members.request, undefined, "Bo Dahl");
  await postCommand(members.request, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });
  await untilOutboxSettles(members.request, async () => {
    const { objects } = await (
      await members.request.get(`/api/search/objects?q=${word}`)
    ).json();
    return objects.length > 0;
  });
  const member = await members.newPage();
  await member.goto(`/finn?q=${word}`);
  await expect(member.getByText("Eier: Anna Berg")).toBeVisible();
  await expect(member.getByRole("link", { name: "Anna Berg" })).toHaveAttribute(
    "href",
    `/personer/${annaId}?rolle=utlaaner`,
  );
  await member.getByRole("link", { name: `Stige ${word}` }).click();
  await expect(member).toHaveURL(new RegExp(`/ting/${objectId}\\?miljo=`));
  // Where it is seen and why, the week ahead and the terms before the
  // request (UX-IA-015, Tomat kjerneflyt 1).
  await expect(member.getByText(`Via Gården ${word}`)).toBeVisible();
  await expect(
    member.getByText(`Du ser tingen fordi du er medlem i Gården ${word}.`),
  ).toBeVisible();
  const week = member.getByRole("list", { name: "De neste dagene" });
  await expect(week.getByRole("listitem")).toHaveCount(7);
  await expect(week.getByRole("listitem").first()).toContainText(": ledig");
  await expect(member.getByText("Fylte dager er ledige.")).toBeVisible();
  await expect(
    member.getByRole("heading", { name: "Vilkår fra Anna Berg" }),
  ).toBeVisible();
  await expect(member.getByText("Ingen egne vilkår")).toBeVisible();
  await expect(member.getByText("Aluminiumsstige, 4 meter.")).toBeVisible();
  await member.getByRole("link", { name: "Anna Berg" }).click();
  await expect(member.getByRole("heading", { level: 1 })).toHaveText(
    "Anna Berg",
  );

  // Without the environment, Bo has no way to it: they are not friends.
  const direct = await member.goto(`/ting/${objectId}`);
  expect(direct?.status()).toBe(404);
  await members.close();
  expect(problems).toEqual([]);
});

test("Mine ting keeps archived things apart and private ones marked", async ({
  page,
}) => {
  await registerThroughApi(page.request);
  const word = uniqueWord();
  const thing = async (title: string) =>
    (
      await (
        await postCommand(page.request, "/api/objects", {
          title,
          categoryId: "annet",
          description: "Til utlån.",
          availability: [{ start: today(), end: null }],
        })
      ).json()
    ).objectId as string;
  await thing(`Drill ${word}`);
  const old = await thing(`Sag ${word}`);
  await postCommand(page.request, `/api/objects/${old}/archive`, {});

  await page.goto("/mine-ting");
  const current = page
    .getByRole("listitem")
    .filter({ hasText: `Drill ${word}` });
  await expect(current).toContainText("Bare synlig for deg");
  await expect(page.getByRole("link", { name: `Sag ${word}` })).toBeHidden();
  await page.getByText("Arkiverte ting (1)").click();
  await expect(
    page
      .getByRole("list", { name: "Arkiverte ting" })
      .getByRole("link", { name: `Sag ${word}` }),
  ).toBeVisible();
});

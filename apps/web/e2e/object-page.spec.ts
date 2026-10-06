import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  today,
  uniqueWord,
  untilOutboxSettles,
} from "./helpers";

/**
 * WP-80: a thing's own page. Its owner reaches it from Mine ting; a member
 * finds it in Finn and sees it through the environment; anyone else sees
 * nothing, like a thing that does not exist (PS-NFR-002).
 */
test("a thing has one page, seen by its owner or through an environment", async ({
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
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await postCommand(page.request, `/api/objects/${objectId}/publications`, {
    environmentId,
  });

  await page.goto("/mine-ting");
  await page.getByRole("link", { name: `Stige ${word}` }).click();
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
  await member.getByRole("link", { name: `Stige ${word}` }).click();
  await expect(member).toHaveURL(new RegExp(`/ting/${objectId}\\?miljo=`));
  await expect(member.getByText(`Gården ${word}`)).toBeVisible();
  await expect(member.getByText("Aluminiumsstige, 4 meter.")).toBeVisible();

  // Without the environment, Bo has no way to it: they are not friends.
  const direct = await member.goto(`/ting/${objectId}`);
  expect(direct?.status()).toBe(404);
  await members.close();
  expect(problems).toEqual([]);
});

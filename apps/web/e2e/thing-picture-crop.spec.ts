import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import {
  axeViolations,
  collectBrowserProblems,
  registerThroughApi,
  uniqueWord,
} from "./helpers";

/**
 * The square a thing's main picture is shown in (PS-OBJ-002), in a real
 * browser: the owner chooses it as for a profile picture, every square
 * place shows it, and it can be changed later without a new photo.
 */

/** A landscape photo: green on the left, red on the right. */
const photo = () =>
  sharp({
    create: { width: 800, height: 600, channels: 3, background: "#2a8a3a" },
  })
    .composite([
      {
        input: {
          create: {
            width: 400,
            height: 600,
            channels: 3,
            background: "#c0392b",
          },
        },
        left: 400,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

const objectOf = async (page: Page, objectId: string) =>
  (await page.request.get(`/api/objects/${objectId}`)).json();

/** Where the card's picture lies within its square, as shares of it. */
const placed = (page: Page, title: string) =>
  page
    .getByRole("listitem")
    .filter({ hasText: title })
    .locator("img")
    .evaluate((image: HTMLImageElement) => {
      const box = image.parentElement!.getBoundingClientRect();
      const shown = image.getBoundingClientRect();

      return {
        left: (shown.left - box.left) / box.width,
        width: shown.width / box.width,
      };
    });

test("the owner chooses the main picture's square, and changes it later", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Anna Berg");
  const title = `Stige ${uniqueWord()}`;

  await page.goto("/ting/ny");
  await page.getByLabel("Navn").fill(title);
  await page.getByLabel("Kategori").selectOption({ label: "Verktøy" });
  await page.getByLabel("Beskrivelse").fill("Aluminiumsstige, 4 meter.");
  await page.getByLabel("Legg til bilder").setInputFiles({
    name: "stige.png",
    mimeType: "image/png",
    buffer: await photo(),
  });
  await expect(page.getByRole("img", { name: "Bilde 1" })).toBeVisible();

  // The square is placed as a profile picture is, without turning it.
  await page.getByRole("button", { name: "Velg utsnitt" }).click();
  const stage = page.getByRole("img", { name: "Utsnitt av bildet" });
  await expect(stage).toBeVisible();
  await expect(page.getByLabel(/Rotasjon/)).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
  await stage.focus();
  // Moving the photo right brings its left edge into the frame.
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("Shift+ArrowRight");
  }
  await page.getByRole("button", { name: "Bruk utsnittet" }).click();
  await expect(page.getByRole("img", { name: "Bilde 1" })).toBeVisible();

  await page.getByRole("button", { name: "Videre" }).click();
  await page.getByRole("button", { name: "Videre" }).click();
  await page.getByRole("button", { name: "Videre" }).click();
  await page.getByRole("button", { name: "Lagre uten å publisere" }).click();
  await expect(page).toHaveURL(/\/ting\/[0-9a-f-]+$/);
  const objectId = new URL(page.url()).pathname.split("/").pop()!;

  const [left] = (await objectOf(page, objectId)).images;
  expect(left).toMatchObject({ width: 800, height: 600 });
  expect(left.crop.x).toBeCloseTo(0);
  expect(left.crop.width).toBeCloseTo(0.75);
  expect(left.crop.height).toBeCloseTo(1);

  // Its card shows the left square: the picture starts at the card's edge.
  await page.goto("/mine-ting");
  const card = await placed(page, title);
  expect(card.left).toBeCloseTo(0, 2);
  expect(card.width).toBeCloseTo(4 / 3, 2);

  // Editing opens the saved square, and «Tilbakestill» goes to the middle.
  await page.goto(`/ting/${objectId}/rediger`);
  await page.getByRole("button", { name: "Velg utsnitt" }).click();
  await expect(stage).toBeVisible();
  await page.getByRole("button", { name: "Tilbakestill" }).click();
  await page.getByRole("button", { name: "Bruk utsnittet" }).click();
  await page.getByRole("button", { name: "Videre" }).click();
  await page.getByRole("button", { name: "Videre" }).click();
  await expect(page.getByText("Du endrer: bilder.")).toBeVisible();
  await page.getByRole("button", { name: "Lagre endringene" }).click();
  await expect(page).toHaveURL(new RegExp(`/ting/${objectId}$`));

  const [middle] = (await objectOf(page, objectId)).images;
  expect(middle.crop.x).toBeCloseTo(0.125);
  // The same photo: a square is no new picture or version.
  expect(middle.id).toBe(left.id);

  await page.goto("/mine-ting");
  expect((await placed(page, title)).left).toBeCloseTo(-1 / 6, 2);
  expect(problems).toEqual([]);
});

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import {
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
} from "./helpers";

/**
 * Phones hand over photos under names and types that say little about what
 * they hold (the Android picker calls every one `1000016385.jpg`). Each is
 * read and redrawn in the browser, so what is previewed is what is stored,
 * and what cannot be read is said plainly instead of a broken preview.
 */

const asPhone = (buffer: Buffer) => ({
  name: "1000016385.jpg",
  mimeType: "image/jpeg",
  buffer,
});

const plain = (width: number, height: number, channels: 3 | 4 = 3) =>
  sharp({
    create: {
      width,
      height,
      channels,
      background: { r: 70, g: 160, b: 110, alpha: 0.5 },
    },
  });

/** A large camera photo: noise compresses badly, so it is well over 4 MiB. */
const largePhoto = () => {
  const [width, height] = [3200, 2400];
  return sharp(randomBytes(width * height * 3), {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
};

/** A HEIC photo, which Chromium cannot decode: the server converts it. */
const heicPhoto = () =>
  readFile(
    new URL(
      "../../../packages/storage/src/fixtures/photo.heic",
      import.meta.url,
    ),
  );

/** The start of a HEIC photo, with nothing to decode after it. */
const brokenHeic = () => {
  const box = Buffer.alloc(24);
  box.writeUInt32BE(24, 0);
  box.write("ftypheic\0\0\0\0mif1heic", 4, "latin1");
  return Buffer.concat([box, Buffer.alloc(2_000, 1)]);
};

test("photos whose name and type mislead are redrawn upright, or refused with a reason", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request);
  const { objectId } = await (
    await postCommand(page.request, "/api/objects", {
      title: "Varebil",
      categoryId: "verktoy",
      description: "Hvit varebil.",
    })
  ).json();
  await page.goto(`/ting/${objectId}/rediger`);
  const problem = page.getByRole("alert").filter({ hasText: "bilde" });

  // Neither a broken HEIC photo nor a text file shows as a broken preview.
  await page
    .getByLabel("Legg til bilder")
    .setInputFiles([
      asPhone(brokenHeic()),
      asPhone(Buffer.from("not a photo")),
    ]);
  await expect(problem).toHaveText(
    "Ett bilde er i HEIC-format, som denne nettleseren ikke kan åpne. Lagre det som JPEG og velg det på nytt. Ett bilde kunne ikke åpnes. Velg det på nytt, eller velg et bilde i JPEG, PNG eller WebP.",
  );
  await expect(page.getByRole("img", { name: "Bilde 1" })).toHaveCount(0);

  const large = await largePhoto();
  expect(large.length).toBeGreaterThan(4 * 1024 * 1024);
  await page.getByLabel("Legg til bilder").setInputFiles([
    // A HEIC photo, a transparent PNG and a progressive CMYK JPEG, as `.jpg`.
    asPhone(await heicPhoto()),
    asPhone(await plain(800, 600, 4).png().toBuffer()),
    asPhone(
      await plain(800, 600)
        .toColourspace("cmyk")
        .jpeg({ progressive: true })
        .toBuffer(),
    ),
    // Taken sideways: stored as the camera says it is held.
    asPhone(
      await plain(600, 400).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
    ),
    asPhone(large),
  ]);
  for (const index of [1, 2, 3, 4, 5]) {
    const preview = page.getByRole("img", { name: `Bilde ${index}` });
    await expect(preview).toBeVisible();
    expect(
      await preview.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);
  }
  await expect(problem).toHaveCount(0);

  await page.getByRole("button", { name: "Videre" }).click();
  await page.getByRole("button", { name: "Videre" }).click();
  await page.getByRole("button", { name: "Lagre endringene" }).click();
  await expect(page).toHaveURL(new RegExp(`/ting/${objectId}$`));
  const { images } = await (
    await page.request.get(`/api/objects/${objectId}`)
  ).json();
  expect(
    images.map(({ width, height }: { width: number; height: number }) => [
      width,
      height,
    ]),
  ).toEqual([
    [480, 320],
    [800, 600],
    [800, 600],
    [400, 600],
    [2048, 1536],
  ]);
  // The server answers the broken photo's conversion as invalid input.
  expect(problems.filter((problem) => !problem.includes("400"))).toEqual([]);
});

test("a profile picture is read the same way", async ({ page }) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request);
  await page.goto("/konto/profilbilde");
  const choose = page.getByLabel("Legg til profilbilde");

  await choose.setInputFiles(asPhone(brokenHeic()));
  await expect(page.getByText("Bildet er i HEIC-format")).toBeVisible();

  await choose.setInputFiles(asPhone(await heicPhoto()));
  await expect(
    page.getByRole("img", { name: "Utsnitt av bildet" }),
  ).toBeVisible();
  // The server answers the broken photo's conversion as invalid input.
  expect(problems.filter((problem) => !problem.includes("400"))).toEqual([]);
});

import { expect, test } from "@playwright/test";
import sharp from "sharp";
import {
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  today,
  uniqueWord,
} from "./helpers";

/** WP-81: one form to register and edit a thing, wherever the user starts. */

const photo = () =>
  sharp({
    create: { width: 800, height: 600, channels: 3, background: "#4a7" },
  })
    .png()
    .toBuffer();

test("a thing is registered from an environment, with a photo, and published there", async ({
  page,
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

  await page.goto("/mine-ting");
  await expect(
    page.getByText("Du har ingen ting registrert ennå."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Registrer en ting" }),
  ).toHaveAttribute("href", "/ting/ny");

  // Started from the environment, which is chosen already.
  await page.goto(`/ting/ny?miljo=${environmentId}`);
  await expect(page.getByLabel(`Gården ${word}`)).toBeChecked();
  await page.getByLabel("Tittel").fill(`Stige ${word}`);
  await page.getByLabel("Kategori").selectOption({ label: "Verktøy" });
  await expect(
    page.getByText("Kan ikke lånes ut gjennom Lånbort"),
  ).toBeVisible();
  await page.getByLabel("Beskrivelse").fill("Aluminiumsstige, 4 meter.");
  await page.getByLabel("Legg til bilder").setInputFiles({
    name: "stige.png",
    mimeType: "image/png",
    buffer: await photo(),
  });
  await expect(page.getByRole("img", { name: "Bilde 1" })).toBeVisible();
  await expect(page.getByLabel("Fra")).toHaveValue(today());

  // Two periods that share days are pointed out before anything is sent.
  await page.getByRole("button", { name: "Legg til periode" }).click();
  await page.getByLabel("Fra").nth(1).fill("2099-01-01");
  await expect(
    page.getByRole("alert").filter({ hasText: "har dager felles" }),
  ).toHaveText(
    "Periodene 1 og 2 har dager felles. Slå dem sammen eller endre datoene.",
  );
  await page.getByRole("button", { name: "Fjern periode 2" }).click();
  await page.getByLabel("Vilkår for lån (valgfritt)").fill("Tørk den av.");
  await page.getByRole("button", { name: "Gå videre" }).click();

  const review = page.getByRole("region", {
    name: "Se over før du registrerer",
  });
  await expect(review.getByRole("heading")).toBeFocused();
  await expect(review).toContainText(`Gården ${word}`);
  await expect(review).toContainText("Tørk den av.");
  await review.getByRole("button", { name: "Registrer og publiser" }).click();

  await expect(page).toHaveURL(/\/ting\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Stige ${word}`,
  );
  const objectId = new URL(page.url()).pathname.split("/").pop()!;
  const object = await (
    await page.request.get(`/api/objects/${objectId}`)
  ).json();
  expect(object).toMatchObject({
    categoryId: "verktoy",
    loanTerms: "Tørk den av.",
    availability: [{ start: today(), end: null }],
    images: [{ width: 800, height: 600 }],
  });
  const { publications } = await (
    await page.request.get(`/api/objects/${objectId}/publications`)
  ).json();
  expect(publications).toMatchObject([
    { status: "active", environment: { id: environmentId } },
  ]);

  await page.goto("/mine-ting");
  const entry = page.getByRole("listitem").filter({ hasText: `Stige ${word}` });
  await expect(entry).toContainText("Kan lånes ut");
  expect(problems).toEqual([]);
});

test("editing shows what someone else saved in between before saving over it", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Anna Berg");
  const { objectId } = await (
    await postCommand(page.request, "/api/objects", {
      title: "Stige",
      categoryId: "verktoy",
      description: "Aluminiumsstige, 4 meter.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  const upload = await page.request.post(`/api/objects/${objectId}/images`, {
    data: await photo(),
    headers: {
      "content-type": "image/png",
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
  expect(upload.ok()).toBe(true);

  await page.goto(`/ting/${objectId}/rediger`);
  await expect(page.getByRole("img", { name: "Bilde 1" })).toBeVisible();
  await page.getByRole("button", { name: "Fjern bilde 1" }).click();
  await page.getByLabel("Vilkår for lån (valgfritt)").fill("Tørk den av.");
  await expect(
    page.getByText("godta de nye vilkårene", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Gå videre" }).click();
  await expect(
    page.getByText("Du endrer: vilkår for lån, bilder."),
  ).toBeVisible();

  // Meanwhile, the title is changed elsewhere.
  const { version } = await (
    await page.request.get(`/api/objects/${objectId}`)
  ).json();
  const other = await page.request.patch(`/api/objects/${objectId}`, {
    data: { expectedVersion: version, title: "Lang stige" },
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  expect(other.ok()).toBe(true);

  await page.getByRole("button", { name: "Lagre endringene" }).click();
  const newer = page.getByRole("alert").filter({
    hasText: "Noen andre har lagret tingen",
  });
  await expect(newer).toContainText("Lang stige");
  await newer
    .getByRole("button", { name: "Lagre mine endringer over" })
    .click();

  await expect(page).toHaveURL(new RegExp(`/ting/${objectId}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Lang stige",
  );
  expect(
    await (await page.request.get(`/api/objects/${objectId}`)).json(),
  ).toMatchObject({
    title: "Lang stige",
    loanTerms: "Tørk den av.",
    images: [],
  });
  // The refused save is the one expected failure.
  expect(
    problems.filter((problem) => !problem.includes("409 (Conflict)")),
  ).toEqual([]);
});

test("someone who does not own a thing has no page to edit it", async ({
  page,
  playwright,
  baseURL,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(owner);
  const { objectId } = await (
    await postCommand(owner, "/api/objects", {
      title: "Sykkel",
      categoryId: "annet",
      description: "Bysykkel.",
    })
  ).json();
  await registerThroughApi(page.request);

  expect((await page.goto(`/ting/${objectId}/rediger`))?.status()).toBe(404);
  await owner.dispose();
});

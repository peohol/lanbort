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
  await expect(page.getByText("Du har ingen ting ennå.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Registrer en ting" }),
  ).toHaveAttribute("href", "/ting/ny");

  // Started from the environment, the same steps: about the thing first.
  await page.goto(`/ting/ny?miljo=${environmentId}`);
  await expect(page.getByText("Steg 1 av 4")).toBeVisible();
  await page.getByLabel("Navn").fill(`Stige ${word}`);
  await page.getByLabel("Kategori").selectOption({ label: "Verktøy" });
  await page.getByText("Noen ting kan ikke lånes ut her. Se hvilke").click();
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
  await page.getByRole("button", { name: "Videre" }).click();

  // When: any time from today unless the user gives periods.
  await expect(
    page.getByRole("heading", { level: 1, name: "Når kan den lånes?" }),
  ).toBeFocused();
  await expect(page.getByLabel("Når som helst")).toBeChecked();
  await page.getByLabel("Bare i bestemte perioder").check();
  await page.getByLabel("Fra", { exact: true }).fill("2099-01-01");
  // Two periods that share days are pointed out before anything is sent.
  await page.getByRole("button", { name: "Legg til periode" }).click();
  await page.getByLabel("Fra", { exact: true }).nth(1).fill("2099-02-01");
  await expect(
    page.getByRole("alert").filter({ hasText: "har dager felles" }),
  ).toHaveText(
    "Periodene 1 og 2 har dager felles. Slå dem sammen eller endre datoene.",
  );
  await page.getByLabel("Når som helst").check();
  await page.getByLabel("Vilkår for lånet (valgfritt)").fill("Tørk den av.");
  await page.getByRole("button", { name: "Videre" }).click();

  // Who: the environment it was started from, and friends when chosen.
  await expect(page.getByLabel(`Gården ${word}`)).toBeChecked();
  await expect(page.getByText("Valgt fordi du startet her.")).toBeVisible();
  await expect(page.getByLabel("Venner", { exact: true })).not.toBeChecked();
  await page.getByLabel("Venner", { exact: true }).check();
  await page.getByRole("button", { name: "Videre" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Se over og publiser" }),
  ).toBeFocused();
  await expect(page.getByRole("region", { name: "Om tingen" })).toContainText(
    `Stige ${word}`,
  );
  const when = page.getByRole("region", { name: "Når og vilkår" });
  await expect(when).toContainText("Når som helst, fra ");
  await expect(when).toContainText("Tørk den av.");
  await expect(
    page.getByRole("region", { name: "Hvem kan låne" }),
  ).toContainText(`Gården ${word}Publiseres`);
  await page
    .getByRole("button", { name: `Publiser i Gården ${word} og for venner` })
    .click();

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
  const shown = await (
    await page.request.get(`/api/objects/${objectId}/publications`)
  ).json();
  expect(shown.publications).toMatchObject([
    { status: "active", environment: { id: environmentId } },
  ]);
  expect(shown.friends).not.toBeNull();

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
  await page.getByRole("button", { name: "Videre" }).click();
  await page.getByLabel("Vilkår for lånet (valgfritt)").fill("Tørk den av.");
  await expect(
    page.getByText("godta de nye vilkårene", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Videre" }).click();
  await expect(
    page.getByText("Du endrer: vilkår for lånet, bilder."),
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

test("photos alone are not saved over a version the user has not seen", async ({
  page,
}) => {
  await registerThroughApi(page.request);
  const { objectId, version } = await (
    await postCommand(page.request, "/api/objects", {
      title: "Stige",
      categoryId: "verktoy",
      description: "Aluminiumsstige, 4 meter.",
    })
  ).json();

  await page.goto(`/ting/${objectId}/rediger`);
  await page.getByLabel("Legg til bilder").setInputFiles({
    name: "stige.png",
    mimeType: "image/png",
    buffer: await photo(),
  });
  // A thing with no periods can be saved as before; nobody can borrow it yet.
  await page.getByRole("button", { name: "Videre" }).click();
  await expect(page.getByLabel("Bare i bestemte perioder")).toBeChecked();
  await page.getByRole("button", { name: "Videre" }).click();
  await expect(
    page.getByText(
      "Ingen perioder. Den kan ikke lånes ut før du legger inn en.",
    ),
  ).toBeVisible();
  const other = await page.request.patch(`/api/objects/${objectId}`, {
    data: { expectedVersion: version, description: "Kort stige." },
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  expect(other.ok()).toBe(true);

  await page.getByRole("button", { name: "Lagre endringene" }).click();
  const newer = page.getByRole("alert").filter({
    hasText: "Noen andre har lagret tingen",
  });
  await expect(newer).toContainText("Kort stige.");
  expect(
    (await (await page.request.get(`/api/objects/${objectId}`)).json()).images,
  ).toEqual([]);

  await newer
    .getByRole("button", { name: "Lagre mine endringer over" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/ting/${objectId}$`));
  expect(
    await (await page.request.get(`/api/objects/${objectId}`)).json(),
  ).toMatchObject({ description: "Kort stige.", images: [{ width: 800 }] });
});

test("a thing can be saved without publishing, and «Avbryt» asks before anything is lost", async ({
  page,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request);

  await page.goto("/ting/ny");
  await page.getByLabel("Navn").fill("Sag");
  await page.getByRole("link", { name: "Avbryt" }).click();
  const discard = page.getByRole("dialog", { name: "Forkaste Sag?" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Fortsett å registrere" }).click();
  await expect(page.getByLabel("Navn")).toHaveValue("Sag");

  await page.getByLabel("Kategori").selectOption({ label: "Verktøy" });
  await page.getByLabel("Beskrivelse").fill("Fintannet håndsag.");
  await page.getByRole("button", { name: "Videre" }).click();
  await page.getByRole("button", { name: "Videre" }).click();
  await expect(
    page.getByText("Du er ikke med i noen miljøer ennå."),
  ).toBeVisible();
  await page.getByLabel("Venner", { exact: true }).check();
  await page.getByRole("button", { name: "Videre" }).click();
  await expect(
    page.getByRole("button", { name: "Publiser for venner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lagre uten å publisere" }).click();

  await expect(page).toHaveURL(/\/ting\/[0-9a-f-]+$/);
  const objectId = new URL(page.url()).pathname.split("/").pop()!;
  expect(
    await (
      await page.request.get(`/api/objects/${objectId}/publications`)
    ).json(),
  ).toMatchObject({ publications: [], friends: null });

  // Leaving with nothing changed asks nothing.
  await page.goto(`/ting/${objectId}/rediger`);
  await page.getByRole("link", { name: "Avbryt" }).click();
  await expect(page).toHaveURL(new RegExp(`/ting/${objectId}$`));

  // Leaving with a change asks first, and «Forkast» leaves it as it was.
  await page.goto("/ting/ny");
  await page.getByLabel("Navn").fill("Hammer");
  await page.getByRole("link", { name: "Avbryt" }).click();
  await page
    .getByRole("dialog", { name: "Forkaste Hammer?" })
    .getByRole("button", { name: "Forkast" })
    .click();
  await expect(page).toHaveURL(/\/mine-ting$/);
  await expect(page.getByText("Hammer")).toHaveCount(0);
  expect(problems).toEqual([]);
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

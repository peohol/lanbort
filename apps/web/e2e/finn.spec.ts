import { randomBytes, randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  registerThroughApi,
  untilOutboxSettles,
} from "./helpers";

/** WP-61 in a browser: Finn searches things and environments to join. */

const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` };
const idempotent = () => ({ "Idempotency-Key": randomUUID() });

/** A word no other test uses, so the shared database cannot interfere. */
const word = () =>
  Array.from(randomBytes(12), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");

async function post(request: APIRequestContext, path: string, data: object) {
  const response = await request.post(path, { data, headers: idempotent() });
  expect(response.status()).toBe(200);
  return response.json();
}

/** Runs the outbox job until the search index has caught up with `q`. */
async function untilIndexed(request: APIRequestContext, q: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await request.get("/api/internal/outbox", { headers: cron });
    const { environments } = await (
      await request.get(`/api/search/environments?q=${q}`)
    ).json();

    if (environments.length > 0) return;
  }

  throw new Error("The search index never caught up");
}

test("Finn finds environments to join, and then the things in them", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  const place = word();
  const thing = word();

  const owner = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(owner, undefined, "Eva Eier");
  const { environmentId } = await post(owner, "/api/environments", {
    name: `Nabolaget ${place}`,
    type: "open",
    location: "Grünerløkka",
  });
  const { objectId } = await post(owner, "/api/objects", {
    title: `Kantklipper ${thing}`,
    categoryId: "annet",
    description: "Batteridrevet, med ekstra snor.",
    availability: [{ start: "2030-06-01", end: "2030-08-31" }],
  });
  await post(owner, `/api/objects/${objectId}/publications`, {
    environmentId,
  });
  await untilIndexed(owner, place);

  await registerThroughApi(page.request, undefined, "Kari Nordmann");
  await page.goto("/finn");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Finn");
  await expect(
    page.getByText("Søk etter ting i miljøene du er medlem av"),
  ).toBeVisible();

  // Things are found only in the user's own environments.
  await page.getByLabel("Hva leter du etter?").fill(thing);
  await page.getByRole("button", { name: "Søk" }).click();
  await expect(
    page.getByText("Ingen ting i miljøene dine passer med søket."),
  ).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Hva du leter etter" });
  await tabs.getByRole("link", { name: "Miljøer" }).click();
  await expect(tabs.getByRole("link", { name: "Miljøer" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByLabel("Navn, sted eller hva miljøet handler om").fill(place);
  await page.getByRole("button", { name: "Søk" }).click();
  const found = page
    .getByRole("region", { name: "Treff" })
    .getByRole("listitem");
  await expect(found).toHaveCount(1);
  await expect(found).toContainText(`Nabolaget ${place}`);
  await expect(found).toContainText("Åpent miljø – alle kan bli med");
  await expect(found).toContainText("Grünerløkka");

  await post(page.request, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });
  await page.reload();
  await expect(found).toContainText("Du er medlem");
  // The thing's own index entry may come later in the outbox than the
  // environment's.
  await untilOutboxSettles(
    page.request,
    async () =>
      (await (await page.request.get(`/api/search/objects?q=${thing}`)).json())
        .objects.length > 0,
  );

  await tabs.getByRole("link", { name: "Ting" }).click();
  await page.getByLabel("Hva leter du etter?").fill(thing);
  await page.getByRole("button", { name: "Søk" }).click();
  const thingFound = page
    .getByRole("region", { name: "Treff" })
    .getByRole("listitem");
  await expect(thingFound).toHaveCount(1);
  await expect(thingFound).toContainText(`Kantklipper ${thing}`);
  await expect(thingFound).toContainText(`I Nabolaget ${place}`);
  await expect(thingFound).toContainText("Ledig fra");
  expect(problems).toEqual([]);
});

/** A centre nobody else's test uses, about a kilometre precise. */
const somewhere = () => ({
  latitude: Math.round((Math.random() * 120 - 60) * 100) / 100,
  longitude: Math.round((Math.random() * 340 - 170) * 100) / 100,
});

/** A blank map tile, so the test never depends on the map provider. */
const blankTile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("Finn finds environments near a place and shows their areas (WP-62)", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await page.route("https://cache.kartverket.no/**", (route) =>
    route.fulfill({ contentType: "image/png", body: blankTile }),
  );
  const name = word();
  const centre = somewhere();
  const owner = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(owner, undefined, "Eva Eier");
  await post(owner, "/api/environments", {
    name: `Nær ${name}`,
    type: "open",
    area: { ...centre, radiusKm: 2 },
  });
  await post(owner, "/api/environments", {
    name: `Fjern ${name}`,
    type: "open",
    area: { ...centre, latitude: centre.latitude + 0.5, radiusKm: 2 },
  });
  await untilIndexed(owner, name);

  await registerThroughApi(page.request);
  const point = `${centre.latitude},${centre.longitude}`;
  await page.goto(
    `/finn?vis=miljoer&sted=Torget&avstand=5&punkt=${point}&punktsted=Torget`,
  );
  await expect(page.getByLabel("Sted", { exact: true })).toHaveValue("Torget");
  await expect(page.getByLabel("Avstand")).toHaveValue("5");
  const results = page.getByRole("region", { name: "Treff" });
  await expect(results).toContainText("Nær Torget, innen 5 km.");
  await expect(results.getByRole("listitem")).toContainText([`Nær ${name}`]);
  await expect(results).not.toContainText(`Fjern ${name}`);

  // A new place typed in is looked up afresh, not the point chosen before.
  await page.getByLabel("Sted", { exact: true }).fill("");
  await page.getByLabel("Navn, sted eller hva miljøet handler om").fill(name);
  await page.getByRole("button", { name: "Søk" }).click();
  await expect(results.getByRole("listitem")).toHaveCount(2);
  await expect(results).not.toContainText("Nær Torget");
  expect(problems).toEqual([]);
});

test("Finn explains what to change instead of searching", async ({ page }) => {
  await registerThroughApi(page.request);
  await page.goto("/finn?q=d");
  await expect(page.getByText("Skriv minst to tegn.")).toHaveAttribute(
    "role",
    "alert",
  );

  await page.goto("/finn?q=drill&fra=2030-06-02&til=2030-06-01");
  await expect(page.getByText(/første og siste dag/)).toHaveAttribute(
    "role",
    "alert",
  );

  await page.goto("/finn?vis=miljoer&punkt=91,10&punktsted=");
  await expect(page.getByText("Velg stedet på nytt.")).toHaveAttribute(
    "role",
    "alert",
  );
});

test("search needs a signed-in user", async ({ request }) => {
  for (const path of [
    "/api/search/objects?q=drill",
    "/api/search/environments?q=drill",
  ]) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

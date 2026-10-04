import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  accountId,
  axeViolations,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  signInThroughApi,
} from "./helpers";

/**
 * WP-43 in the browser: private chat encrypted on the device (ADR-0010).
 * Two friends turn chat on, write to each other, and one of them links a
 * second device with the code it shows. The server only ever relays
 * ciphertext; what the pages show was decrypted in the browser.
 */

test.describe.configure({ mode: "serial" });

const baseURL = () => test.info().project.use.baseURL!;

async function device(browser: Browser) {
  const context = await browser.newContext({ baseURL: baseURL() });
  const page = await context.newPage();
  return { context, page, problems: collectBrowserProblems(page) };
}

async function person(browser: Browser, name: string) {
  const opened = await device(browser);
  const email = await registerThroughApi(
    opened.context.request,
    undefined,
    name,
  );
  return { ...opened, email, id: await accountId(opened.context.request) };
}

async function turnOnChat(page: Page) {
  await page.goto("/samtaler");
  await page.getByRole("button", { name: "Slå på privat chat" }).click();
  await expect(
    page.getByRole("heading", { name: "Dine samtaler" }),
  ).toBeVisible();
}

/** Messages arrive with the next sync; a reload asks at once. */
async function expectMessage(page: Page, text: string) {
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(text)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
}

test("two friends chat end to end, and a new device is linked with its code", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const anna = await person(browser, "Anna Berg");
  const bo = await person(browser, "Bo Dahl");
  await postCommand(anna.context.request, "/api/social/friend-requests", {
    userId: bo.id,
  });
  await postCommand(bo.context.request, "/api/social/friend-requests/accept", {
    userId: anna.id,
  });

  await turnOnChat(anna.page);
  await turnOnChat(bo.page);

  // Anna starts the conversation with her friend and writes.
  await anna.page.reload();
  await anna.page.getByRole("button", { name: "Start samtale" }).click();
  await expect(
    anna.page.getByRole("heading", { level: 1, name: "Bo Dahl" }),
  ).toBeVisible();
  const conversation = anna.page.url();
  await anna.page.getByLabel("Ny melding").fill("Hei Bo, kan jeg låne stigen?");
  await anna.page.getByRole("button", { name: "Send" }).click();
  await expect(
    anna.page.getByText("Hei Bo, kan jeg låne stigen?"),
  ).toBeVisible();

  // Bo reads it on his device and answers.
  await bo.page.goto("/samtaler");
  await bo.page.getByRole("link", { name: "Anna Berg" }).click();
  await expect(bo.page).toHaveURL(conversation);
  await expectMessage(bo.page, "Hei Bo, kan jeg låne stigen?");
  await bo.page.getByLabel("Ny melding").fill("Ja, den står i boden.");
  await bo.page.getByRole("button", { name: "Send" }).click();
  await expectMessage(anna.page, "Ja, den står i boden.");

  expect(await axeViolations(anna.page)).toEqual([]);

  // Both see the same security code.
  const securityCode = async (page: Page, name: string) => {
    await page.getByText(`Sikkerhetskode med ${name}`).click();
    return page.locator(".security-code").getAttribute("aria-label");
  };
  expect(await securityCode(anna.page, "Bo Dahl")).toBe(
    await securityCode(bo.page, "Anna Berg"),
  );

  // Anna signs in on a second device: it needs her first device's approval.
  const laptop = await device(browser);
  await signInThroughApi(laptop.context.request, anna.email);
  await laptop.page.goto("/samtaler");
  await laptop.page
    .getByRole("link", { name: "Koble til denne enheten" })
    .click();
  await laptop.page.getByRole("button", { name: "Vis koden" }).click();
  const code = (await laptop.page.locator(".link-code").textContent())!;
  expect(await axeViolations(laptop.page)).toEqual([]);
  expect(code.replace(/\s/g, "").length).toBeGreaterThan(8);

  await anna.page.goto("/samtaler/enheter");
  await expect(
    anna.page.getByRole("heading", { name: "Mine enheter" }),
  ).toBeVisible();
  expect(await axeViolations(anna.page)).toEqual([]);
  await anna.page.getByRole("link", { name: "Godkjenn en ny enhet" }).click();
  await expect(anna.page).toHaveURL(/\/samtaler\/enheter\/koble$/);
  await anna.page.getByLabel("Kode fra den nye enheten").fill(code);
  await anna.page.getByRole("button", { name: "Finn enheten" }).click();
  await anna.page.getByRole("button", { name: "Godkjenn enheten" }).click();
  await expect(
    anna.page.getByText("Enheten er godkjent.").first(),
  ).toBeVisible();

  await expect(
    laptop.page.getByRole("heading", { name: "Dine samtaler" }),
  ).toBeVisible({ timeout: 20_000 });

  // Anna's phone adds the laptop to the conversation; Bo's next message
  // reaches both, but the laptop cannot read what was sent before.
  await anna.page.goto(conversation);
  await expect(anna.page.getByLabel("Ny melding")).toBeVisible();
  await expect(async () => {
    await laptop.page.goto(conversation);
    await expect(laptop.page.getByLabel("Ny melding")).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 45_000 });
  await expect(
    laptop.page.getByText("Hei Bo, kan jeg låne stigen?"),
  ).toHaveCount(0);
  await bo.page.getByLabel("Ny melding").fill("Hent den når du vil.");
  await bo.page.getByRole("button", { name: "Send" }).click();
  await expectMessage(laptop.page, "Hent den når du vil.");
  await expectMessage(anna.page, "Hent den når du vil.");

  for (const someone of [anna, bo, laptop]) {
    // A message encrypted before a device joined is refused and sent again
    // under the group's new keys; the browser logs the refusal.
    expect(
      someone.problems.filter((problem) => !problem.includes("409 (Conflict)")),
    ).toEqual([]);
    await someone.context.close();
  }
});

test("a message waits until the friend has turned chat on", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const anna = await person(browser, "Dag Fjeld");
  const bo = await person(browser, "Eli Gran");
  await postCommand(anna.context.request, "/api/social/friend-requests", {
    userId: bo.id,
  });
  await postCommand(bo.context.request, "/api/social/friend-requests/accept", {
    userId: anna.id,
  });

  await turnOnChat(anna.page);
  await anna.page.reload();
  await anna.page.getByRole("button", { name: "Start samtale" }).click();
  await anna.page.getByLabel("Ny melding").fill("Er du der?");
  await anna.page.getByRole("button", { name: "Send" }).click();
  await expect(
    anna.page
      .getByRole("status")
      .filter({ hasText: "har slått på privat chat" }),
  ).toBeVisible();
  await expect(anna.page.getByText("ikke sendt ennå")).toBeVisible();

  // Once Eli turns chat on, Dag's device adds Eli's and sends the message.
  await turnOnChat(bo.page);
  await anna.page.reload();
  await expect(anna.page.getByText("ikke sendt ennå")).toHaveCount(0, {
    timeout: 30_000,
  });
  await bo.page.goto("/samtaler");
  await bo.page.getByRole("link", { name: "Dag Fjeld" }).click();
  await expect(bo.page).toHaveURL(/\/samtaler\/[0-9a-f-]+$/);
  await expectMessage(bo.page, "Er du der?");

  for (const someone of [anna, bo]) {
    expect(someone.problems).toEqual([]);
    await someone.context.close();
  }
});

test("chat pages get a strict script policy, and only the approval page may use the camera", async ({
  browser,
}) => {
  const someone = await person(browser, "Cia Eng");
  const headers = async (path: string) =>
    (await someone.context.request.get(path)).headers();

  const chat = await headers("/samtaler");
  const scripts = chat["content-security-policy"]!.split(";").find((part) =>
    part.trim().startsWith("script-src"),
  )!;
  expect(scripts).toMatch(/'nonce-[^']+'/);
  expect(scripts).not.toContain("unsafe-inline");
  expect(chat["permissions-policy"]).toContain("camera=()");
  expect(
    (await headers("/samtaler/enheter/koble"))["permissions-policy"],
  ).toContain("camera=(self)");
  expect((await headers("/samtaler/koble"))["permissions-policy"]).toContain(
    "camera=()",
  );
  // Each page load gets its own nonce.
  expect((await headers("/samtaler"))["content-security-policy"]).not.toBe(
    chat["content-security-policy"],
  );
  await someone.context.close();
});

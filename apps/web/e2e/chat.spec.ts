import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import {
  accountId,
  agreeLoan,
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

/** Turns chat on, and says «Ikke nå» to the recovery key (R1). */
async function turnOnChat(page: Page) {
  await page.goto("/samtaler");
  await page.getByRole("button", { name: "Slå på privat chat" }).click();
  await expect(
    page.getByRole("heading", { name: "Lag en gjenopprettingsnøkkel" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ikke nå" }).click();
  await expect(
    page.getByRole("heading", { name: "Dine samtaler" }),
  ).toBeVisible();
}

/** The conversation's messages, apart from the list beside them. */
const messages = (page: Page) =>
  page.getByRole("region", { name: "Meldinger" });

/** Messages arrive with the next sync; a reload asks at once. */
async function expectMessage(page: Page, text: string) {
  await expect(async () => {
    await page.reload();
    await expect(messages(page).getByText(text)).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 45_000 });
}

test("two friends chat end to end, and a new device is linked with its code", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const anna = await person(browser, "Anna Berg");
  const bo = await person(browser, "Bo Dahl");
  await postCommand(anna.context.request, "/api/social/friend-requests", {
    userId: bo.id,
  });
  await postCommand(bo.context.request, "/api/social/friend-requests/accept", {
    userId: anna.id,
  });
  // Bo lends Anna his ladder, which has a picture.
  const loanId = await agreeLoan(
    bo.context.request,
    anna.context.request,
    "Stige",
  );
  const { objectId } = await (
    await bo.context.request.get(`/api/loans/${loanId}`)
  ).json();
  const upload = await bo.context.request.post(
    `/api/objects/${objectId}/images`,
    {
      data: await sharp({
        create: { width: 40, height: 30, channels: 3, background: "#4a7" },
      })
        .jpeg()
        .toBuffer(),
      headers: {
        "content-type": "image/jpeg",
        "Idempotency-Key": randomUUID(),
      },
    },
  );
  expect(upload.ok(), await upload.text()).toBe(true);
  const { imageId } = await upload.json();

  await turnOnChat(anna.page);
  await turnOnChat(bo.page);

  // Anna starts the conversation with her friend and writes.
  await anna.page.reload();
  await anna.page.getByRole("button", { name: "Start samtale" }).click();
  await expect(
    anna.page.getByRole("heading", { level: 1, name: "Bo Dahl" }),
  ).toBeVisible();
  const conversation = anna.page.url();
  // The loan between them shows its thing's picture (PS-OBJ-021).
  const between = anna.page.getByRole("region", { name: /Lån mellom dere/ });
  await expect(
    between.getByRole("link", { name: /Stige/ }).locator("img"),
  ).toHaveAttribute("src", `/api/loans/${loanId}/images/${imageId}`);
  await anna.page.getByLabel("Ny melding").fill("Hei Bo, kan jeg låne stigen?");
  await anna.page.getByRole("button", { name: "Send" }).click();
  await expect(
    messages(anna.page).getByText("Hei Bo, kan jeg låne stigen?"),
  ).toBeVisible();

  // Bo reads it on his device and answers.
  await bo.page.goto("/samtaler");
  await bo.page.getByRole("link", { name: "Anna Berg" }).click();
  await expect(bo.page).toHaveURL(conversation);
  await expectMessage(bo.page, "Hei Bo, kan jeg låne stigen?");
  await bo.page.getByLabel("Ny melding").fill("Ja, den står i boden.");
  await bo.page.getByRole("button", { name: "Send" }).click();
  await expectMessage(anna.page, "Ja, den står i boden.");

  // «Skriv til» on a friend's page opens the conversation they have.
  await bo.page.goto(`/personer/${anna.id}`);
  await bo.page.getByRole("link", { name: "Skriv til Anna Berg" }).click();
  await expect(bo.page).toHaveURL(conversation);

  expect(await axeViolations(anna.page)).toEqual([]);

  // Both see the same security code, under «Om samtalen».
  const securityCode = async (page: Page) => {
    await page.getByRole("link", { name: "Om samtalen" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Om samtalen" }),
    ).toBeVisible();
    const code = await page
      .locator(".security-code")
      .getAttribute("aria-label");
    expect(await axeViolations(page)).toEqual([]);
    await page.goBack();
    return code;
  };
  expect(await securityCode(anna.page)).toBe(await securityCode(bo.page));

  // Bo mutes the conversation for himself, and chooses e-mail about new
  // messages under «Varslingsvalg» (PS-COM-018).
  await bo.page.getByRole("link", { name: "Om samtalen" }).click();
  await bo.page.getByRole("button", { name: "Demp samtalen" }).click();
  const unmute = bo.page.getByRole("button", { name: "Slå på varsler igjen" });
  await expect(unmute).toBeVisible();
  await bo.page.reload();
  await expect(unmute).toBeVisible();
  await bo.page.goto("/konto/varslingsvalg");
  const chatChoices = bo.page.getByRole("group", { name: "Privat chat" });
  await expect(chatChoices.getByLabel("Nye meldinger i appen")).toBeChecked();
  const email = chatChoices.getByLabel("Nye meldinger på e-post");
  await expect(email).not.toBeChecked();
  // The box is ticked before the choice is saved; reload only after that.
  const saved = bo.page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/notifications/preferences") &&
      response.ok(),
  );
  await email.check();
  await saved;
  await bo.page.reload();
  await expect(email).toBeChecked();
  await bo.page.goto(conversation);

  // Anna signs in on a second device: it needs her first device's approval.
  const laptop = await device(browser);
  await signInThroughApi(laptop.context.request, anna.email);
  await laptop.page.goto("/samtaler");
  await laptop.page
    .getByRole("link", { name: "Koble til denne enheten" })
    .click();
  // The page makes the code as soon as it opens (09).
  const code = (await laptop.page.locator("p.link-code").textContent())!;
  expect(await axeViolations(laptop.page)).toEqual([]);
  expect(code.replace(/\s/g, "").length).toBeGreaterThan(8);

  await anna.page.goto("/samtaler/enheter");
  await expect(
    anna.page.getByRole("heading", { name: "Mine enheter" }),
  ).toBeVisible();
  expect(await axeViolations(anna.page)).toEqual([]);
  // The waiting device is the task on top (10); the camera is not used here.
  await anna.page.getByRole("link", { name: /^Skriv inn koden/ }).click();
  await expect(anna.page).toHaveURL(/\/samtaler\/enheter\/koble\?kode$/);
  await anna.page.getByLabel("Kode fra den nye enheten").fill(code);
  await anna.page.getByRole("button", { name: "Fortsett" }).click();
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
    messages(laptop.page).getByText("Hei Bo, kan jeg låne stigen?"),
  ).toHaveCount(0);
  await bo.page.getByLabel("Ny melding").fill("Hent den når du vil.");
  await bo.page.getByRole("button", { name: "Send" }).click();
  await expectMessage(laptop.page, "Hent den når du vil.");
  await expectMessage(anna.page, "Hent den når du vil.");

  // Anna removes the laptop from her phone: it is shut out of chat.
  await anna.page.goto("/samtaler/enheter");
  await anna.page.getByRole("button", { name: "Fjern", exact: true }).click();
  const sheet = anna.page.getByRole("dialog");
  await expect(sheet.getByRole("heading")).toHaveText(/^Fjerne Enhet /);
  expect(await axeViolations(anna.page)).toEqual([]);
  await sheet.getByRole("button", { name: "Fjern enheten" }).click();
  await expect(
    anna.page.getByText("er logget ut og kan ikke lese nye meldinger"),
  ).toBeVisible();
  await expect(
    anna.page.getByRole("button", { name: "Fjern", exact: true }),
  ).toHaveCount(0);

  // A tablet gets the history from Anna's phone, when she chooses it (12).
  const tablet = await device(browser);
  await signInThroughApi(tablet.context.request, anna.email);
  await tablet.page.goto("/samtaler/koble");
  const tabletCode = (await tablet.page.locator("p.link-code").textContent())!;
  await anna.page.goto("/samtaler/enheter/koble?kode");
  await anna.page.getByLabel("Kode fra den nye enheten").fill(tabletCode);
  await anna.page.getByRole("button", { name: "Fortsett" }).click();
  await expect(anna.page.getByLabel("Bare nye meldinger")).toBeChecked();
  await anna.page.getByLabel("Overfør meldingene herfra").check();
  expect(await axeViolations(anna.page)).toEqual([]);
  await anna.page.getByRole("button", { name: "Godkjenn enheten" }).click();
  await expect(
    anna.page.getByText("Meldingene herfra er sendt kryptert til den."),
  ).toBeVisible();
  await expect(
    tablet.page.getByText("Meldingene fra den andre enheten er hentet hit."),
  ).toBeVisible({ timeout: 20_000 });
  await tablet.page.goto(conversation);
  await expect(
    messages(tablet.page).getByText("Hei Bo, kan jeg låne stigen?"),
  ).toBeVisible();
  await expect(
    messages(tablet.page).getByText("Hent den når du vil."),
  ).toBeVisible();

  for (const someone of [anna, bo, laptop, tablet]) {
    // A message encrypted before a device joined is refused and sent again
    // under the group's new keys; the browser logs the refusal.
    expect(
      someone.problems.filter((problem) => !problem.includes("409 (Conflict)")),
    ).toEqual([]);
    await someone.context.close();
  }
});

test("the recovery key brings chat and its backed-up messages back when every device is lost", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const anna = await person(browser, "Hanne Moe");
  const bo = await person(browser, "Jon Vik");
  await postCommand(anna.context.request, "/api/social/friend-requests", {
    userId: bo.id,
  });
  await postCommand(bo.context.request, "/api/social/friend-requests/accept", {
    userId: anna.id,
  });
  await turnOnChat(anna.page);
  await turnOnChat(bo.page);

  // Without a key, Mine enheter says what is at stake (PS-COM-019).
  await anna.page.goto("/samtaler/enheter");
  await expect(
    anna.page.getByRole("heading", { name: "Ingen gjenopprettingsnøkkel" }),
  ).toBeVisible();

  await anna.page.goto("/samtaler");
  await anna.page.getByRole("button", { name: "Start samtale" }).click();
  await expect(
    anna.page.getByRole("heading", { level: 1, name: "Jon Vik" }),
  ).toBeVisible();
  const conversation = anna.page.url();
  await anna.page.getByLabel("Ny melding").fill("Har du en drill?");
  await anna.page.getByRole("button", { name: "Send" }).click();
  await bo.page.goto(conversation);
  await expectMessage(bo.page, "Har du en drill?");
  await bo.page.getByLabel("Ny melding").fill("Ja, en god en.");
  await bo.page.getByRole("button", { name: "Send" }).click();
  await expectMessage(anna.page, "Ja, en god en.");

  // She said «Ikke nå», and has now written with someone: one reminder.
  await anna.page.goto("/samtaler");
  const reminder = anna.page.getByRole("region", {
    name: "Ta vare på meldingene dine",
  });
  await expect(reminder).toBeVisible();
  expect(await axeViolations(anna.page)).toEqual([]);
  await reminder
    .getByRole("link", { name: "Lag gjenopprettingsnøkkel" })
    .click();
  await anna.page
    .getByRole("button", { name: "Lag gjenopprettingsnøkkel" })
    .click();

  // The key is shown once; «Ferdig» waits for the box (R2).
  const shown = anna.page.getByLabel(/^Gjenopprettingsnøkkel: /);
  const key = (await shown.getAttribute("aria-label"))!.replace(
    "Gjenopprettingsnøkkel: ",
    "",
  );
  expect(key.split(" ")).toHaveLength(13);
  expect(await axeViolations(anna.page)).toEqual([]);
  const done = anna.page.getByRole("button", { name: "Ferdig" });
  await expect(done).toBeDisabled();
  await anna.page.getByLabel("Jeg har skrevet ned eller lagret nøkkelen").check();
  await done.click();
  await expect(
    anna.page.getByText("Gjenopprettingsnøkkelen er laget."),
  ).toBeVisible();
  await anna.page.getByRole("link", { name: "Tilbake til Mine enheter" }).click();
  await expect(anna.page.getByText("Lag en ny nøkkel")).toBeVisible();
  await anna.page.goto("/samtaler");
  await expect(reminder).toHaveCount(0);
  // The first backup follows the key; wait until the server has it.
  await expect(async () => {
    const devices = await (
      await anna.context.request.get("/api/chat/recovery")
    ).json();
    expect(devices.archive).not.toBeNull();
  }).toPass({ timeout: 20_000 });

  // Every device lost: a new one signs in and brings chat back (R3).
  const phone = await device(browser);
  await signInThroughApi(phone.context.request, anna.email);
  await phone.page.goto("/samtaler");
  await phone.page
    .getByRole("link", {
      name: "Mistet alle enhetene? Bruk gjenopprettingsnøkkelen",
    })
    .click();
  await expect(
    phone.page.getByRole("heading", { name: "Hent tilbake privat chat" }),
  ).toBeVisible();
  expect(await axeViolations(phone.page)).toEqual([]);
  const field = phone.page.getByLabel("Gjenopprettingsnøkkel");
  await field.fill(`${key.slice(0, -1)}${key.endsWith("0") ? "1" : "0"}`);
  await phone.page.getByRole("button", { name: "Hent tilbake" }).click();
  await expect(
    phone.page.getByText(
      "Nøkkelen stemmer ikke. Sjekk at alle 52 tegnene er riktige.",
    ),
  ).toBeVisible();
  // Spaces and small letters do not matter.
  await field.fill(key.toLowerCase());
  await phone.page.getByRole("button", { name: "Hent tilbake" }).click();
  await expect(
    phone.page.getByText(
      "Privat chat er hentet tilbake på denne enheten, med meldingene som var sikkerhetskopiert.",
    ),
  ).toBeVisible({ timeout: 20_000 });
  await phone.page.goto(conversation);
  await expect(
    messages(phone.page).getByText("Har du en drill?"),
  ).toBeVisible();
  await expect(messages(phone.page).getByText("Ja, en god en.")).toBeVisible();

  // The old device is shut out; Jon's device adds the restored one, and
  // his next message reaches it.
  await bo.page.goto(conversation);
  await expect(async () => {
    await phone.page.goto(conversation);
    await expect(phone.page.getByLabel("Ny melding")).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 45_000 });
  await bo.page.reload();
  await bo.page.getByLabel("Ny melding").fill("Hent den i morgen.");
  await bo.page.getByRole("button", { name: "Send" }).click();
  await expectMessage(phone.page, "Hent den i morgen.");
  const own = await (await phone.context.request.get("/api/chat/devices")).json();
  expect(
    own.devices.filter((d: { revokedAt: string | null }) => !d.revokedAt),
  ).toHaveLength(1);

  for (const someone of [anna, bo, phone]) {
    await someone.context.close();
  }
});

test("a message waits until the friend has turned chat on", async ({
  browser,
}) => {
  test.setTimeout(150_000);
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
  await expect(
    messages(anna.page).getByText("Venter · sendes når"),
  ).toBeVisible();

  // When Eli enables chat, Dag's next background sync must add the new
  // device and send the waiting message without a page reload.
  await turnOnChat(bo.page);
  await expect(messages(anna.page).getByText("Venter")).toHaveCount(0, {
    timeout: 45_000,
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

test("a loan's page leads to the parties' conversation, or offers to start it (KF5 F2–F3)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const anna = await person(browser, "Gro Hauge");
  const bo = await person(browser, "Ivar Lund");
  await postCommand(anna.context.request, "/api/social/friend-requests", {
    userId: bo.id,
  });
  await postCommand(bo.context.request, "/api/social/friend-requests/accept", {
    userId: anna.id,
  });
  const loanId = await agreeLoan(
    anna.context.request,
    bo.context.request,
    "Sag",
  );
  await turnOnChat(anna.page);
  await turnOnChat(bo.page);

  await bo.page.goto(`/lan/${loanId}`);
  const lender = bo.page.getByRole("region", { name: "Ansvarlig utlåner" });
  await lender.getByRole("link", { name: "Skriv til Gro Hauge" }).click();
  await bo.page
    .getByRole("button", { name: "Start samtalen", exact: true })
    .click();
  await expect(bo.page).toHaveURL(/\/samtaler\/[0-9a-f-]+$/);
  const conversation = bo.page.url();

  // Once it exists, both parties' pages of the loan lead to it.
  await bo.page.goto(`/lan/${loanId}`);
  await lender
    .getByRole("link", { name: "Gå til samtalen med Gro Hauge" })
    .click();
  await expect(bo.page).toHaveURL(conversation);
  await anna.page.goto(`/lan/${loanId}`);
  await expect(
    anna.page
      .getByRole("region", { name: "Låntaker" })
      .getByRole("link", { name: "Gå til samtalen med Ivar Lund" }),
  ).toBeVisible();

  for (const someone of [anna, bo]) {
    expect(someone.problems).toEqual([]);
    await someone.context.close();
  }
});

test("after a block, a loan's parties write about the loan only, in short messages", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const anna = await person(browser, "Frida Holm");
  const bo = await person(browser, "Geir Isak");
  await postCommand(anna.context.request, "/api/social/friend-requests", {
    userId: bo.id,
  });
  await postCommand(bo.context.request, "/api/social/friend-requests/accept", {
    userId: anna.id,
  });
  const loanId = await agreeLoan(
    anna.context.request,
    bo.context.request,
    "Tilhenger",
  );
  await postCommand(bo.context.request, "/api/social/blocks", {
    userId: anna.id,
  });
  await turnOnChat(anna.page);
  await turnOnChat(bo.page);

  // The loan's page offers the conversation that the block left open.
  await bo.page.goto(`/lan/${loanId}`);
  const logistics = bo.page.getByRole("region", { name: "Samtale om lånet" });
  await expect(logistics).toContainText("kun for å avslutte lånet");
  await logistics.getByRole("button", { name: "Skriv om lånet" }).click();
  await expect(
    bo.page.getByRole("heading", { level: 1, name: "Frida Holm" }),
  ).toBeVisible();
  await expect(bo.page.getByText("Bare for å avslutte lånet")).toBeVisible();

  // Only what fits one short message can be sent.
  const composer = bo.page.getByLabel("Ny melding");
  await composer.fill("x".repeat(1_000));
  await expect(
    bo.page.getByRole("alert").filter({ hasText: "Meldingen er for lang" }),
  ).toBeVisible();
  await composer.fill("Jeg leverer tilhengeren kl. 18.");
  await expect(bo.page.getByText("Meldingen er for lang")).toHaveCount(0);
  await bo.page.getByRole("button", { name: "Send" }).click();
  await expect(messages(bo.page).getByText(/Venter|Sender/)).toHaveCount(0, {
    timeout: 30_000,
  });

  // Frida finds it marked as about the loan, from her page of the loan.
  await anna.page.goto(`/lan/${loanId}`);
  await anna.page
    .getByRole("region", { name: "Samtale om lånet" })
    .getByRole("link", { name: "Gå til samtalen om lånet" })
    .click();
  // The reload in expectMessage must not race the navigation it follows.
  await expect(anna.page).toHaveURL(/\/samtaler\/[0-9a-f-]+$/);
  await expectMessage(anna.page, "Jeg leverer tilhengeren kl. 18.");
  await anna.page.goto("/samtaler");
  await expect(anna.page.getByText("Lånelogistikk · Tilhenger")).toBeVisible();

  for (const someone of [anna, bo]) {
    expect(
      someone.problems.filter((problem) => !problem.includes("409 (Conflict)")),
    ).toEqual([]);
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

import { randomUUID } from "node:crypto";
import { readEmailCode } from "@lanbort/auth/testing";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

/** Shared steps for the browser tests, against the local Supabase stack. */
export const newEmail = () => `e2e-${randomUUID()}@example.test`;

export function collectBrowserProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      new URL(message.location().url || "http://x/").pathname !== "/favicon.ico"
    ) {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

export async function signInThroughUi(page: Page, email: string) {
  await page.goto("/logg-inn");
  await page.getByLabel("E-postadresse").fill(email);
  const since = new Date();
  await page.getByRole("button", { name: "Send kode" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page
    .getByLabel("Kode fra e-posten")
    .fill(await readEmailCode(email, { since }));
  await page.getByRole("button", { name: "Bekreft" }).click();
}

/** Signs in through the API, leaving the session cookies in `request`. */
export async function signInThroughApi(
  request: APIRequestContext,
  email: string,
) {
  const since = new Date();
  expect(
    (await request.post("/api/auth/email-code", { data: { email } })).status(),
  ).toBe(202);
  const verify = await request.post("/api/auth/email-code/verify", {
    data: { email, code: await readEmailCode(email, { since }) },
  });
  expect(verify.status()).toBe(200);
  return verify.json();
}

/** A signed-in, fully registered account; cookies stay in `request`. */
export async function registerThroughApi(
  request: APIRequestContext,
  email = newEmail(),
  realName = "Test Testesen",
) {
  await signInThroughApi(request, email);
  const registration = await request.post("/api/account/registration", {
    data: { realName, adultConfirmed: true },
    headers: { "Idempotency-Key": randomUUID() },
  });
  expect(registration.status()).toBe(200);
  return email;
}

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  newEmail,
  registerThroughApi,
  signInThroughApi,
  signInThroughUi,
} from "./helpers";

/** WP-10 end to end: UX-JRN-001 in a real browser against local Supabase. */

test("a new user registers with e-mail code, name and 18+ and can sign out", async ({
  page,
  context,
}) => {
  const problems = collectBrowserProblems(page);
  const email = newEmail();

  await page.goto("/");
  await page
    .getByRole("link", { name: "Logg inn eller opprett konto" })
    .click();
  await expect(page).toHaveURL(/\/logg-inn$/);

  await signInThroughUi(page, email);
  await expect(page).toHaveURL(/\/registrering$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Fullfør kontoen din",
  );

  await page.getByLabel("Fullt navn").fill("Kari Nordmann");
  await page.getByLabel("Jeg bekrefter at jeg er 18 år eller eldre").check();
  await page.getByRole("button", { name: "Fullfør" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hei, Kari Nordmann",
  );

  // The session lives only in HttpOnly cookies the page's scripts cannot read.
  const sessionCookies = (await context.cookies()).filter(({ name }) =>
    name.startsWith("sb-"),
  );
  expect(sessionCookies.length).toBeGreaterThan(0);
  expect(sessionCookies.every((cookie) => cookie.httpOnly)).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hei, Kari Nordmann",
  );

  // Signing out is in the account context, behind the user's own avatar.
  await page.getByRole("link", { name: /^Konto og innstillinger/ }).click();
  await page.getByRole("button", { name: "Logg ut" }).click();
  await expect(
    page.getByRole("link", { name: "Logg inn eller opprett konto" }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test("a returning user goes straight home, and a wrong code is explained", async ({
  page,
  request,
}) => {
  const email = newEmail();
  await registerThroughApi(request, email, "Ola Nordmann");

  await page.goto("/logg-inn");
  await page.getByLabel("E-postadresse").fill(email);
  await page.getByRole("button", { name: "Send kode" }).click();
  await page.getByLabel("Kode fra e-posten").fill("000000");
  await page.getByRole("button", { name: "Bekreft" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Koden er feil eller utløpt" }),
  ).toBeVisible();

  // Local Auth allows one code per address per second (max_frequency).
  await page.waitForTimeout(1100);
  await signInThroughUi(page, email);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Hei, Ola Nordmann",
  );
});

test.describe("API boundary", () => {
  test("protected APIs refuse callers without a session", async ({
    request,
  }) => {
    const account = await request.get("/api/account");
    expect(account.status()).toBe(401);
    expect(await account.json()).toEqual({
      error: { code: "unauthenticated" },
    });

    const registration = await request.post("/api/account/registration", {
      data: { realName: "Ingen", adultConfirmed: true },
      headers: { "Idempotency-Key": randomUUID() },
    });
    expect(registration.status()).toBe(401);
  });

  test("state-changing requests from another site are refused", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/email-code", {
      data: { email: newEmail() },
      headers: { origin: "https://evil.example" },
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "cross_site_request" },
    });
  });

  test("a pending account cannot read anything but its own registration state", async ({
    request,
  }) => {
    const email = newEmail();
    expect(await signInThroughApi(request, email)).toEqual({
      accountStatus: "pending_registration",
    });

    const account = await request.get("/api/account");
    expect(await account.json()).toMatchObject({
      status: "pending_registration",
      realName: null,
      email,
    });
  });

  test("a retried registration is applied once and replays its result", async ({
    request,
  }) => {
    await signInThroughApi(request, newEmail());
    const send = () =>
      request.post("/api/account/registration", {
        data: { realName: "Per Hansen", adultConfirmed: true },
        headers: { "Idempotency-Key": key },
      });
    const key = randomUUID();

    const first = await send();
    const retry = await send();

    expect(first.status()).toBe(200);
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toEqual(await first.json());
    expect(retry.headers()["idempotent-replayed"]).toBe("true");
    expect(first.headers()["idempotent-replayed"]).toBeUndefined();

    const again = await request.post("/api/account/registration", {
      data: { realName: "Per Hansen", adultConfirmed: true },
      headers: { "Idempotency-Key": randomUUID() },
    });
    expect(again.status()).toBe(403);
  });

  test("the outbox worker only runs for the scheduler", async ({ request }) => {
    expect((await request.get("/api/internal/outbox")).status()).toBe(401);
    expect(
      (
        await request.get("/api/internal/outbox", {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        })
      ).status(),
    ).toBe(200);
  });
});

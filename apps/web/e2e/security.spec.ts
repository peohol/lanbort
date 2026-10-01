import { readEmailCode, totpCode } from "@lanbort/auth/testing";
import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  newEmail,
  registerThroughApi,
  signInThroughApi,
} from "./helpers";

/** WP-12 end to end: authenticator app and re-authentication. */
test("a user adds an authenticator app and confirms a later sign-in with it", async ({
  page,
  browser,
}) => {
  const problems = collectBrowserProblems(page);
  const email = await registerThroughApi(page.request);

  await page.goto("/");
  await page.getByRole("link", { name: "Innlogging og sikkerhet" }).click();
  await expect(
    page.getByText("Ikke slått på.", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Slå på autentiseringsapp" }).click();
  await expect(
    page.getByRole("img", { name: "QR-kode for autentiseringsappen" }),
  ).toBeVisible();
  const secret = await page.getByTestId("totp-secret").innerText();

  await page.getByLabel("Kode fra appen").fill("000000");
  await page.getByRole("button", { name: "Slå på" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Koden er feil" }),
  ).toBeVisible();

  await page.getByLabel("Kode fra appen").fill(totpCode(secret));
  await page.getByRole("button", { name: "Slå på" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Autentiseringsappen er slått på.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Denne innloggingen er bekreftet med appen."),
  ).toBeVisible();
  // The only failed request is the deliberately wrong code.
  expect(problems.filter((p) => !p.includes("status of 400"))).toEqual([]);

  // A new sign-in elsewhere starts without the second factor.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await page.waitForTimeout(1100); // one e-mail code per second locally
  await signInThroughApi(otherPage.request, email);
  await otherPage.goto("/konto/sikkerhet");
  await otherPage
    .getByRole("button", { name: "Bekreft med autentiseringsappen" })
    .click();
  await otherPage.getByLabel("Kode fra appen").fill(totpCode(secret));
  await otherPage.getByRole("button", { name: "Bekreft" }).click();
  await expect(
    otherPage.getByText("Denne innloggingen er bekreftet med appen."),
  ).toBeVisible();
  await other.close();
});

test.describe("sign-in security API", () => {
  test("refuses callers without a session", async ({ request }) => {
    for (const [method, path] of [
      ["GET", "/api/account/security"],
      ["POST", "/api/account/security/totp"],
      ["POST", "/api/account/security/totp/verify"],
      ["POST", "/api/auth/reauthenticate"],
      ["POST", "/api/auth/reauthenticate/verify"],
    ] as const) {
      const response = await request.fetch(path, {
        method,
        data: method === "POST" ? { code: "123456" } : undefined,
      });
      expect(response.status(), `${method} ${path}`).toBe(401);
    }
  });

  test("a pending account cannot change sign-in security", async ({
    request,
  }) => {
    await signInThroughApi(request, newEmail());

    const response = await request.post("/api/account/security/totp");
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "registration_required" },
    });
  });

  test("has no second factor to confirm before an app is added", async ({
    request,
  }) => {
    await registerThroughApi(request);

    const status = await request.get("/api/account/security");
    expect(await status.json()).toEqual({
      totp: "none",
      sessionAssurance: "aal1",
      platformRoles: [],
    });

    const verify = await request.post("/api/account/security/totp/verify", {
      data: { code: "123456" },
    });
    expect(verify.status()).toBe(404);
  });

  test("re-authentication sends a code to the own address and keeps the account", async ({
    request,
  }) => {
    const email = await registerThroughApi(request);
    const before = await (await request.get("/api/account")).json();

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const since = new Date();
    expect((await request.post("/api/auth/reauthenticate")).status()).toBe(202);
    const code = await readEmailCode(email, { since });

    const wrong = await request.post("/api/auth/reauthenticate/verify", {
      data: { code: "000000" },
    });
    expect(wrong.status()).toBe(400);

    const verified = await request.post("/api/auth/reauthenticate/verify", {
      data: { code },
    });
    expect(verified.status()).toBe(204);
    expect(await (await request.get("/api/account")).json()).toEqual(before);
  });

  test("re-authentication cannot be triggered from another site", async ({
    request,
  }) => {
    await registerThroughApi(request);

    const response = await request.post("/api/auth/reauthenticate", {
      headers: { origin: "https://evil.example" },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "cross_site_request" },
    });
  });
});

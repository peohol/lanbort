import { randomUUID } from "node:crypto";
import { readEmailCode } from "@lanbort/auth/testing";
import { expect, test } from "@playwright/test";
import {
  collectBrowserProblems,
  newEmail,
  registerThroughApi,
  signInThroughApi,
} from "./helpers";

/** WP-53 end to end: deactivation, reactivation and deletion of the own account. */
const key = () => ({ "Idempotency-Key": randomUUID() });

test.describe("account lifecycle API", () => {
  test("refuses callers without a session", async ({ request }) => {
    for (const path of [
      "/api/account/deactivation",
      "/api/account/reactivation",
      "/api/account/deletion",
    ]) {
      const response = await request.post(path, { headers: key() });
      expect(response.status(), path).toBe(401);
    }
    expect((await request.get("/api/account/deletion")).status()).toBe(401);
  });

  test("a deactivated account starts nothing new until it is reactivated", async ({
    request,
  }) => {
    await registerThroughApi(request);

    const deactivated = await request.post("/api/account/deactivation", {
      headers: key(),
    });
    expect(deactivated.status()).toBe(200);
    expect(await deactivated.json()).toMatchObject({ status: "deactivated" });
    expect(await (await request.get("/api/account")).json()).toMatchObject({
      status: "deactivated",
      statusReason: "user_request",
    });

    const object = await request.post("/api/objects", {
      data: {
        title: "Drill",
        categoryId: "annet",
        description: "Slagdrill",
        availability: [],
      },
      headers: key(),
    });
    expect(object.status()).toBe(403);
    expect(await object.json()).toEqual({
      error: { code: "account_inactive" },
    });

    const reactivated = await request.post("/api/account/reactivation", {
      headers: key(),
    });
    expect(await reactivated.json()).toMatchObject({ status: "active" });
    expect(await (await request.get("/api/account")).json()).toMatchObject({
      status: "active",
      statusReason: null,
    });
  });

  test("deleting the account signs out, and the address can start over", async ({
    request,
  }) => {
    const email = newEmail();
    await registerThroughApi(request, email, "Slett Meg");

    expect(await (await request.get("/api/account/deletion")).json()).toEqual({
      bindings: [],
    });
    const deleted = await request.post("/api/account/deletion");
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toMatchObject({ status: "deleted" });
    expect((await request.get("/api/account")).status()).toBe(401);

    // Once the outbox has removed the sign-in identity, the same address
    // gets a new, empty account.
    await expect(async () => {
      await request.get("/api/internal/outbox", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await signInThroughApi(request, email)).toEqual({
        accountStatus: "pending_registration",
      });
    }).toPass({ timeout: 30_000 });
    expect(await (await request.get("/api/account")).json()).toMatchObject({
      realName: null,
      email,
    });
  });
});

test.describe("the own account in the browser", () => {
  test("an account at rest keeps its pages, says why, and comes back", async ({
    page,
  }) => {
    const problems = collectBrowserProblems(page);
    await registerThroughApi(page.request, newEmail(), "Hvile Konto");
    const notice = page.locator(".account-notice");

    await page.goto("/konto");
    await expect(page.getByText("Kontoen din er aktiv.")).toBeVisible();
    await page.getByRole("button", { name: "Deaktiver kontoen" }).click();
    await expect(notice).toContainText("Kontoen din er deaktivert.");

    // Home stays, with what it still has; Finn finds nothing new for it.
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Hei, Hvile Konto",
    );
    await expect(notice).toBeVisible();
    await page.goto("/finn");
    await expect(
      page.getByText("Du kan ikke finne nye ting mens kontoen ikke er aktiv."),
    ).toBeVisible();

    await notice.getByRole("link", { name: "Se hva du kan gjøre" }).click();
    await page.getByRole("button", { name: "Ta kontoen i bruk igjen" }).click();
    await expect(page.getByText("Kontoen din er aktiv.")).toBeVisible();
    await expect(notice).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test("deleting the account shows what goes and what stays, and asks for a new code", async ({
    page,
  }) => {
    const email = await registerThroughApi(
      page.request,
      newEmail(),
      "Slett Meg",
    );

    await page.goto("/konto");
    await expect(page.getByText("Dette forsvinner:")).toBeVisible();
    await expect(
      page.getByText("Dette består, uten navnet ditt:"),
    ).toBeVisible();

    // Local Auth allows one code per address per second (max_frequency).
    await page.waitForTimeout(1100);
    const since = new Date();
    await page
      .getByRole("button", { name: "Slett kontoen", exact: true })
      .click();
    await page
      .getByLabel("Kode fra e-posten")
      .fill(await readEmailCode(email, { since }));
    await page.getByRole("button", { name: "Slett kontoen for godt" }).click();

    await expect(
      page.getByRole("link", { name: "Logg inn eller opprett konto" }),
    ).toBeVisible();
    expect((await page.request.get("/api/account")).status()).toBe(401);
  });
});

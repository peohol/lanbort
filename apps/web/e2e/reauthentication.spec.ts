import { readEmailCode } from "@lanbort/auth/testing";
import { expect, test } from "@playwright/test";
import { registerThroughApi } from "./helpers";

/** WP-12 end to end: re-authentication before sensitive actions. */
test.describe("re-authentication API", () => {
  test("refuses callers without a session", async ({ request }) => {
    for (const path of [
      "/api/auth/reauthenticate",
      "/api/auth/reauthenticate/verify",
    ]) {
      const response = await request.post(path, { data: { code: "123456" } });
      expect(response.status(), path).toBe(401);
    }
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

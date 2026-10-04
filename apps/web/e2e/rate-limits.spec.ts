import { randomBytes, randomUUID } from "node:crypto";
import { readEmailCode } from "@lanbort/auth/testing";
import { rateLimits } from "@lanbort/domain";
import { expect, test } from "@playwright/test";
import { newEmail, registerThroughApi } from "./helpers";

/** A client address of its own per test, so reruns start afresh. */
const someClient = () => `2001:db8::${randomBytes(2).toString("hex")}`;

/** WP-73 end to end: rate limits against attacks on sign-in and scraping. */
test.describe("rate limits", () => {
  test("guessing codes for one address stops, even with the right code", async ({
    request,
  }) => {
    const email = newEmail();
    const since = new Date();
    expect(
      (
        await request.post("/api/auth/email-code", { data: { email } })
      ).status(),
    ).toBe(202);
    const code = await readEmailCode(email, { since });

    for (
      let attempt = 0;
      attempt < rateLimits.codeAttemptsPerAddress.limit;
      attempt += 1
    ) {
      const wrong = await request.post("/api/auth/email-code/verify", {
        data: { email, code: code === "000000" ? "111111" : "000000" },
      });
      expect(wrong.status()).toBe(400);
    }

    const right = await request.post("/api/auth/email-code/verify", {
      data: { email, code },
    });
    expect(right.status()).toBe(429);
    expect(Number(right.headers()["retry-after"])).toBeGreaterThan(0);
    expect(await right.json()).toEqual({ error: { code: "rate_limited" } });
  });

  test("one client cannot send codes to address after address", async ({
    request,
  }) => {
    const headers = { "x-forwarded-for": someClient() };

    for (let sent = 0; sent < rateLimits.emailCodesPerClient.limit; sent += 1) {
      const response = await request.post("/api/auth/email-code", {
        data: { email: newEmail() },
        headers,
      });
      expect(response.status()).toBe(202);
    }

    const refused = await request.post("/api/auth/email-code", {
      data: { email: newEmail() },
      headers,
    });
    expect(refused.status()).toBe(429);

    // Another client is not affected.
    const other = await request.post("/api/auth/email-code", {
      data: { email: newEmail() },
      headers: { "x-forwarded-for": someClient() },
    });
    expect(other.status()).toBe(202);
  });

  test("looking up people one by one stops, found or not", async ({
    request,
  }) => {
    await registerThroughApi(request);
    const statuses: number[] = [];

    // The budget refills a little every few seconds, so a handful more may
    // pass while the burst is running; then it stops.
    while (
      statuses.length < 2 * rateLimits.lookups.limit &&
      !statuses.includes(429)
    ) {
      const response = await request.get(
        `/api/social/relation?userId=${randomUUID()}`,
      );
      statuses.push(response.status());
    }

    const { limit } = rateLimits.lookups;
    expect(statuses.indexOf(429)).toBeGreaterThanOrEqual(limit);
    expect(statuses.slice(0, limit)).toEqual(Array(limit).fill(404));
  });
});

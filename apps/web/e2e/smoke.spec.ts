import { expect, test } from "@playwright/test";
import { healthResponseSchema } from "@lanbort/contracts";

test("home page renders without CSP violations or console errors", async ({
  page,
}) => {
  // No favicon exists before visual identity work; its 404 is not a defect.
  const isMissingFavicon = (url: string) =>
    new URL(url).pathname === "/favicon.ico";
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isMissingFavicon(message.location().url))
      problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "nb");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lånbort");
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("responses carry the security header baseline", async ({ request }) => {
  for (const path of ["/", "/api/health"]) {
    const response = await request.get(path);
    const headers = response.headers();

    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers).not.toHaveProperty("x-powered-by");
  }
});

test("health endpoint returns the non-sensitive contract", async ({
  request,
}) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(healthResponseSchema.parse(await response.json())).toEqual({
    status: "ok",
    service: "lanbort-web",
  });
});

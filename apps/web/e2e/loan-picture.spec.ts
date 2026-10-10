import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import {
  accountId,
  agreeLoan,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
} from "./helpers";

/**
 * PS-OBJ-021: whoever sees the thing's name sees its pictures. The loan's
 * and the request's pages show the thing's picture beside the title (KF7),
 * read through the loan, also once the borrower no longer finds the thing
 * where the request came from. Nobody else gets it that way.
 */
test("a borrower sees the thing's picture on the loan's pages after the friendship ended", async ({
  page,
  browser,
  baseURL,
}) => {
  const lender = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(lender.request, undefined, "Kari Vik");
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Ola Hansen");
  const ola = await accountId(page.request);
  await postCommand(page.request, "/api/social/friend-requests", {
    userId: await accountId(lender.request),
  });
  await postCommand(lender.request, "/api/social/friend-requests/accept", {
    userId: ola,
  });
  const loanId = await agreeLoan(lender.request, page.request, "Stige");
  const { objectId, requestId } = await (
    await lender.request.get(`/api/loans/${loanId}`)
  ).json();
  const upload = await lender.request.post(`/api/objects/${objectId}/images`, {
    data: await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#4a7" },
    })
      .jpeg()
      .toBuffer(),
    headers: { "content-type": "image/jpeg", "Idempotency-Key": randomUUID() },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const { imageId } = await upload.json();

  // Ola no longer finds the thing through Kari; the loan goes on.
  await postCommand(lender.request, "/api/social/friends/remove", {
    userId: ola,
  });
  expect(
    (
      await page.request.get(
        `/api/social/objects/image?objectId=${objectId}&imageId=${imageId}`,
      )
    ).status(),
  ).toBe(404);

  for (const [path, src] of [
    [`/lan/${loanId}`, `/api/loans/${loanId}/images/${imageId}`],
    [
      `/lan/foresporsel/${requestId}`,
      `/api/loan-requests/${requestId}/images/${imageId}`,
    ],
  ] as const) {
    await page.goto(path);
    const picture = page.locator(".page-picture img");
    await expect(picture).toHaveAttribute("src", src);
    await expect
      .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  }

  // A stranger gets nothing through the loan or the request.
  const stranger = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(stranger.request);
  for (const src of [
    `/api/loans/${loanId}/images/${imageId}`,
    `/api/loan-requests/${requestId}/images/${imageId}`,
  ]) {
    expect((await stranger.request.get(src)).status()).toBe(404);
  }

  expect(problems).toEqual([]);
  await lender.close();
  await stranger.close();
});

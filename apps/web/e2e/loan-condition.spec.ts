import { expect, test } from "@playwright/test";
import {
  accountId,
  agreeLoan,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
} from "./helpers";

/**
 * PS-LOAN-023, KF7: either party registers damage, deficiency or loss on
 * the loan's page, and the other answers it once, in a real browser. What
 * each told stands with their name; the loan itself is unchanged.
 */
test("a party reports damage and the other disagrees, on the loan's page", async ({
  page,
  browser,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Kari Nordmann");
  const kari = await accountId(page.request);
  const borrower = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(borrower.request, undefined, "Ola Hansen");
  await postCommand(borrower.request, "/api/social/friend-requests", {
    userId: kari,
  });
  await postCommand(page.request, "/api/social/friend-requests/accept", {
    userId: await accountId(borrower.request),
  });
  const loanId = await agreeLoan(page.request, borrower.request, "Spyler");
  await postCommand(page.request, `/api/loans/${loanId}/handover`, {
    agreementVersion: 1,
    outcome: "handed_over",
  });

  // The lender reports it from «Flere valg».
  await page.goto(`/lan/${loanId}`);
  await page.getByText("Flere valg").click();
  await page.getByText("Meld skade, mangel eller tap").click();
  await expect(page.getByText(/Ola Hansen ser den/)).toBeVisible();
  await page
    .getByLabel("Hva er skadet, mangler eller borte?")
    .fill("Munnstykket mangler.");
  await page.getByRole("button", { name: "Meld det" }).click();
  const reports = page.getByRole("region", { name: "Skade, mangel eller tap" });
  await expect(reports).toContainText("Du opplyste");
  await expect(reports).toContainText("Munnstykket mangler.");
  // Another report is a new one, not a replay of the first.
  await page.getByText("Meld skade, mangel eller tap").click();
  await page
    .getByLabel("Hva er skadet, mangler eller borte?")
    .fill("Slangen har en sprekk.");
  await page.getByRole("button", { name: "Meld det" }).click();
  await expect(reports).toContainText("Slangen har en sprekk.");
  await expect(reports).toContainText("Munnstykket mangler.");
  // The loan goes on as before.
  await expect(page.getByRole("list", { name: "Lånets steg" })).toContainText(
    "Utlånt",
  );

  // The borrower sees who told it, and answers once.
  const ola = await borrower.newPage();
  const olaProblems = collectBrowserProblems(ola);
  await ola.goto(`/lan/${loanId}`);
  const seen = ola.getByRole("region", { name: "Skade, mangel eller tap" });
  await expect(seen).toContainText("Kari Nordmann opplyste");
  const first = seen.locator("div", { hasText: "Munnstykket mangler." });
  await first.getByText("Jeg er uenig").click();
  await first.getByLabel("Hva er du uenig i?").fill("Det lå i lokket.");
  await first.getByRole("button", { name: "Send svaret" }).click();
  await expect(first).toContainText("Du er uenig");
  await expect(first).toContainText("Det lå i lokket.");
  await expect(first.getByText("Legg til min forklaring")).toHaveCount(0);
  // The other report can still be answered.
  await expect(seen.getByText("Legg til min forklaring")).toHaveCount(1);

  await page.reload();
  await expect(reports).toContainText("Ola Hansen er uenig");
  expect(problems).toEqual([]);
  expect(olaProblems).toEqual([]);
  await borrower.close();
});

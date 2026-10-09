import { expect, test } from "@playwright/test";
import {
  accountId,
  agreeLoan,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
} from "./helpers";

/**
 * UX-PRIV-013, KF7 screen 13: a co-owner who is offered the lender's role
 * opens the loan from the offer and sees only the restricted view: status,
 * period, terms and who the parties are, with their own answer first.
 * Never the request's message, the timeline or the parties' steps.
 */
test("a co-owner offered the lender's role sees the loan as a co-owner", async ({
  page,
  browser,
  baseURL,
}) => {
  const lender = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(lender.request, undefined, "Kari Vik");
  const kari = await accountId(lender.request);
  const borrower = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(borrower.request, undefined, "Ola Hansen");
  await postCommand(borrower.request, "/api/social/friend-requests", {
    userId: kari,
  });
  await postCommand(lender.request, "/api/social/friend-requests/accept", {
    userId: await accountId(borrower.request),
  });
  const loanId = await agreeLoan(lender.request, borrower.request, "Stige");
  const { objectId } = await (
    await lender.request.get(`/api/loans/${loanId}`)
  ).json();

  // Jonas joins the object after the approval and is offered the role.
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Jonas Berg");
  const jonas = await accountId(page.request);
  const { invitationId } = await (
    await postCommand(
      lender.request,
      `/api/objects/${objectId}/co-owners/invitations`,
      { userId: jonas },
    )
  ).json();
  await postCommand(page.request, "/api/object-invitations/accept", {
    invitationId,
  });
  await postCommand(lender.request, `/api/loans/${loanId}/responsibility`, {
    toUserId: jonas,
  });

  await page.goto(`/lan/${loanId}`);
  await expect(page.getByText("Lån · Du er medeier")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Stige til Ola Hansen" }),
  ).toBeVisible();
  await expect(
    page.getByText("Kari Vik spør om du vil bli ansvarlig utlåner"),
  ).toBeVisible();
  const agreement = page.getByRole("region", { name: "Avtalen" });
  await expect(agreement).toContainText("Ola Hansen");
  await expect(agreement).toContainText("Kari Vik");
  await expect(page.getByText("Kan jeg låne den?")).toHaveCount(0);
  await expect(page.getByText("Flere valg")).toHaveCount(0);
  await expect(page.getByText("Tidslinje")).toHaveCount(0);

  // Accepting a role offered after the approval waits for the borrower.
  await page.getByRole("button", { name: "Bli ansvarlig utlåner" }).click();
  await expect(
    page.getByText("Venter på at Ola Hansen godtar deg"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Si nei" })).toHaveCount(0);

  expect(problems).toEqual([]);
  await lender.close();
  await borrower.close();
});

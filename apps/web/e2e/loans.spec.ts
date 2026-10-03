import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { registerThroughApi } from "./helpers";

/**
 * WP-30–32 over HTTP: a friend asks to borrow an object directly, both
 * accept the responsibility declaration, the owner approves it into a loan
 * that reserves its period, both agree to extend it, and the borrower
 * cancels it before the handover.
 */

const post = (
  request: APIRequestContext,
  path: string,
  data?: object,
  key = randomUUID(),
) => request.post(path, { data, headers: { "Idempotency-Key": key } });

async function accountId(request: APIRequestContext): Promise<string> {
  return (await (await request.get("/api/account")).json()).userId;
}

test("an owner approves a friend's request into a reserved loan", async ({
  request,
  playwright,
  baseURL,
}) => {
  const context = () =>
    playwright.request.newContext({
      baseURL: baseURL!,
      extraHTTPHeaders: { origin: baseURL! },
    });
  await registerThroughApi(request);
  const anna = await accountId(request);
  const bo = await context();
  await registerThroughApi(bo);
  const boId = await accountId(bo);
  const stranger = await context();
  await registerThroughApi(stranger);

  await post(request, "/api/social/friend-requests", { userId: boId });
  await post(bo, "/api/social/friend-requests/accept", { userId: anna });

  const { objectId } = await (
    await post(request, "/api/objects", {
      title: "Tilhenger",
      categoryId: "annet",
      description: "Skapbil-tilhenger, 750 kg.",
      loanTerms: "Vaskes etter bruk.",
      availability: [{ start: "2030-06-01", end: null }],
    })
  ).json();

  const preview = await (
    await bo.get(`/api/loan-requests/preview?objectId=${objectId}`)
  ).json();
  const { requestId } = await (
    await post(bo, "/api/loan-requests", {
      objectId,
      origin: { kind: "direct" },
      start: { kind: "date", date: "2030-06-10" },
      end: { kind: "date", date: "2030-06-12" },
      message: "Kan jeg låne den til flyttingen?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    })
  ).json();

  // The borrower cannot approve; the owner has to accept the declaration first.
  expect(
    (await post(bo, `/api/loan-requests/${requestId}/approve`)).status(),
  ).toBe(403);
  const early = await post(request, `/api/loan-requests/${requestId}/approve`);
  expect(early.status()).toBe(409);
  await post(request, `/api/loan-requests/${requestId}/responsibility`, {
    declarationVersion: preview.responsibilityDeclarationVersion,
  });

  const key = randomUUID();
  const approved = await post(
    request,
    `/api/loan-requests/${requestId}/approve`,
    undefined,
    key,
  );
  expect(approved.status()).toBe(200);
  const result = await approved.json();
  expect(result).toEqual({
    requestId,
    loanId: expect.any(String),
    status: "approved",
    period: { start: "2030-06-10", end: "2030-06-12" },
  });
  const retried = await post(
    request,
    `/api/loan-requests/${requestId}/approve`,
    undefined,
    key,
  );
  expect(retried.headers()["idempotent-replayed"]).toBe("true");
  expect(await retried.json()).toEqual(result);

  // Both parties see the loan and its agreement; nobody else does.
  const loan = await (await bo.get(`/api/loans/${result.loanId}`)).json();
  expect(loan).toMatchObject({
    id: result.loanId,
    requestId,
    role: "borrower",
    borrowerUserId: boId,
    responsibleLenderId: anna,
    status: "reserved",
    period: { start: "2030-06-10", end: "2030-06-12" },
    agreement: {
      version: 1,
      title: "Tilhenger",
      loanTerms: "Vaskes etter bruk.",
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    },
  });
  expect(
    (await (await request.get(`/api/loans/${result.loanId}`)).json()).role,
  ).toBe("lender");
  expect((await stranger.get(`/api/loans/${result.loanId}`)).status()).toBe(
    404,
  );
  expect(
    await (await bo.get(`/api/loan-requests/${requestId}`)).json(),
  ).toMatchObject({ status: "approved", loanId: result.loanId });

  // The period is reserved: the object is not available then.
  expect(
    (await (await request.get(`/api/objects/${objectId}`)).json())
      .effectiveAvailability,
  ).toEqual([
    { start: "2030-06-01", end: "2030-06-09" },
    { start: "2030-06-13", end: null },
  ]);

  // The borrower proposes two more days; only the owner can agree to them.
  const loanPath = `/api/loans/${result.loanId}`;
  const proposal = {
    agreementVersion: 1,
    period: { start: "2030-06-10", end: "2030-06-14" },
  };
  expect(
    (await post(stranger, `${loanPath}/amendments`, proposal)).status(),
  ).toBe(404);
  const proposed = await post(bo, `${loanPath}/amendments`, proposal);
  expect(proposed.status()).toBe(200);
  const { amendmentId } = await proposed.json();
  expect(
    (await post(bo, `${loanPath}/amendments/${amendmentId}/accept`)).status(),
  ).toBe(403);
  expect(
    await (
      await post(request, `${loanPath}/amendments/${amendmentId}/accept`)
    ).json(),
  ).toEqual({
    loanId: result.loanId,
    amendmentId,
    status: "accepted",
    agreementVersion: 2,
  });
  expect(await (await bo.get(loanPath)).json()).toMatchObject({
    period: { start: "2030-06-10", end: "2030-06-14" },
    agreement: { version: 2, loanTerms: "Vaskes etter bruk." },
    amendment: null,
  });

  // Either party cancels before the handover; nobody else can.
  expect((await post(stranger, `${loanPath}/cancel`)).status()).toBe(404);
  const cancelled = await post(bo, `${loanPath}/cancel`);
  expect(await cancelled.json()).toEqual({
    loanId: result.loanId,
    status: "ended",
    endReason: "cancelled",
    endedBy: "borrower",
  });
  expect(await (await request.get(loanPath)).json()).toMatchObject({
    status: "ended",
    ending: { reason: "cancelled", endedBy: "borrower" },
    agreement: { version: 2 },
  });
  expect(
    (await (await request.get(`/api/objects/${objectId}`)).json())
      .effectiveAvailability,
  ).toEqual([{ start: "2030-06-01", end: null }]);
});

import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { registerThroughApi, showToFriends } from "./helpers";

/**
 * WP-30–34 over HTTP: a friend asks to borrow an object directly, both
 * accept the responsibility declaration, the owner approves it into a loan
 * that reserves its period, both agree to extend it, and the borrower
 * cancels it before the handover; another loan is handed over on its
 * handover day and returned early; the lender hands a third loan's role to
 * a co-owner.
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
  await showToFriends(request, objectId);

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

/** Today's date in the product's time zone. */
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

test("a party confirms the handover, and the lender the early return (WP-33–34)", async ({
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
      title: "Stige",
      categoryId: "annet",
      description: "Aluminiumsstige, 4 meter.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await showToFriends(request, objectId);
  const preview = await (
    await bo.get(`/api/loan-requests/preview?objectId=${objectId}`)
  ).json();
  const { requestId } = await (
    await post(bo, "/api/loan-requests", {
      objectId,
      origin: { kind: "direct" },
      start: { kind: "date", date: today() },
      end: { kind: "duration", days: 2 },
      message: "Kan jeg låne den i dag?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    })
  ).json();
  await post(request, `/api/loan-requests/${requestId}/responsibility`, {
    declarationVersion: preview.responsibilityDeclarationVersion,
  });
  const { loanId } = await (
    await post(request, `/api/loan-requests/${requestId}/approve`)
  ).json();
  const loanPath = `/api/loans/${loanId}`;

  // Only the parties speak; «not handed over» waits until the day is over.
  const handedOver = { agreementVersion: 1, outcome: "handed_over" };
  expect(
    (await post(stranger, `${loanPath}/handover`, handedOver)).status(),
  ).toBe(404);
  expect(
    (
      await post(bo, `${loanPath}/handover`, {
        agreementVersion: 1,
        outcome: "not_handed_over",
      })
    ).status(),
  ).toBe(409);

  const confirmed = await post(bo, `${loanPath}/handover`, handedOver);
  expect(confirmed.status()).toBe(200);
  expect(await confirmed.json()).toEqual({
    loanId,
    status: "active",
    agreementVersion: 1,
  });
  expect(await (await request.get(loanPath)).json()).toMatchObject({
    role: "lender",
    status: "active",
    handover: {
      borrower: { outcome: "handed_over" },
      lender: null,
      answerDueAt: null,
    },
  });

  // Handed over, it can no longer be cancelled.
  expect((await post(request, `${loanPath}/cancel`)).status()).toBe(409);

  // The return (WP-34): each side says only its own statement.
  const returnPath = `${loanPath}/return`;
  expect(
    (
      await post(bo, returnPath, { agreementVersion: 1, outcome: "received" })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post(stranger, returnPath, {
        agreementVersion: 1,
        outcome: "returned",
      })
    ).status(),
  ).toBe(404);

  // The borrower's confirmation waits 30 seconds and can be undone.
  const returned = await post(bo, returnPath, {
    agreementVersion: 1,
    outcome: "returned",
  });
  expect(returned.status()).toBe(200);
  expect(await returned.json()).toMatchObject({
    status: "active",
    pending: { outcome: "returned", effectiveAt: expect.any(String) },
  });
  expect(
    (await (await request.get(loanPath)).json()).return.pending,
  ).toBeNull();
  const undone = await post(bo, `${returnPath}/undo`);
  expect(undone.status()).toBe(200);
  expect(await undone.json()).toMatchObject({ pending: null });

  // The lender's receipt, made at once, ends it early.
  const received = await post(request, returnPath, {
    agreementVersion: 1,
    outcome: "received",
    immediately: true,
  });
  expect(await received.json()).toEqual({
    loanId,
    status: "ended",
    agreementVersion: 1,
    pending: null,
  });
  expect(await (await bo.get(loanPath)).json()).toMatchObject({
    status: "ended",
    ending: { reason: "returned", endedBy: "lender" },
    return: { borrower: null, lender: { outcome: "received" } },
  });
});

test("the lender hands the role to a co-owner who accepts it (WP-35)", async ({
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
  const dag = await context();
  await registerThroughApi(dag);
  const dagId = await accountId(dag);
  const stranger = await context();
  await registerThroughApi(stranger);
  await post(request, "/api/social/friend-requests", { userId: boId });
  await post(bo, "/api/social/friend-requests/accept", { userId: anna });

  // Dag co-owns the object before the loan is approved.
  const { objectId } = await (
    await post(request, "/api/objects", {
      title: "Tilhenger",
      categoryId: "annet",
      description: "Skapbil-tilhenger, 750 kg.",
      availability: [{ start: "2030-06-01", end: null }],
    })
  ).json();
  await showToFriends(request, objectId);
  const { invitationId } = await (
    await post(request, `/api/objects/${objectId}/co-owners/invitations`, {
      userId: dagId,
    })
  ).json();
  await post(dag, "/api/object-invitations/accept", { invitationId });

  const preview = await (
    await bo.get(`/api/loan-requests/preview?objectId=${objectId}`)
  ).json();
  const { requestId } = await (
    await post(bo, "/api/loan-requests", {
      objectId,
      origin: { kind: "direct" },
      start: { kind: "date", date: "2030-06-10" },
      end: { kind: "date", date: "2030-06-12" },
      message: "Kan jeg låne den?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    })
  ).json();
  await post(request, `/api/loan-requests/${requestId}/responsibility`, {
    declarationVersion: preview.responsibilityDeclarationVersion,
  });
  const { loanId } = await (
    await post(request, `/api/loan-requests/${requestId}/approve`)
  ).json();
  const loanPath = `/api/loans/${loanId}`;

  // Only the responsible lender offers the role; nobody takes it over while
  // the lender is available.
  const toDag = { toUserId: dagId };
  expect((await post(bo, `${loanPath}/responsibility`, toDag)).status()).toBe(
    403,
  );
  expect(
    (await post(stranger, `${loanPath}/responsibility`, toDag)).status(),
  ).toBe(404);
  expect(
    (await post(dag, `${loanPath}/responsibility/take-over`)).status(),
  ).toBe(404);

  const offered = await post(request, `${loanPath}/responsibility`, toDag);
  expect(offered.status()).toBe(200);
  const { transferId } = await offered.json();
  expect(
    (await (await bo.get(loanPath)).json()).responsibilityTransfer,
  ).toMatchObject({
    id: transferId,
    toUserId: dagId,
    needsBorrowerConsent: false,
  });
  expect(
    (await (await dag.get("/api/loans/co-owner")).json()).items,
  ).toMatchObject([{ loanId, objectId, transfer: { id: transferId } }]);

  const transferPath = `${loanPath}/responsibility/${transferId}`;
  expect((await post(bo, `${transferPath}/accept`)).status()).toBe(403);
  const accepted = await post(dag, `${transferPath}/accept`);
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toEqual({
    loanId,
    transferId,
    status: "completed",
    responsibleLenderId: dagId,
  });

  // Dag is the lender of the same agreement; Anna no longer sees the loan.
  expect(await (await dag.get(loanPath)).json()).toMatchObject({
    role: "lender",
    responsibleLenderId: dagId,
    period: { start: "2030-06-10", end: "2030-06-12" },
    responsibilityTransfer: null,
  });
  expect((await request.get(loanPath)).status()).toBe(404);
});

test("the handover deadline job only runs for the scheduler", async ({
  request,
}) => {
  const path = "/api/internal/loan-handovers";

  expect((await request.get(path)).status()).toBe(401);
  const run = await request.get(path, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  expect(await run.json()).toEqual({ notCompleted: expect.any(Number) });
});

test("the return confirmation job only runs for the scheduler", async ({
  request,
}) => {
  const path = "/api/internal/loan-returns";

  expect((await request.get(path)).status()).toBe(401);
  const run = await request.get(path, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  expect(await run.json()).toEqual({ made: expect.any(Number) });
});

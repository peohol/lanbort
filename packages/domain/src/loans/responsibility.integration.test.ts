import type { ReturnOutcome } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { leaveEnvironment } from "../environment/membership-commands";
import { leaveObject } from "../objects/co-owners";
import { blockUser, liftUserBlock } from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { proposeLoanAmendment, withdrawLoanAmendment } from "./amendments";
import { approveLoanRequest } from "./approval";
import { cancelLoan } from "./cancellation";
import { reportHandover } from "./handover";
import { readLoan } from "./queries";
import {
  acceptResponsibilityTransfer,
  declineResponsibilityTransfer,
  listCoOwnerLoans,
  offerResponsibility,
  takeOverResponsibility,
  withdrawResponsibilityTransfer,
} from "./responsibility";
import { recordLenderUnavailability } from "./responsibility-store";
import { reportReturn, undoReturn } from "./return";

/**
 * WP-35: the transfer of the responsible lender (PS-LOAN-009), a co-owner's
 * narrow receipt (PS-LOAN-015) and minimum access (PS-LOAN-021), with the
 * part of quality gate B they cover: access lost after approval never
 * takes away what the loan needs. When a lender counts as unavailable is
 * not decided (OD-0016); these tests record it directly, as the process
 * that decides it will.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

// Other files move their clocks days ahead and run the scheduled return
// job, which makes every confirmation that is due, so this file's clock
// starts a year ahead: what waits here waits until these tests say. This
// file runs no global job itself, so it never reaches into theirs.
const kit = loanTestKit(db, {
  startAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
});
const {
  run,
  tick,
  user,
  addCoOwner,
  environmentOrigin,
  ask,
  dated,
  published,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const undoBuffer = 30 * 1000;

const offer = (actor: UserActor, loanId: string, to: UserActor) =>
  run(offerResponsibility, actor, { loanId, toUserId: to.userId });

const accept = (actor: UserActor, loanId: string, transferId: string) =>
  run(acceptResponsibilityTransfer, actor, { loanId, transferId });

const decline = (actor: UserActor, loanId: string, transferId: string) =>
  run(declineResponsibilityTransfer, actor, { loanId, transferId });

const withdraw = (actor: UserActor, loanId: string, transferId: string) =>
  run(withdrawResponsibilityTransfer, actor, { loanId, transferId });

const takeOver = (actor: UserActor, loanId: string) =>
  run(takeOverResponsibility, actor, { loanId });

const say = (
  actor: UserActor,
  loanId: string,
  outcome: ReturnOutcome,
  immediately?: boolean,
) =>
  run(reportReturn, actor, {
    loanId,
    agreementVersion: 1,
    outcome,
    ...(immediately === undefined ? {} : { immediately }),
  });

const sayNow = (actor: UserActor, loanId: string, outcome: ReturnOutcome) =>
  say(actor, loanId, outcome, true);

/**
 * Makes the loan's due confirmations, as the scheduled job would, but for
 * this loan only: every loan command does that first, and the lender
 * repeating that it was handed over changes nothing else.
 */
const settle = (lender: UserActor, loanId: string) =>
  run(reportHandover, lender, {
    loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });

const loanOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoan, { actor, input: { loanId } });

const coOwnerLoans = async (actor: UserActor) =>
  (await executeQuery(tick(), listCoOwnerLoans, { actor, input: {} })).items;

const unavailable = (loanId: string, lender: UserActor) =>
  recordLenderUnavailability(db, {
    loanId,
    lenderUserId: lender.userId,
    now: kit.now(),
  });

const stored = (loanId: string) =>
  db
    .selectFrom("app.loans")
    .select([
      "responsible_lender_id",
      "status",
      "end_reason",
      "ended_by_user_id",
    ])
    .where("id", "=", loanId)
    .executeTakeFirstOrThrow();

const transfers = (loanId: string) =>
  db
    .selectFrom("app.loan_lender_transfers")
    .select(["kind", "from_user_id", "to_user_id", "status"])
    .where("loan_id", "=", loanId)
    .orderBy("position")
    .execute();

const loanEvents = async (loanId: string) =>
  (await eventsFor("loan", loanId)).map((event) => event.event_type);

/**
 * An object published in an environment, owned by `owner` and `coOwner`;
 * the owner approves the borrower's loan for days `from`–`to`. `later`
 * becomes a co-owner only after the approval.
 */
async function coOwnedLoan(from = 2, to = 4) {
  const setup = await published();
  const coOwner = await user();
  await addCoOwner(setup.owner, setup.objectId, coOwner);
  const { requestId } = await ask(
    setup.borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dated(from, to),
  );
  const { loanId } = await run(approveLoanRequest, setup.owner, { requestId });
  const later = await user();
  await addCoOwner(setup.owner, setup.objectId, later);

  return { ...setup, coOwner, later, requestId, loanId };
}

/** The same, handed over today. */
async function activeLoan() {
  const loan = await coOwnedLoan(0, 2);
  await run(reportHandover, loan.owner, {
    loanId: loan.loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });
  return loan;
}

describe("voluntary transfer (PS-LOAN-009)", () => {
  it("moves the role when the co-owner accepts, leaving the agreement as it was", async () => {
    const { owner, coOwner, borrower, objectId, loanId } = await activeLoan();
    const before = await loanOf(borrower, loanId);

    const offered = await offer(owner, loanId, coOwner);
    expect(offered).toEqual({
      loanId,
      transferId: expect.any(String),
      status: "proposed",
      responsibleLenderId: owner.userId,
    });
    const { transferId } = offered;

    // The borrower sees it coming; the recipient sees the offer, and only it.
    expect((await loanOf(borrower, loanId)).responsibilityTransfer).toEqual({
      id: transferId,
      kind: "voluntary",
      fromUserId: owner.userId,
      toUserId: coOwner.userId,
      needsBorrowerConsent: false,
      recipientAccepted: false,
      borrowerConsented: false,
      proposedAt: expect.any(String),
    });
    await expect(loanOf(coOwner, loanId)).rejects.toMatchObject(notFound);
    expect(await coOwnerLoans(coOwner)).toEqual([
      expect.objectContaining({
        loanId,
        objectId,
        status: "active",
        transfer: expect.objectContaining({ id: transferId }),
        mayTakeOver: false,
        mayConfirmReceipt: false,
      }),
    ]);

    // Offering the same co-owner again returns the open offer.
    expect((await offer(owner, loanId, coOwner)).transferId).toBe(transferId);

    expect(await accept(coOwner, loanId, transferId)).toEqual({
      loanId,
      transferId,
      status: "completed",
      responsibleLenderId: coOwner.userId,
    });
    expect((await stored(loanId)).responsible_lender_id).toBe(coOwner.userId);

    // The new lender steps into the same agreement; the former one is now
    // an ordinary co-owner who no longer sees the loan.
    const after = await loanOf(coOwner, loanId);
    expect(after).toMatchObject({
      role: "lender",
      responsibleLenderId: coOwner.userId,
      agreement: before.agreement,
      period: before.period,
      responsibilityTransfer: null,
    });
    await expect(loanOf(owner, loanId)).rejects.toMatchObject(notFound);
    expect((await loanEvents(loanId)).slice(-3)).toEqual([
      "loan.responsibility_proposed",
      "loan.responsibility_answered",
      "loan.responsibility_transferred",
    ]);
    expect((await eventsFor("loan", loanId)).at(-1)?.payload).toEqual({
      objectId,
      transferId,
      kind: "voluntary",
      fromUserId: owner.userId,
      toUserId: coOwner.userId,
    });

    // The commitment moved with the role (scenario 10).
    await expect(run(leaveObject, coOwner, { objectId })).rejects.toMatchObject(
      conflict,
    );
    await run(leaveObject, owner, { objectId });

    // Only the new lender's receipt ends it now.
    await expect(sayNow(owner, loanId, "received")).rejects.toMatchObject(
      notFound,
    );
    expect((await sayNow(coOwner, loanId, "received")).status).toBe("ended");
    expect(await stored(loanId)).toMatchObject({
      status: "ended",
      end_reason: "returned",
      ended_by_user_id: coOwner.userId,
    });
  });

  it("needs the borrower's consent too for a co-owner who joined after the approval", async () => {
    const { owner, later, borrower, loanId } = await activeLoan();

    const { transferId } = await offer(owner, loanId, later);
    expect((await loanOf(borrower, loanId)).responsibilityTransfer).toEqual(
      expect.objectContaining({ needsBorrowerConsent: true }),
    );

    expect((await accept(later, loanId, transferId)).status).toBe("proposed");
    // Accepting twice changes nothing.
    expect((await accept(later, loanId, transferId)).status).toBe("proposed");
    expect((await stored(loanId)).responsible_lender_id).toBe(owner.userId);

    expect(await accept(borrower, loanId, transferId)).toMatchObject({
      status: "completed",
      responsibleLenderId: later.userId,
    });
    expect((await loanOf(later, loanId)).role).toBe("lender");
  });

  it("lets the borrower consent first, and say no", async () => {
    const first = await activeLoan();
    const { transferId } = await offer(first.owner, first.loanId, first.later);
    expect(
      (await accept(first.borrower, first.loanId, transferId)).status,
    ).toBe("proposed");
    expect((await accept(first.later, first.loanId, transferId)).status).toBe(
      "completed",
    );

    const second = await activeLoan();
    const offered = await offer(second.owner, second.loanId, second.later);
    expect(
      await decline(second.borrower, second.loanId, offered.transferId),
    ).toMatchObject({
      status: "declined",
      responsibleLenderId: second.owner.userId,
    });
    await expect(
      accept(second.later, second.loanId, offered.transferId),
    ).rejects.toMatchObject(conflict);
  });

  it("makes nobody responsible against their will", async () => {
    const { owner, coOwner, borrower, loanId } = await activeLoan();

    const offered = await offer(owner, loanId, coOwner);
    // Nobody but the recipient answers an offer to the circle.
    await expect(
      accept(borrower, loanId, offered.transferId),
    ).rejects.toMatchObject(forbidden);
    await expect(
      accept(owner, loanId, offered.transferId),
    ).rejects.toMatchObject(forbidden);
    await expect(
      withdraw(coOwner, loanId, offered.transferId),
    ).rejects.toMatchObject(forbidden);
    await expect(
      accept(await user(), loanId, offered.transferId),
    ).rejects.toMatchObject(notFound);

    expect((await decline(coOwner, loanId, offered.transferId)).status).toBe(
      "declined",
    );
    expect((await decline(coOwner, loanId, offered.transferId)).status).toBe(
      "declined",
    );

    const again = await offer(owner, loanId, coOwner);
    expect((await withdraw(owner, loanId, again.transferId)).status).toBe(
      "withdrawn",
    );
    expect(await transfers(loanId)).toEqual([
      expect.objectContaining({ status: "declined" }),
      expect.objectContaining({ status: "withdrawn" }),
    ]);
    expect((await stored(loanId)).responsible_lender_id).toBe(owner.userId);
  });

  it("refuses who cannot take the role, neutrally, and only the lender offers", async () => {
    const { owner, coOwner, later, borrower, objectId, loanId } =
      await activeLoan();
    const outsider = await user();
    const blocked = await user();
    await addCoOwner(owner, objectId, blocked);
    await run(blockUser, borrower, { userId: blocked.userId });

    await expect(offer(borrower, loanId, coOwner)).rejects.toMatchObject(
      forbidden,
    );
    await expect(offer(coOwner, loanId, later)).rejects.toMatchObject(notFound);
    for (const target of [outsider, borrower, owner, blocked]) {
      await expect(offer(owner, loanId, target)).rejects.toMatchObject({
        ...conflict,
        fields: ["toUserId"],
      });
    }

    // One change at a time.
    await offer(owner, loanId, coOwner);
    await expect(offer(owner, loanId, later)).rejects.toMatchObject(conflict);
  });

  it("refuses a co-owner the lender is blocked with", async () => {
    const { owner, coOwner, loanId } = await activeLoan();
    await run(blockUser, coOwner, { userId: owner.userId });

    await expect(offer(owner, loanId, coOwner)).rejects.toMatchObject({
      ...conflict,
      fields: ["toUserId"],
    });
  });

  it("lapses an offer that can no longer happen", async () => {
    // The recipient left the object.
    const left = await activeLoan();
    const first = await offer(left.owner, left.loanId, left.coOwner);
    await run(leaveObject, left.coOwner, { objectId: left.objectId });
    expect(
      (await loanOf(left.borrower, left.loanId)).responsibilityTransfer,
    ).toBe(null);
    expect(
      (await accept(left.coOwner, left.loanId, first.transferId)).status,
    ).toBe("lapsed");

    // A block came between the recipient and the borrower.
    const blocked = await activeLoan();
    const second = await offer(blocked.owner, blocked.loanId, blocked.coOwner);
    await run(blockUser, blocked.borrower, { userId: blocked.coOwner.userId });
    expect(
      (await accept(blocked.coOwner, blocked.loanId, second.transferId)).status,
    ).toBe("lapsed");
    expect((await stored(blocked.loanId)).responsible_lender_id).toBe(
      blocked.owner.userId,
    );
    // A new offer is possible once it lapsed.
    await expect(
      offer(blocked.owner, blocked.loanId, blocked.later),
    ).resolves.toMatchObject({ status: "proposed" });

    // The loan ended.
    const cancelled = await coOwnedLoan();
    const third = await offer(
      cancelled.owner,
      cancelled.loanId,
      cancelled.coOwner,
    );
    await run(cancelLoan, cancelled.borrower, { loanId: cancelled.loanId });
    expect(await transfers(cancelled.loanId)).toEqual([
      expect.objectContaining({ status: "lapsed" }),
    ]);
    expect(
      (await accept(cancelled.coOwner, cancelled.loanId, third.transferId))
        .status,
    ).toBe("lapsed");
    await expect(
      offer(cancelled.owner, cancelled.loanId, cancelled.coOwner),
    ).rejects.toMatchObject(conflict);
  });

  it("lapses an offer for good once what it rests on is lost", async () => {
    // A block that is lifted again does not bring the offer back.
    const blocked = await activeLoan();
    const first = await offer(blocked.owner, blocked.loanId, blocked.coOwner);
    await run(blockUser, blocked.borrower, { userId: blocked.coOwner.userId });
    await run(liftUserBlock, blocked.borrower, {
      userId: blocked.coOwner.userId,
    });
    expect(await transfers(blocked.loanId)).toEqual([
      expect.objectContaining({ status: "lapsed" }),
    ]);
    expect(
      (await accept(blocked.coOwner, blocked.loanId, first.transferId)).status,
    ).toBe("lapsed");

    // Nor does owning the object again after leaving it.
    const left = await activeLoan();
    const second = await offer(left.owner, left.loanId, left.coOwner);
    await run(leaveObject, left.coOwner, { objectId: left.objectId });
    await addCoOwner(left.owner, left.objectId, left.coOwner);
    expect(
      (await accept(left.coOwner, left.loanId, second.transferId)).status,
    ).toBe("lapsed");
    expect((await stored(left.loanId)).responsible_lender_id).toBe(
      left.owner.userId,
    );
  });

  it("answers an offer the due receipt ended with its lapse", async () => {
    const { owner, coOwner, borrower, loanId } = await activeLoan();
    const { transferId } = await offer(owner, loanId, coOwner);
    await sayNow(borrower, loanId, "returned");
    await say(owner, loanId, "received");
    kit.advance(undoBuffer);

    expect(await accept(coOwner, loanId, transferId)).toMatchObject({
      status: "lapsed",
      responsibleLenderId: owner.userId,
    });
    expect(await stored(loanId)).toMatchObject({
      status: "ended",
      ended_by_user_id: owner.userId,
    });
  });

  it("hands on the lender's side as it stands", async () => {
    const { owner, coOwner, borrower, loanId } = await coOwnedLoan(2, 4);
    const { amendmentId } = await run(proposeLoanAmendment, owner, {
      loanId,
      agreementVersion: 1,
      period: { start: kit.day(2), end: kit.day(6) },
    });
    const { transferId } = await offer(owner, loanId, coOwner);
    await accept(coOwner, loanId, transferId);

    // The lender's open proposal is the new lender's to withdraw.
    await expect(
      run(withdrawLoanAmendment, owner, { loanId, amendmentId }),
    ).rejects.toMatchObject(notFound);
    expect(
      (await run(withdrawLoanAmendment, coOwner, { loanId, amendmentId }))
        .status,
    ).toBe("withdrawn");
    expect((await loanOf(borrower, loanId)).responsibleLenderId).toBe(
      coOwner.userId,
    );
  });

  it("lapses the former lender's waiting receipt instead of making it in someone else's name", async () => {
    const { owner, coOwner, loanId } = await activeLoan();
    expect((await say(owner, loanId, "received")).pending).not.toBeNull();

    const { transferId } = await offer(owner, loanId, coOwner);
    await accept(coOwner, loanId, transferId);
    kit.advance(undoBuffer);
    await settle(coOwner, loanId);

    expect((await stored(loanId)).status).toBe("active");
    expect(
      await db
        .selectFrom("app.loan_return_confirmations")
        .select("status")
        .where("loan_id", "=", loanId)
        .execute(),
    ).toEqual([{ status: "lapsed" }]);
  });
});

describe("takeover while the lender is unavailable (PS-LOAN-009)", () => {
  it("is not possible while the lender is available", async () => {
    const { coOwner, later, loanId } = await activeLoan();

    await expect(takeOver(coOwner, loanId)).rejects.toMatchObject(notFound);
    await expect(takeOver(later, loanId)).rejects.toMatchObject(notFound);
    await expect(sayNow(coOwner, loanId, "received")).rejects.toMatchObject(
      notFound,
    );
    expect(await coOwnerLoans(coOwner)).toEqual([]);
  });

  it("makes a co-owner of the circle responsible at once, for good", async () => {
    const { owner, coOwner, borrower, objectId, loanId } = await activeLoan();
    await unavailable(loanId, owner);

    await expect(takeOver(borrower, loanId)).rejects.toMatchObject(forbidden);
    await expect(takeOver(owner, loanId)).rejects.toMatchObject(forbidden);
    expect(await coOwnerLoans(coOwner)).toEqual([
      expect.objectContaining({
        loanId,
        mayTakeOver: true,
        mayConfirmReceipt: true,
      }),
    ]);

    const taken = await takeOver(coOwner, loanId);
    expect(taken).toMatchObject({
      status: "completed",
      responsibleLenderId: coOwner.userId,
    });
    // The borrower is told, not asked.
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.responsibility_transferred",
      payload: {
        objectId,
        transferId: taken.transferId,
        kind: "takeover",
        fromUserId: owner.userId,
        toUserId: coOwner.userId,
      },
    });
    expect((await loanOf(borrower, loanId)).responsibleLenderId).toBe(
      coOwner.userId,
    );

    // The former lender coming back changes nothing by itself; only a new,
    // explicit transfer moves the role back.
    await expect(takeOver(owner, loanId)).rejects.toMatchObject(notFound);
    expect(await coOwnerLoans(owner)).toEqual([]);
    const back = await offer(coOwner, loanId, owner);
    expect((await accept(owner, loanId, back.transferId)).status).toBe(
      "completed",
    );
    expect((await stored(loanId)).responsible_lender_id).toBe(owner.userId);
  });

  it("needs the borrower's consent for a co-owner who joined later", async () => {
    const { owner, later, borrower, loanId } = await activeLoan();
    await unavailable(loanId, owner);

    const taken = await takeOver(later, loanId);
    expect(taken).toMatchObject({
      status: "proposed",
      responsibleLenderId: owner.userId,
    });
    expect(await takeOver(later, loanId)).toEqual(taken);
    expect(await coOwnerLoans(later)).toEqual([
      expect.objectContaining({
        transfer: expect.objectContaining({
          kind: "takeover",
          needsBorrowerConsent: true,
          recipientAccepted: true,
          borrowerConsented: false,
        }),
        mayTakeOver: false,
        mayConfirmReceipt: false,
      }),
    ]);
    // Taking over is the recipient's own act; only the borrower answers.
    await expect(accept(owner, loanId, taken.transferId)).rejects.toMatchObject(
      forbidden,
    );

    expect((await accept(borrower, loanId, taken.transferId)).status).toBe(
      "completed",
    );
    expect((await stored(loanId)).responsible_lender_id).toBe(later.userId);
  });

  it("lets a takeover replace an offer the unavailable lender left open", async () => {
    const { owner, coOwner, later, loanId } = await activeLoan();
    const offered = await offer(owner, loanId, later);
    await unavailable(loanId, owner);

    expect((await takeOver(coOwner, loanId)).status).toBe("completed");
    expect(await transfers(loanId)).toEqual([
      expect.objectContaining({ kind: "voluntary", status: "lapsed" }),
      expect.objectContaining({ kind: "takeover", status: "completed" }),
    ]);
    expect((await accept(later, loanId, offered.transferId)).status).toBe(
      "lapsed",
    );
  });
});

describe("a co-owner's narrow receipt (PS-LOAN-015)", () => {
  it("ends the loan without making the co-owner responsible", async () => {
    const { owner, coOwner, borrower, objectId, loanId } = await activeLoan();
    await sayNow(borrower, loanId, "returned");
    await unavailable(loanId, owner);

    // It waits in its undo buffer like any receipt, and only they see it.
    const waiting = await say(coOwner, loanId, "received");
    expect(waiting.pending).toMatchObject({ outcome: "received" });
    expect((await coOwnerLoans(coOwner))[0]?.pending).toMatchObject({
      outcome: "received",
    });
    expect((await loanOf(borrower, loanId)).return.pending).toBeNull();
    await run(undoReturn, coOwner, { loanId });
    expect((await coOwnerLoans(coOwner))[0]?.pending).toBeNull();

    expect((await sayNow(coOwner, loanId, "received")).status).toBe("ended");
    expect(await stored(loanId)).toEqual({
      responsible_lender_id: owner.userId,
      status: "ended",
      end_reason: "returned",
      ended_by_user_id: coOwner.userId,
    });
    expect(await loanOf(borrower, loanId)).toMatchObject({
      responsibleLenderId: owner.userId,
      ending: { reason: "returned", endedBy: null },
      return: {
        borrower: { outcome: "returned", reportedAs: "party" },
        lender: { outcome: "received", reportedAs: "co_owner" },
      },
    });
    expect(
      (await eventsFor("loan", loanId)).find(
        (event) =>
          event.event_type === "loan.return_reported" &&
          (event.payload as { reportedAs: string }).reportedAs === "co_owner",
      )?.payload,
    ).toEqual({
      objectId,
      role: "lender",
      outcome: "received",
      agreementVersion: 1,
      reportedAs: "co_owner",
    });

    // Nothing beyond the receipt: no view of the loan, no other statement.
    await expect(loanOf(coOwner, loanId)).rejects.toMatchObject(notFound);
    await expect(sayNow(coOwner, loanId, "not_received")).rejects.toMatchObject(
      notFound,
    );
    // The parties can still contradict it later (PS-LOAN-017).
    expect((await sayNow(owner, loanId, "not_received")).status).toBe(
      "disputed",
    );
  });

  it("ends with the loan", async () => {
    const { owner, coOwner, borrower, loanId } = await activeLoan();
    await sayNow(borrower, loanId, "returned");
    await unavailable(loanId, owner);
    await sayNow(coOwner, loanId, "received");

    await expect(sayNow(coOwner, loanId, "received")).rejects.toMatchObject(
      notFound,
    );
    await expect(takeOver(coOwner, loanId)).rejects.toMatchObject(notFound);
    expect(await coOwnerLoans(coOwner)).toEqual([]);
  });

  it("is only for the circle, and lapses when the role is lost", async () => {
    const { owner, coOwner, later, objectId, loanId } = await activeLoan();
    await unavailable(loanId, owner);

    await expect(sayNow(later, loanId, "received")).rejects.toMatchObject(
      notFound,
    );

    await say(coOwner, loanId, "received");
    await run(leaveObject, coOwner, { objectId });
    kit.advance(undoBuffer);
    await settle(owner, loanId);

    expect((await stored(loanId)).status).toBe("active");
    expect(
      await db
        .selectFrom("app.loan_return_confirmations")
        .select(["status", "reported_as"])
        .where("loan_id", "=", loanId)
        .execute(),
    ).toEqual([{ status: "lapsed", reported_as: "co_owner" }]);
  });

  it("lets the unavailable lender still confirm, and makes one side wait for the other", async () => {
    const { owner, coOwner, loanId } = await activeLoan();
    await unavailable(loanId, owner);

    await say(coOwner, loanId, "received");
    await expect(sayNow(owner, loanId, "received")).rejects.toMatchObject(
      conflict,
    );
    await run(undoReturn, coOwner, { loanId });
    expect((await sayNow(owner, loanId, "received")).status).toBe("ended");
    expect((await stored(loanId)).ended_by_user_id).toBe(owner.userId);
  });
});

describe("minimum access (PS-LOAN-021, quality gate B)", () => {
  it("keeps what the loan needs when membership, publication and contact end", async () => {
    const setup = await activeLoan();
    const { owner, coOwner, borrower, environmentId, loanId } = setup;

    // The borrower leaves the environment, the lender leaves it too (which
    // unpublishes the object), and the borrower blocks the lender.
    await run(leaveEnvironment, borrower, { environmentId });
    await run(leaveEnvironment, owner, { environmentId });
    await run(blockUser, borrower, { userId: owner.userId });

    expect((await loanOf(borrower, loanId)).status).toBe("active");
    expect((await loanOf(owner, loanId)).status).toBe("active");
    expect((await sayNow(borrower, loanId, "returned")).status).toBe(
      "awaiting_return",
    );

    // The lender can still hand the role on to a co-owner the borrower has
    // no block with, who then settles the return.
    const { transferId } = await offer(owner, loanId, coOwner);
    await accept(coOwner, loanId, transferId);
    expect((await sayNow(coOwner, loanId, "received")).status).toBe("ended");
  });
});

describe("concurrency (docs/architecture/05)", () => {
  it("moves the role once when the recipient and the borrower answer at once", async () => {
    const { owner, later, borrower, loanId } = await activeLoan();
    const { transferId } = await offer(owner, loanId, later);

    const results = await Promise.allSettled([
      accept(later, loanId, transferId),
      accept(borrower, loanId, transferId),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect((await stored(loanId)).responsible_lender_id).toBe(later.userId);
    expect(
      (await loanEvents(loanId)).filter(
        (type) => type === "loan.responsibility_transferred",
      ),
    ).toHaveLength(1);
  });

  it("never leaves the role with someone who left the object", async () => {
    const { owner, coOwner, objectId, loanId } = await activeLoan();
    const { transferId } = await offer(owner, loanId, coOwner);

    await Promise.allSettled([
      accept(coOwner, loanId, transferId),
      run(leaveObject, coOwner, { objectId }),
    ]);

    const { responsible_lender_id } = await stored(loanId);
    const owners = await db
      .selectFrom("app.object_owners")
      .select("user_id")
      .where("object_id", "=", objectId)
      .execute();
    expect(owners.map((row) => row.user_id)).toContain(responsible_lender_id);
  });

  it("lets only one co-owner take over", async () => {
    // Two co-owners of the circle: both were owners at the approval.
    const setup = await published();
    const first = await user();
    const second = await user();
    await addCoOwner(setup.owner, setup.objectId, first);
    await addCoOwner(setup.owner, setup.objectId, second);
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(2, 4),
    );
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId,
    });
    await unavailable(loanId, setup.owner);

    const results = await Promise.allSettled([
      takeOver(first, loanId),
      takeOver(second, loanId),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await transfers(loanId)).toEqual([
      expect.objectContaining({ kind: "takeover", status: "completed" }),
    ]);
    expect([first.userId, second.userId]).toContain(
      (await stored(loanId)).responsible_lender_id,
    );
  });

  it("never lets an offer cross a block between the recipient and the borrower", async () => {
    const { owner, coOwner, borrower, loanId } = await activeLoan();

    await Promise.allSettled([
      offer(owner, loanId, coOwner),
      run(blockUser, borrower, { userId: coOwner.userId }),
    ]);

    const open = await db
      .selectFrom("app.loan_lender_transfers")
      .select("id")
      .where("loan_id", "=", loanId)
      .executeTakeFirst();
    if (open) {
      expect((await accept(coOwner, loanId, open.id)).status).toBe("lapsed");
    }
    expect((await stored(loanId)).responsible_lender_id).toBe(owner.userId);
  });
});

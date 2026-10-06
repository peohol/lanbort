import { randomUUID } from "node:crypto";
import { loanHistorySchema, loanSchema } from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { acceptLoanAmendment, proposeLoanAmendment } from "./amendments";
import { reportHandover } from "./handover";
import { readLoanHistory } from "./history";
import { readLoan } from "./queries";
import {
  acceptResponsibilityTransfer,
  offerResponsibility,
} from "./responsibility";
import { approveLoanRequest } from "./approval";
import { reportReturn } from "./return";

/**
 * WP-64: a loan's human status, next steps and timeline (UX-IA-008,
 * UX-INT-001, UX-INT-004, UX-INT-008). The timeline is built from the
 * loan's own domain events for its parties only, names the borrower and the
 * lenders but never other co-owners or a former user, and never shows what
 * the events hold about other loans. The steps offered are the ones the
 * commands would accept.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

// Waiting return confirmations must stay waiting while other files run
// their scheduled jobs, so this file's clock starts far from theirs.
const kit = loanTestKit(db, { startInDays: 730 });
const {
  run,
  tick,
  user,
  member,
  addCoOwner,
  ask,
  environmentOrigin,
  dated,
  reservedLoan,
  advance,
  advanceDays,
} = kit;

const notFound = { code: "not_found" };

const loanOf = async (actor: UserActor, loanId: string) =>
  loanSchema.parse(
    await executeQuery(tick(), readLoan, { actor, input: { loanId } }),
  );

const historyOf = async (actor: UserActor, loanId: string, cursor?: string) =>
  loanHistorySchema.parse(
    await executeQuery(tick(), readLoanHistory, {
      actor,
      input: { loanId, ...(cursor ? { cursor } : {}) },
    }),
  );

/** The events, oldest first, as the timeline names them. */
const events = async (actor: UserActor, loanId: string) =>
  (await historyOf(actor, loanId)).entries.map(({ event }) => event).reverse();

const handOver = (actor: UserActor, loanId: string) =>
  run(reportHandover, actor, {
    loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });

describe("timeline (UX-IA-008, UX-INT-008)", () => {
  it("tells the loan's course from the request on, newest first, with who did what", async () => {
    const { owner, borrower, loanId } = await reservedLoan(0, 2);
    await handOver(owner, loanId);

    const history = await historyOf(borrower, loanId);
    expect(history.nextCursor).toBeNull();
    expect(history.entries.map(({ event }) => event)).toEqual([
      "handed_over",
      "handover_reported",
      "reserved",
      "requested",
    ]);
    const [handedOver, reported, reserved, requested] = history.entries;
    expect(handedOver?.actor).toEqual({
      you: false,
      role: "lender",
      realName: "Test Testesen",
    });
    expect(reported).toMatchObject({
      side: "lender",
      outcome: "handed_over",
    });
    expect(reserved?.actor?.role).toBe("lender");
    expect(requested?.actor).toEqual({
      you: true,
      role: "borrower",
      realName: "Test Testesen",
    });
    // The lender sees the same course, from their side.
    expect(
      (await historyOf(owner, loanId)).entries.map(({ actor }) => actor?.you),
    ).toEqual([true, true, true, false]);
  });

  it("shows the period an agreed change gave the loan", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const { amendmentId } = await run(proposeLoanAmendment, borrower, {
      loanId,
      agreementVersion: 1,
      period: { start: kit.day(3), end: kit.day(6) },
    });
    await run(acceptLoanAmendment, owner, { loanId, amendmentId });

    const [accepted, proposed] = (await historyOf(borrower, loanId)).entries;
    const period = { start: kit.day(3), end: kit.day(6) };
    expect(proposed).toMatchObject({ event: "amendment_proposed", period });
    expect(accepted).toMatchObject({
      event: "amendment_accepted",
      period,
      actor: { role: "lender", you: false },
    });
  });

  it("names a later co-owner only once they are the responsible lender", async () => {
    const { owner, borrower, objectId, loanId } = await reservedLoan(0, 2);
    const coOwner = await user();
    await addCoOwner(owner, objectId, coOwner);
    await handOver(owner, loanId);
    const { transferId } = await run(offerResponsibility, owner, {
      loanId,
      toUserId: coOwner.userId,
    });

    const proposed = (await historyOf(borrower, loanId)).entries[0];
    expect(proposed).toMatchObject({
      event: "responsibility_proposed",
      transfer: {
        kind: "voluntary",
        from: null,
        to: { you: false, role: "co_owner", realName: null },
      },
    });

    // The borrower consents to a co-owner who joined after the approval.
    const loan = await loanOf(borrower, loanId);
    expect(loan.actions.responsibility).toEqual(["accept", "decline"]);
    await run(acceptResponsibilityTransfer, coOwner, { loanId, transferId });
    await run(acceptResponsibilityTransfer, borrower, { loanId, transferId });

    const entries = (await historyOf(borrower, loanId)).entries;
    expect(entries[0]).toMatchObject({
      event: "responsibility_transferred",
      transfer: {
        from: { role: "lender", realName: "Test Testesen" },
        to: { role: "lender", realName: "Test Testesen" },
      },
    });
    // Once a lender, they are named throughout.
    expect(
      entries.find(({ event }) => event === "responsibility_proposed")?.transfer
        ?.to,
    ).toEqual({ you: false, role: "lender", realName: "Test Testesen" });
    // The new lender sees it; the former one no longer does.
    expect((await historyOf(coOwner, loanId)).entries[0]?.event).toBe(
      "responsibility_transferred",
    );
    await expect(historyOf(owner, loanId)).rejects.toMatchObject(notFound);
  });

  it("shows a former user without a name (UX-PRIV-010)", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    await db
      .deleteFrom("app.profiles")
      .where("user_id", "=", owner.userId)
      .execute();

    expect((await loanOf(borrower, loanId)).parties).toEqual({
      borrower: { realName: "Test Testesen", profileId: borrower.userId },
      lender: { realName: null, profileId: null },
    });
    expect((await historyOf(borrower, loanId)).entries[0]?.actor).toEqual({
      you: false,
      role: "lender",
      realName: null,
    });
  });

  it("is only for the loan's parties", async () => {
    const { owner, admin, loanId, objectId } = await reservedLoan(2, 4);
    const coOwner = await user();
    await addCoOwner(owner, objectId, coOwner);

    for (const outsider of [await user(), admin, coOwner]) {
      await expect(historyOf(outsider, loanId)).rejects.toMatchObject(notFound);
    }
    await expect(historyOf(owner, randomUUID())).rejects.toMatchObject(
      notFound,
    );
  });

  it("never pages into another loan's events", async () => {
    const first = await reservedLoan(2, 4);
    const second = await reservedLoan(2, 4);
    const foreign = (await historyOf(second.borrower, second.loanId))
      .entries[0];

    expect(await historyOf(first.borrower, first.loanId, foreign?.id)).toEqual({
      entries: [],
      nextCursor: null,
    });
  });

  it("pages older entries by the last one shown", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    const all = await events(borrower, loanId);
    const newest = (await historyOf(owner, loanId)).entries[0];
    const older = await historyOf(owner, loanId, newest?.id);

    expect(older.entries.map(({ event }) => event).reverse()).toEqual(
      all.slice(0, -1),
    );
  });
});

describe("next steps (UX-INT-001)", () => {
  it("offers only what the commands would accept, as the loan moves on", async () => {
    const { owner, borrower, loanId } = await reservedLoan(1, 3);

    // Before the handover day there is nothing to say yet.
    expect((await loanOf(borrower, loanId)).actions).toEqual({
      handover: [],
      return: [],
      undoReturn: false,
      amendment: [],
      responsibility: [],
      confirmControl: false,
    });

    advanceDays(1);
    expect((await loanOf(borrower, loanId)).actions.handover).toEqual([
      "handed_over",
    ]);

    await handOver(borrower, loanId);
    const active = await loanOf(owner, loanId);
    // The lender has not spoken, so may still confirm or contradict it; the
    // borrower said it already.
    expect(active.actions.handover).toEqual(["handed_over", "not_handed_over"]);
    expect(active.actions.return).toEqual(["received"]);
    expect((await loanOf(borrower, loanId)).actions).toMatchObject({
      handover: [],
      return: ["returned"],
    });

    await run(reportReturn, borrower, {
      loanId,
      agreementVersion: 1,
      outcome: "returned",
    });
    // The confirmation waits in its undo buffer.
    expect((await loanOf(borrower, loanId)).actions).toMatchObject({
      return: [],
      undoReturn: true,
    });
    expect((await loanOf(owner, loanId)).actions).toMatchObject({
      return: ["received"],
      undoReturn: false,
    });
  });

  it("lets the other side answer a proposal, and an inactive account only decline it", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);
    await run(proposeLoanAmendment, owner, {
      loanId,
      agreementVersion: 1,
      period: { start: kit.day(2), end: kit.day(5) },
    });

    expect((await loanOf(owner, loanId)).actions.amendment).toEqual([]);
    expect((await loanOf(borrower, loanId)).actions.amendment).toEqual([
      "accept",
      "decline",
    ]);
    expect(
      (await loanOf({ ...borrower, accountStatus: "deactivated" }, loanId))
        .actions.amendment,
    ).toEqual(["decline"]);
  });

  it("says nothing more about a loan that has ended", async () => {
    const { owner, borrower, loanId } = await reservedLoan(0, 2);
    await handOver(owner, loanId);
    await run(reportReturn, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "received",
      immediately: true,
    });

    const ended = await loanOf(borrower, loanId);
    expect(ended.status).toBe("ended");
    expect(ended.actions.handover).toEqual([]);
    // A problem with the confirmed return is a new statement (PS-LOAN-017).
    expect(ended.actions.return).toEqual(["still_has"]);
    expect(await events(borrower, loanId)).toEqual(
      expect.arrayContaining(["return_reported", "returned"]),
    );
  });
});

describe("after time has passed (Codex review of #34)", () => {
  it("credits a confirmation that took effect late to whoever made it", async () => {
    const { owner, borrower, loanId } = await reservedLoan(0, 2);
    await handOver(owner, loanId);
    await run(reportReturn, borrower, {
      loanId,
      agreementVersion: 1,
      outcome: "returned",
    });
    advance(31_000);

    // Its undo time is over: it counts as made, so it is not offered.
    const due = await loanOf(borrower, loanId);
    expect(due.actions.undoReturn).toBe(false);

    // The lender's statement records the borrower's due confirmation first.
    await run(reportReturn, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "received",
      immediately: true,
    });
    const reports = (await historyOf(borrower, loanId)).entries.filter(
      ({ event }) => event === "return_reported",
    );
    expect(
      reports.map(({ outcome, actor }) => [outcome, actor?.role, actor?.you]),
    ).toEqual([
      ["received", "lender", false],
      ["returned", "borrower", true],
    ]);
  });

  it("offers only to decline a proposal whose days another loan has taken", async () => {
    const setup = await reservedLoan(2, 4);
    const { owner, borrower, loanId, objectId, environmentId, admin } = setup;
    await run(proposeLoanAmendment, owner, {
      loanId,
      agreementVersion: 1,
      period: { start: kit.day(2), end: kit.day(6) },
    });
    expect((await loanOf(borrower, loanId)).actions.amendment).toEqual([
      "accept",
      "decline",
    ]);

    const other = await member(environmentId, admin);
    const { requestId } = await ask(
      other,
      objectId,
      environmentOrigin(environmentId),
      dated(6, 7),
    );
    await run(approveLoanRequest, owner, { requestId });

    expect((await loanOf(borrower, loanId)).actions.amendment).toEqual([
      "decline",
    ]);
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { calendarDate } from "../objects/availability";
import { leaveObject } from "../objects/co-owners";
import {
  loadCommitments,
  objectCommitmentSources,
} from "../objects/commitments";
import { consentToObjectDeletion } from "../objects/deletion";
import { submitLoanReview } from "../reviews/commands";
import { readLoanReviews } from "../reviews/queries";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { approveLoanRequest } from "./approval";
import { reportHandover } from "./handover";
import { unresolvedEndingProcess } from "./policies";
import { readLoan } from "./queries";
import { listCoOwnerLoans } from "./responsibility";
import { loadDerivedAvailability } from "./store";
import { confirmLoanControl, endLoanUnresolved } from "./unresolved";

/**
 * WP-45: the administrative unresolved ending (PS-LOAN-018) and the owner's
 * confirmation of control after it (PS-LOAN-019), the part of quality gate
 * B the earlier loan packages left to WP-45. Ending a loan this way says
 * nothing about who was right; until an owner confirms having the object
 * back it takes no new loans, while loans already approved stay as they are.
 * Who may end a loan this way is not decided (OD-0017): only its process
 * can, and nothing in the product runs it.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  member,
  addCoOwner,
  environmentOrigin,
  ask,
  day,
  dated,
  reservedLoan,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const invalidInput = { code: "invalid_input" };
const oneDay = 24 * 60 * 60 * 1000;
const unresolved = systemActor(unresolvedEndingProcess);

const endUnresolved = (loanId: string) =>
  run(endLoanUnresolved, unresolved, { loanId });

const confirm = (actor: UserActor, loanId: string) =>
  run(confirmLoanControl, actor, { loanId });

const loanOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoan, { actor, input: { loanId } });

const effective = async (objectId: string) =>
  (await loadDerivedAvailability(db, objectId, calendarDate(kit.now())))
    .effective;

/** A loan for days 1–3 whose handover the parties dispute, and a co-owner. */
async function disputedLoan() {
  const loan = await reservedLoan(1, 3);
  const coOwner = await member(loan.environmentId, loan.admin);
  await addCoOwner(loan.owner, loan.objectId, coOwner);
  kit.advance(2 * oneDay);
  await run(reportHandover, loan.owner, {
    loanId: loan.loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });
  await run(reportHandover, loan.borrower, {
    loanId: loan.loanId,
    agreementVersion: 1,
    outcome: "not_handed_over",
  });

  return { ...loan, coOwner };
}

describe("an administratively unresolved loan (PS-LOAN-018–019)", () => {
  it("ends by no party, and blocks the object until an owner confirms having it back", async () => {
    const { owner, borrower, coOwner, objectId, loanId, environmentId } =
      await disputedLoan();
    const later = await member(environmentId, owner);
    const request = () =>
      ask(later, objectId, environmentOrigin(environmentId), dated(6, 7));

    const ended = await endUnresolved(loanId);
    expect(ended).toEqual({ loanId, endedAt: kit.now().toISOString() });
    // Ending it again returns the same ending.
    expect(await endUnresolved(loanId)).toEqual(ended);

    expect(await loanOf(borrower, loanId)).toMatchObject({
      status: "ended",
      ending: { reason: "unresolved", endedBy: null },
      // The statements stay as they were: nobody was found right.
      handover: {
        borrower: { outcome: "not_handed_over" },
        lender: { outcome: "handed_over" },
      },
      control: { confirmedAt: null },
    });
    expect((await eventsFor("loan", loanId)).at(-1)).toEqual({
      event_type: "loan.ended_unresolved",
      payload: { objectId, otherLoanIds: [] },
    });

    // Nothing is free until an owner has it back.
    expect(await effective(objectId)).toEqual([]);
    await expect(request()).rejects.toMatchObject(conflict);

    // A co-owner who is not a party sees what they may do, and nothing else.
    expect(
      (
        await executeQuery(tick(), listCoOwnerLoans, {
          actor: coOwner,
          input: {},
        })
      ).items,
    ).toEqual([
      expect.objectContaining({
        loanId,
        status: "ended",
        mayConfirmControl: true,
        mayTakeOver: false,
        mayConfirmReceipt: false,
      }),
    ]);
    await expect(confirm(borrower, loanId)).rejects.toMatchObject(forbidden);
    await expect(confirm(later, loanId)).rejects.toMatchObject(notFound);

    const confirmed = await confirm(coOwner, loanId);
    expect(confirmed).toEqual({ loanId, confirmedAt: kit.now().toISOString() });
    expect(await confirm(owner, loanId)).toEqual(confirmed);
    expect((await loanOf(owner, loanId)).control).toEqual({
      confirmedAt: confirmed.confirmedAt,
    });
    expect(
      (
        await executeQuery(tick(), listCoOwnerLoans, {
          actor: coOwner,
          input: {},
        })
      ).items,
    ).toEqual([]);

    expect(await effective(objectId)).toEqual([{ from: day(0), until: null }]);
    const { requestId } = await request();
    expect(await run(approveLoanRequest, owner, { requestId })).toMatchObject({
      status: "approved",
    });
  });

  it("binds its lender and the object until an owner confirms having it back", async () => {
    const { owner, coOwner, objectId, loanId } = await disputedLoan();
    const leave = () => run(leaveObject, owner, { objectId });
    const consent = () => run(consentToObjectDeletion, coOwner, { objectId });
    await endUnresolved(loanId);

    // PS-OBJ-010/011: the loan still needs following up, so its lender
    // cannot leave the object and nobody can delete it.
    await expect(leave()).rejects.toMatchObject(conflict);
    await expect(consent()).rejects.toMatchObject(conflict);
    expect(
      await loadCommitments(db, objectId, objectCommitmentSources),
    ).toEqual([{ responsibleOwnerId: owner.userId }]);

    await confirm(owner, loanId);
    expect(
      await loadCommitments(db, objectId, objectCommitmentSources),
    ).toEqual([]);
    await consent();
    await leave();
    expect(
      await db
        .selectFrom("app.object_owners")
        .select("user_id")
        .where("object_id", "=", objectId)
        .execute(),
    ).toEqual([{ user_id: coOwner.userId }]);
  });

  it("lets both parties review only what is not in dispute, marked as unresolved (PS-TRUST-001)", async () => {
    const { owner, borrower, loanId } = await disputedLoan();
    const review = (actor: UserActor, dimensions: readonly string[]) =>
      run(submitLoanReview, actor, {
        loanId,
        scores: dimensions.map((dimension) => ({ dimension, score: 4 })),
      });
    await endUnresolved(loanId);

    for (const actor of [borrower, owner]) {
      expect(
        (
          await executeQuery(tick(), readLoanReviews, {
            actor,
            input: { loanId },
          })
        ).window,
      ).toMatchObject({
        status: "open",
        basis: "unresolved",
        dimensions: ["communication"],
      });
    }

    // Whether it was handed over, on time or as described is the dispute.
    await expect(
      review(borrower, ["available_at_handover", "communication"]),
    ).rejects.toMatchObject(invalidInput);
    expect(await review(borrower, ["communication"])).toMatchObject({
      status: "hidden",
    });
    expect(await review(owner, ["communication"])).toMatchObject({
      status: "published",
    });
  });

  it("ends only a loan whose handover or return is unsettled, and only by its process", async () => {
    const { owner, borrower, loanId } = await reservedLoan(2, 4);

    await expect(endUnresolved(loanId)).rejects.toMatchObject(conflict);
    await expect(
      run(endLoanUnresolved, owner, { loanId }),
    ).rejects.toMatchObject(forbidden);
    // A loan that did not end unresolved has nothing to confirm.
    await expect(confirm(owner, loanId)).rejects.toMatchObject(conflict);
    await expect(confirm(borrower, loanId)).rejects.toMatchObject(forbidden);
    expect((await loanOf(owner, loanId)).control).toBeNull();

    // Nobody said anything after the handover day: unsettled too.
    const silent = await reservedLoan(1, 3);
    kit.advance(2 * oneDay);
    expect(await endUnresolved(silent.loanId)).toMatchObject({
      loanId: silent.loanId,
    });
    expect((await loanOf(silent.owner, silent.loanId)).ending).toMatchObject({
      reason: "unresolved",
      endedBy: null,
    });
  });

  it("does not race the parties settling the handover after all", async () => {
    const { borrower, loanId } = await disputedLoan();

    const results = await Promise.allSettled([
      endUnresolved(loanId),
      run(reportHandover, borrower, {
        loanId,
        agreementVersion: 1,
        outcome: "handed_over",
      }),
    ]);
    const stored = await db
      .selectFrom("app.loans")
      .select(["status", "end_reason"])
      .where("id", "=", loanId)
      .executeTakeFirstOrThrow();

    // Whichever ran first, the other saw its result and was turned away.
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(stored).toEqual(
      results[0]?.status === "fulfilled"
        ? { status: "ended", end_reason: "unresolved" }
        : { status: "active", end_reason: null },
    );
  });
});

import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import {
  claimCase,
  closeCase,
  openCaseRound,
  reportUnavailability,
  requestLoanMediation,
  writeCaseEntry,
} from "../cases/commands";
import { executeQuery } from "../commands/query";
import { approveLoanRequest } from "../loans/approval";
import { reportHandover } from "../loans/handover";
import { readLoan } from "../loans/queries";
import {
  listCoOwnerLoans,
  offerResponsibility,
  takeOverResponsibility,
} from "../loans/responsibility";
import { reportReturn } from "../loans/return";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";

/**
 * PS-ADM-007–008, OD-0003: access for a representative of a user who has
 * died or is permanently unavailable is not part of the pilot. What proof
 * that takes is not decided, so the special process is off: a report starts
 * a confidential verification case and nothing else. Not even once a steward
 * has handled and closed it does anyone (the reporter, a co-owner or the
 * steward) get access to the user's account, loans or private information,
 * or act in their place. Nothing records the lender as unavailable either
 * (OD-0016), so a co-owner who reports cannot take the loan over.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const { run, tick, user, addCoOwner, environmentOrigin, ask, dated } = kit;

const notFound = { code: "not_found" };

const loanOf = (actor: UserActor, loanId: string) =>
  executeQuery(tick(), readLoan, { actor, input: { loanId } });

/**
 * Anna lends the trailer she owns with Bo to Cia, handed over today, and
 * then may have died.
 */
async function activeLoan() {
  const setup = await kit.published();
  const coOwner = await user();
  await addCoOwner(setup.owner, setup.objectId, coOwner);
  const { requestId } = await ask(
    setup.borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dated(0, 2),
  );
  const { loanId } = await run(approveLoanRequest, setup.owner, { requestId });
  await run(reportHandover, setup.owner, {
    loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });

  return { ...setup, coOwner, loanId };
}

/** What the reported user's account and loan are, as stored. */
async function standing(userId: string, loanId: string) {
  const [account, changes, loan, unavailability, events] = await Promise.all([
    db
      .selectFrom("app.users")
      .select(["status", "status_reason"])
      .where("id", "=", userId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("app.account_status_changes")
      .select("id")
      .where("user_id", "=", userId)
      .execute(),
    db
      .selectFrom("app.loans")
      .select(["status", "responsible_lender_id", "borrower_user_id"])
      .where("id", "=", loanId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("app.loan_lender_unavailability")
      .select("loan_id")
      .where("loan_id", "=", loanId)
      .execute(),
    db
      .selectFrom("app.audit_events")
      .select(["event_type", "resource_type"])
      .where((eb) =>
        eb.or([
          eb.and([
            eb("resource_type", "=", "user"),
            eb("resource_id", "=", userId),
          ]),
          eb.and([
            eb("resource_type", "=", "loan"),
            eb("resource_id", "=", loanId),
          ]),
        ]),
      )
      .orderBy("position")
      .execute(),
  ]);

  return { account, changes, loan, unavailability, events };
}

describe("representative access while OD-0003 is open (PS-ADM-007–008)", () => {
  it("is given to nobody, not even after a steward has closed the report", async () => {
    const { owner, coOwner, borrower, loanId } = await activeLoan();
    const steward = await kit.steward();
    const before = await standing(owner.userId, loanId);

    // Both who know Anna report it; a steward asks, gets an answer and closes.
    const { caseId } = await run(reportUnavailability, coOwner, {
      userId: owner.userId,
      body: "Anna gikk bort i forrige uke.",
    });
    await run(reportUnavailability, borrower, {
      userId: owner.userId,
      body: "Jeg får ikke levert tilbake tilhengeren til Anna.",
    });
    await run(claimCase, steward, { caseId });
    await run(writeCaseEntry, steward, {
      caseId,
      body: "Har du dokumentasjon?",
      audience: "parties",
    });
    await run(openCaseRound, steward, { caseId });
    await run(writeCaseEntry, coOwner, {
      caseId,
      body: "Jeg har en dødsannonse, og jeg er arvingen hennes.",
    });
    await run(closeCase, steward, { caseId, body: "Saken er avsluttet." });

    // Her account and the loan are as they were, and nothing says otherwise.
    expect(await standing(owner.userId, loanId)).toEqual(before);
    expect(before.account).toEqual({ status: "active", status_reason: null });
    expect(before.loan.responsible_lender_id).toBe(owner.userId);
    expect(before.unavailability).toEqual([]);

    // The co-owner who reported cannot take over, receive or see the loan.
    await expect(
      run(takeOverResponsibility, coOwner, { loanId }),
    ).rejects.toMatchObject(notFound);
    await expect(
      run(reportReturn, coOwner, {
        loanId,
        agreementVersion: 1,
        outcome: "received",
        immediately: true,
      }),
    ).rejects.toMatchObject(notFound);
    expect(
      (
        await executeQuery(tick(), listCoOwnerLoans, {
          actor: coOwner,
          input: {},
        })
      ).items,
    ).toEqual([]);

    // Neither they nor the steward see the loan or act in Anna's place.
    for (const actor of [coOwner, steward]) {
      await expect(loanOf(actor, loanId)).rejects.toMatchObject(notFound);
      await expect(
        run(requestLoanMediation, actor, { loanId, body: "På vegne av Anna" }),
      ).rejects.toMatchObject(notFound);
      await expect(
        run(offerResponsibility, actor, { loanId, toUserId: coOwner.userId }),
      ).rejects.toMatchObject(notFound);
    }

    // The loan is still Anna's and Cia's, as before.
    expect(await loanOf(borrower, loanId)).toMatchObject({
      responsibleLenderId: owner.userId,
    });
    expect(await loanOf(owner, loanId)).toMatchObject({
      responsibleLenderId: owner.userId,
    });
  });
});

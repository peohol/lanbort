import { randomUUID } from "node:crypto";
import {
  loanConditionReportsSchema,
  loanHistorySchema,
} from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import type { UserActor } from "../actor";
import { executeQuery } from "../commands/query";
import { connectTestDatabase } from "../testing/database";
import { loanTestKit } from "../testing/loans";
import { approveLoanRequest } from "./approval";
import { cancelLoan } from "./cancellation";
import {
  answerLoanCondition,
  readLoanConditionReports,
  reportLoanCondition,
} from "./condition";
import { reportHandover } from "./handover";
import { readLoanHistory } from "./history";
import { readLoan } from "./queries";
import { reportReturn } from "./return";

/**
 * PS-LOAN-023 (OD-0033): damage, deficiency and loss are the parties'
 * traceable statements. Either party reports from the handover on, also
 * after the loan ended; the other party answers once, disagreeing or
 * explaining, without changing the report. Nothing of it changes the
 * loan's status or holds up its ending, and to anyone but the parties,
 * other co-owners included, the loan does not exist.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());

const kit = loanTestKit(db);
const {
  run,
  tick,
  user,
  published,
  addCoOwner,
  ask,
  environmentOrigin,
  dated,
  reservedLoan,
  eventsFor,
} = kit;

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };

const handOver = (actor: UserActor, loanId: string) =>
  run(reportHandover, actor, {
    loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  });

const report = (actor: UserActor, loanId: string, description: string) =>
  run(reportLoanCondition, actor, { loanId, description });

const answer = (
  actor: UserActor,
  loanId: string,
  reportId: string,
  kind: "disagreement" | "explanation",
  description: string,
) => run(answerLoanCondition, actor, { loanId, reportId, kind, description });

const reportsOf = async (actor: UserActor, loanId: string) =>
  loanConditionReportsSchema.parse(
    await executeQuery(tick(), readLoanConditionReports, {
      actor,
      input: { loanId },
    }),
  );

const statusOf = async (loanId: string) =>
  db
    .selectFrom("app.loans")
    .select(["status", "end_reason"])
    .where("id", "=", loanId)
    .executeTakeFirstOrThrow();

/**
 * A loan for days 0–2, handed over today, approved while `circle` already
 * co-owned the object with the lender.
 */
async function activeLoan() {
  const setup = await published();
  const circle = await user();
  await addCoOwner(setup.owner, setup.objectId, circle);
  const { requestId } = await ask(
    setup.borrower,
    setup.objectId,
    environmentOrigin(setup.environmentId),
    dated(0, 2),
  );
  const { loanId } = await run(approveLoanRequest, setup.owner, {
    requestId,
  });
  await handOver(setup.owner, loanId);

  return { ...setup, circle, loanId };
}

describe("damage, deficiency and loss (PS-LOAN-023)", () => {
  it("lets either party report and the other answer, without changing the loan", async () => {
    const { owner, borrower, loanId } = await activeLoan();
    const before = await statusOf(loanId);

    const fromBorrower = await report(
      borrower,
      loanId,
      "  Ripe i lakken på venstre side.  ",
    );
    expect(fromBorrower).toEqual({
      loanId,
      reportId: expect.any(String),
      answerId: null,
    });
    const fromLender = await report(owner, loanId, "Mangler en stropp.");
    const answered = await answer(
      owner,
      loanId,
      fromBorrower.reportId,
      "disagreement",
      "Ripen var der før lånet.",
    );
    expect(answered).toEqual({
      loanId,
      reportId: fromBorrower.reportId,
      answerId: expect.any(String),
    });
    await answer(
      borrower,
      loanId,
      fromLender.reportId,
      "explanation",
      "Stroppen ble igjen hjemme, jeg leverer den.",
    );

    expect(await statusOf(loanId)).toEqual(before);
    expect((await reportsOf(borrower, loanId)).reports).toEqual([
      {
        id: fromBorrower.reportId,
        side: "borrower",
        you: true,
        realName: expect.any(String),
        description: "Ripe i lakken på venstre side.",
        reportedAt: expect.any(String),
        answer: {
          id: answered.answerId,
          side: "lender",
          you: false,
          realName: expect.any(String),
          description: "Ripen var der før lånet.",
          reportedAt: expect.any(String),
          kind: "disagreement",
        },
        answerable: false,
      },
      expect.objectContaining({
        id: fromLender.reportId,
        side: "lender",
        you: false,
        answer: expect.objectContaining({ kind: "explanation", you: true }),
        answerable: false,
      }),
    ]);
  });

  it("offers the other side, and only them, to answer while there is no answer", async () => {
    const { owner, borrower, loanId } = await activeLoan();
    const { reportId } = await report(borrower, loanId, "Bulk i felgen.");

    const forLender = await reportsOf(owner, loanId);
    expect(forLender).toMatchObject({
      mayReport: true,
      reports: [{ id: reportId, you: false, answerable: true, answer: null }],
    });
    expect((await reportsOf(borrower, loanId)).reports).toMatchObject([
      { you: true, answerable: false },
    ]);

    await expect(
      answer(borrower, loanId, reportId, "explanation", "Min egen."),
    ).rejects.toMatchObject(forbidden);
    await answer(owner, loanId, reportId, "explanation", "Den var der.");
    await expect(
      answer(owner, loanId, reportId, "disagreement", "Igjen."),
    ).rejects.toMatchObject(conflict);
    expect((await reportsOf(owner, loanId)).reports).toMatchObject([
      { answerable: false, answer: { kind: "explanation" } },
    ]);
  });

  it("answers only a report on the same loan, never an answer", async () => {
    const first = await activeLoan();
    const second = await activeLoan();
    const { reportId } = await report(first.borrower, first.loanId, "Skade.");
    const { answerId } = await answer(
      first.owner,
      first.loanId,
      reportId,
      "disagreement",
      "Uenig.",
    );

    // Another loan's report, or an answer, is not a report on this loan.
    await expect(
      answer(second.owner, second.loanId, reportId, "explanation", "Hm."),
    ).rejects.toMatchObject(notFound);
    await expect(
      answer(first.borrower, first.loanId, answerId!, "explanation", "Hm."),
    ).rejects.toMatchObject(notFound);
    await expect(
      answer(first.owner, first.loanId, randomUUID(), "explanation", "Hm."),
    ).rejects.toMatchObject(notFound);
  });

  it("is for the parties only: others get the same answer as for no loan", async () => {
    const { owner, borrower, circle, objectId, loanId } = await activeLoan();
    const later = await user();
    await addCoOwner(owner, objectId, later);
    const stranger = await user();
    const { reportId } = await report(borrower, loanId, "Sprekk i hjulet.");

    for (const outsider of [circle, later, stranger]) {
      for (const [id, existing] of [
        [loanId, reportId],
        [randomUUID(), randomUUID()],
      ] as const) {
        await expect(report(outsider, id, "Skade.")).rejects.toMatchObject(
          notFound,
        );
        await expect(
          answer(outsider, id, existing, "disagreement", "Nei."),
        ).rejects.toMatchObject(notFound);
        await expect(reportsOf(outsider, id)).rejects.toMatchObject(notFound);
      }
    }
  });

  it("accepts reports after the loan ended, without reopening it", async () => {
    const { owner, borrower, loanId } = await activeLoan();
    await run(reportReturn, owner, {
      loanId,
      agreementVersion: 1,
      outcome: "received",
      immediately: true,
    });
    expect(await statusOf(loanId)).toEqual({
      status: "ended",
      end_reason: "returned",
    });

    const { reportId } = await report(owner, loanId, "Oppdaget en sprekk.");
    await answer(borrower, loanId, reportId, "explanation", "Den var der.");

    expect(await statusOf(loanId)).toEqual({
      status: "ended",
      end_reason: "returned",
    });
    expect((await reportsOf(owner, loanId)).mayReport).toBe(true);
  });

  it("needs the object to have been with the borrower", async () => {
    const reserved = await reservedLoan(1, 3);
    expect(
      (await reportsOf(reserved.borrower, reserved.loanId)).mayReport,
    ).toBe(false);
    await expect(
      report(reserved.borrower, reserved.loanId, "Skade."),
    ).rejects.toMatchObject(conflict);

    await run(cancelLoan, reserved.borrower, { loanId: reserved.loanId });
    await expect(
      report(reserved.owner, reserved.loanId, "Skade."),
    ).rejects.toMatchObject(conflict);
  });

  it("tells the timeline who reported and answered, never what they wrote", async () => {
    const { owner, borrower, loanId } = await activeLoan();
    const { reportId } = await report(borrower, loanId, "Hemmelig skadetekst");
    await answer(owner, loanId, reportId, "explanation", "Hemmelig svartekst");

    const { entries } = loanHistorySchema.parse(
      await executeQuery(tick(), readLoanHistory, {
        actor: owner,
        input: { loanId },
      }),
    );
    expect(entries.slice(0, 2)).toMatchObject([
      {
        event: "condition_answered",
        side: "lender",
        answerKind: "explanation",
        actor: { you: true },
      },
      {
        event: "condition_reported",
        side: "borrower",
        actor: { you: false, role: "borrower" },
      },
    ]);
    const events = JSON.stringify(await eventsFor("loan", loanId));
    expect(events).toContain("loan.condition_reported");
    expect(events).not.toContain("Hemmelig");
    expect(JSON.stringify(entries)).not.toContain("Hemmelig");
  });

  it("leaves the loan as its parties see it", async () => {
    const { owner, borrower, loanId } = await activeLoan();
    const before = await executeQuery(tick(), readLoan, {
      actor: borrower,
      input: { loanId },
    });
    await report(owner, loanId, "Skade på håndtaket.");

    const after = await executeQuery(tick(), readLoan, {
      actor: borrower,
      input: { loanId },
    });
    expect(after.status).toBe(before.status);
    expect(after.actions).toEqual(before.actions);
  });
});

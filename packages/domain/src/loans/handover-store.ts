import type { HandoverOutcome, LoanRequestRole } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import {
  type HandoverReading,
  type HandoverStatement,
  handoverAnswerDue,
  noHandoverStatements,
  type StoredLoanStatus,
} from "./model";
import { committedLoanStatuses } from "./reservations";

/**
 * Database access for the parties' statements about the handover (WP-33,
 * PS-LOAN-012–013). Statements are append-only; only the latest of each side
 * on the current agreement version counts. The database lets only a party
 * speak for their side and checks at commit that the loan's status is what
 * the statements say.
 */
type Db = Kysely<Database>;

/** The latest statement of each side on agreement `version`. */
export async function loadHandoverReading(
  db: Db,
  loanId: string,
  version: number,
): Promise<HandoverReading> {
  const rows = await db
    .selectFrom("app.loan_handover_reports")
    .select(["reporter_role", "outcome", "reported_at", "answer_due_at"])
    .where("loan_id", "=", loanId)
    .where("agreement_version", "=", version)
    .orderBy("position")
    .execute();

  // Later rows replace earlier ones of the same side.
  return rows.reduce<HandoverReading>(
    (reading, row) => ({
      ...reading,
      [row.reporter_role]: {
        outcome: row.outcome as HandoverOutcome,
        reportedAt: row.reported_at,
        answerDueAt: row.answer_due_at,
      },
    }),
    noHandoverStatements,
  );
}

/** Records what `role` says now; «not handed over» starts a deadline. */
export async function insertHandoverStatement(
  db: Db,
  input: {
    readonly loanId: string;
    readonly agreementVersion: number;
    readonly userId: string;
    readonly role: LoanRequestRole;
    readonly outcome: HandoverOutcome;
    readonly now: Date;
  },
): Promise<HandoverStatement> {
  const statement: HandoverStatement = {
    outcome: input.outcome,
    reportedAt: input.now,
    answerDueAt:
      input.outcome === "not_handed_over" ? handoverAnswerDue(input.now) : null,
  };

  await db
    .insertInto("app.loan_handover_reports")
    .values({
      loan_id: input.loanId,
      agreement_version: input.agreementVersion,
      reported_by_user_id: input.userId,
      reporter_role: input.role,
      outcome: statement.outcome,
      reported_at: statement.reportedAt,
      answer_due_at: statement.answerDueAt,
    })
    .execute();

  return statement;
}

/** Moves a loan that has not ended from `from` to `to`. */
export async function setLoanStatus(
  db: Db,
  input: {
    readonly loanId: string;
    readonly from: StoredLoanStatus;
    readonly to: Exclude<StoredLoanStatus, "ended">;
    readonly now: Date;
  },
): Promise<void> {
  const changed = await db
    .updateTable("app.loans")
    .set({ status: input.to, status_changed_at: input.now })
    .where("id", "=", input.loanId)
    .where("status", "=", input.from)
    .executeTakeFirst();

  if (changed.numUpdatedRows !== 1n) {
    throw new Error(`Only a ${input.from} loan becomes ${input.to}`);
  }
}

/**
 * Reserved loans whose «not handed over» statement may have gone unanswered
 * past its deadline, oldest deadline first. Only candidates: the caller
 * re-reads each under its locks.
 */
export async function dueHandoverAnswers(
  db: Db,
  now: Date,
  limit: number,
): Promise<{ loanId: string; objectId: string }[]> {
  const rows = await db
    .selectFrom("app.loan_handover_reports as report")
    .innerJoin("app.loans as loan", "loan.id", "report.loan_id")
    .select(["loan.id", "loan.object_id", "report.answer_due_at"])
    .where("loan.status", "=", "reserved")
    .where("report.answer_due_at", "<=", now)
    .where(
      "report.agreement_version",
      "=",
      sql<number>`(app.current_loan_agreement(loan.id)).version`,
    )
    .orderBy("report.answer_due_at")
    .limit(limit)
    .execute();

  // A loan is listed once per statement; the first is enough.
  const seen = new Set<string>();

  return rows.flatMap((row) => {
    if (seen.has(row.id) || row.object_id === null) {
      return [];
    }

    seen.add(row.id);
    return [{ loanId: row.id, objectId: row.object_id }];
  });
}

/**
 * The object's other loans that still hold it: those whose parties should
 * learn that a disputed handover may threaten them (scenario 61).
 */
export async function otherCommittedLoans(
  db: Db,
  objectId: string,
  loanId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom("app.loans")
    .select("id")
    .where("object_id", "=", objectId)
    .where("id", "<>", loanId)
    .where("status", "in", [...committedLoanStatuses])
    .orderBy("approved_at")
    .orderBy("id")
    .execute();

  return rows.map((row) => row.id);
}

/**
 * Locks the object unless another transaction holds it, so the scheduled
 * job never waits on a command; it tries again on its next run.
 */
export async function tryLockObject(db: Db, objectId: string) {
  return db
    .selectFrom("app.objects")
    .select("id")
    .where("id", "=", objectId)
    .forUpdate()
    .skipLocked()
    .executeTakeFirst();
}

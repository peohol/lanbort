import type { LoanRequestRole, ReturnOutcome } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import {
  type ReturnConfirmation,
  type ReturnStatement,
  returnEffectiveAt,
} from "./model";

/**
 * Database access for the parties' statements about the return (WP-34,
 * PS-LOAN-014–017) and for return confirmations in their undo buffer
 * (PS-LOAN-016). Statements are append-only; all of them on the current
 * agreement version count, in order. The database lets only a party speak
 * for their side and checks at commit that the loan's status is what the
 * statements say.
 */
type Db = Kysely<Database>;

/** The return statements on agreement `version`, in the order they were made. */
export async function loadReturnStatements(
  db: Db,
  loanId: string,
  version: number,
): Promise<ReturnStatement[]> {
  const rows = await db
    .selectFrom("app.loan_return_reports")
    .select(["reporter_role", "outcome", "reported_at"])
    .where("loan_id", "=", loanId)
    .where("agreement_version", "=", version)
    .orderBy("position")
    .execute();

  return rows.map((row) => ({
    role: row.reporter_role as LoanRequestRole,
    outcome: row.outcome as ReturnOutcome,
    reportedAt: row.reported_at,
  }));
}

/** Records what `role` says now, made from `confirmationId` if it waited. */
export async function insertReturnStatement(
  db: Db,
  input: {
    readonly loanId: string;
    readonly agreementVersion: number;
    readonly userId: string;
    readonly role: LoanRequestRole;
    readonly outcome: ReturnOutcome;
    readonly confirmationId: string | null;
    readonly now: Date;
  },
): Promise<ReturnStatement> {
  await db
    .insertInto("app.loan_return_reports")
    .values({
      loan_id: input.loanId,
      agreement_version: input.agreementVersion,
      reported_by_user_id: input.userId,
      reporter_role: input.role,
      outcome: input.outcome,
      reported_at: input.now,
      confirmation_id: input.confirmationId,
    })
    .execute();

  return { role: input.role, outcome: input.outcome, reportedAt: input.now };
}

/** A return confirmation that waits in its undo buffer. */
export interface PendingReturn {
  readonly id: string;
  readonly loanId: string;
  readonly agreementVersion: number;
  readonly userId: string;
  readonly role: LoanRequestRole;
  readonly outcome: ReturnConfirmation;
  readonly effectiveAt: Date;
}

const pendingSelection = [
  "id",
  "loan_id",
  "agreement_version",
  "requested_by_user_id",
  "reporter_role",
  "outcome",
  "effective_at",
] as const;

function toPending(row: {
  id: string;
  loan_id: string;
  agreement_version: number;
  requested_by_user_id: string;
  reporter_role: string;
  outcome: string;
  effective_at: Date;
}): PendingReturn {
  return {
    id: row.id,
    loanId: row.loan_id,
    agreementVersion: row.agreement_version,
    userId: row.requested_by_user_id,
    role: row.reporter_role as LoanRequestRole,
    outcome: row.outcome as ReturnConfirmation,
    effectiveAt: row.effective_at,
  };
}

/**
 * The loan's waiting confirmations, the earliest to take effect first; only
 * `role`'s with `role`, only those due by `dueBy` with `dueBy`.
 */
export async function findPendingReturns(
  db: Db,
  loanId: string,
  options: { readonly role?: LoanRequestRole; readonly dueBy?: Date } = {},
): Promise<PendingReturn[]> {
  let query = db
    .selectFrom("app.loan_return_confirmations")
    .select(pendingSelection)
    .where("loan_id", "=", loanId)
    .where("status", "=", "pending");

  if (options.role) {
    query = query.where("reporter_role", "=", options.role);
  }

  if (options.dueBy) {
    query = query.where("effective_at", "<=", options.dueBy);
  }

  const rows = await query.orderBy("effective_at").orderBy("id").execute();

  return rows.map(toPending);
}

/** Starts the undo buffer of a confirmation `role` makes now. */
export async function insertPendingReturn(
  db: Db,
  input: {
    readonly loanId: string;
    readonly agreementVersion: number;
    readonly userId: string;
    readonly role: LoanRequestRole;
    readonly outcome: ReturnConfirmation;
    readonly now: Date;
  },
): Promise<PendingReturn> {
  const effectiveAt = returnEffectiveAt(input.now);
  const row = await db
    .insertInto("app.loan_return_confirmations")
    .values({
      loan_id: input.loanId,
      agreement_version: input.agreementVersion,
      requested_by_user_id: input.userId,
      reporter_role: input.role,
      outcome: input.outcome,
      requested_at: input.now,
      effective_at: effectiveAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { id: row.id, ...input, effectiveAt };
}

/**
 * Ends a waiting confirmation: `withdrawn` by its party within the buffer,
 * `applied` as it becomes a statement, or `lapsed`.
 */
export async function resolvePendingReturn(
  db: Db,
  input: {
    readonly id: string;
    readonly status: "withdrawn" | "applied" | "lapsed";
    readonly now: Date;
  },
): Promise<void> {
  const resolved = await db
    .updateTable("app.loan_return_confirmations")
    .set({ status: input.status, resolved_at: input.now })
    .where("id", "=", input.id)
    .where("status", "=", "pending")
    .executeTakeFirst();

  if (resolved.numUpdatedRows !== 1n) {
    throw new Error("Only a waiting return confirmation is resolved");
  }
}

/**
 * Waiting confirmations whose buffer is over, the earliest first. Only
 * candidates: the caller re-reads each under its locks.
 */
export async function dueReturnConfirmations(
  db: Db,
  now: Date,
  limit: number,
): Promise<{ loanId: string; objectId: string }[]> {
  const rows = await db
    .selectFrom("app.loan_return_confirmations as confirmation")
    .innerJoin("app.loans as loan", "loan.id", "confirmation.loan_id")
    .select(["loan.id", "loan.object_id"])
    .where("confirmation.status", "=", "pending")
    .where("confirmation.effective_at", "<=", now)
    .orderBy("confirmation.effective_at")
    .limit(limit)
    .execute();

  // A loan is listed once per confirmation; the first is enough.
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
 * How `role`'s latest return confirmation on the loan ended, if it has one:
 * an undo that comes again, or too late, is told apart by it.
 */
export async function latestConfirmationStatus(
  db: Db,
  loanId: string,
  role: LoanRequestRole,
): Promise<string | null> {
  const row = await db
    .selectFrom("app.loan_return_confirmations")
    .select("status")
    .where("loan_id", "=", loanId)
    .where("reporter_role", "=", role)
    .orderBy("requested_at", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();

  return row?.status ?? null;
}

/**
 * PS-LOAN-017: a loan that ended as returned is open again, disputed, after
 * a party contradicted the receipt. Its ending stays in the statements and
 * events; the loan holds no reservation again.
 */
export async function reopenLoan(
  db: Db,
  input: { readonly loanId: string; readonly now: Date },
): Promise<void> {
  const reopened = await db
    .updateTable("app.loans")
    .set({
      status: "return_disputed",
      end_reason: null,
      ended_at: null,
      ended_by_user_id: null,
      status_changed_at: input.now,
    })
    .where("id", "=", input.loanId)
    .where("status", "=", "ended")
    .where("end_reason", "=", "returned")
    .executeTakeFirst();

  if (reopened.numUpdatedRows !== 1n) {
    throw new Error("Only a loan that ended as returned reopens");
  }
}

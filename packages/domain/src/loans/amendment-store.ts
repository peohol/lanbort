import type { LoanAmendmentStatus, LoanRequestRole } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { LoanPeriodInterval } from "./model";
import { rangeOf } from "./reservations";

/**
 * Database access for proposed agreement changes (WP-32, PS-LOAN-010). A
 * proposal changes nothing; only accepting it does (`agreeLoanPeriod`). The
 * database allows one open proposal per loan and lets only the right party
 * answer it.
 */
type Db = Kysely<Database>;

export interface LoanAmendmentRecord {
  readonly id: string;
  readonly loanId: string;
  /** The agreement version it was proposed on. */
  readonly baseVersion: number;
  readonly proposedByUserId: string;
  readonly proposerRole: LoanRequestRole;
  readonly period: LoanPeriodInterval;
  readonly status: LoanAmendmentStatus;
  readonly proposedAt: Date;
}

const amendmentSelection = [
  "id",
  "loan_id",
  "base_version",
  "proposed_by_user_id",
  "proposer_role",
  sql<string>`lower(period)::text`.as("from"),
  sql<string>`upper(period)::text`.as("until"),
  "status",
  "proposed_at",
] as const;

function toAmendment(row: {
  id: string;
  loan_id: string;
  base_version: number;
  proposed_by_user_id: string;
  proposer_role: string;
  from: string;
  until: string;
  status: string;
  proposed_at: Date;
}): LoanAmendmentRecord {
  return {
    id: row.id,
    loanId: row.loan_id,
    baseVersion: row.base_version,
    proposedByUserId: row.proposed_by_user_id,
    proposerRole: row.proposer_role as LoanRequestRole,
    period: { from: row.from, until: row.until },
    status: row.status as LoanAmendmentStatus,
    proposedAt: row.proposed_at,
  };
}

/** One proposal of the loan, locked with `lock`. */
export async function findAmendment(
  db: Db,
  loanId: string,
  amendmentId: string,
  options: { lock?: boolean } = {},
): Promise<LoanAmendmentRecord | null> {
  let query = db
    .selectFrom("app.loan_amendments")
    .select(amendmentSelection)
    .where("id", "=", amendmentId)
    .where("loan_id", "=", loanId);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row ? toAmendment(row) : null;
}

/** The loan's open proposal, if any. */
export async function findOpenAmendment(
  db: Db,
  loanId: string,
): Promise<LoanAmendmentRecord | null> {
  const row = await db
    .selectFrom("app.loan_amendments")
    .select(amendmentSelection)
    .where("loan_id", "=", loanId)
    .where("status", "=", "proposed")
    .executeTakeFirst();

  return row ? toAmendment(row) : null;
}

export async function insertAmendment(
  db: Db,
  input: {
    readonly loanId: string;
    readonly baseVersion: number;
    readonly userId: string;
    readonly role: LoanRequestRole;
    readonly period: LoanPeriodInterval;
    readonly now: Date;
  },
): Promise<string> {
  const row = await db
    .insertInto("app.loan_amendments")
    .values({
      loan_id: input.loanId,
      base_version: input.baseVersion,
      proposed_by_user_id: input.userId,
      proposer_role: input.role,
      period: rangeOf(input.period),
      proposed_at: input.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return row.id;
}

/** Answers an open proposal; the database checks who may answer how. */
export async function answerAmendment(
  db: Db,
  input: {
    readonly amendmentId: string;
    readonly status: Extract<
      LoanAmendmentStatus,
      "accepted" | "declined" | "withdrawn"
    >;
    readonly userId: string;
    readonly now: Date;
  },
): Promise<void> {
  const answered = await db
    .updateTable("app.loan_amendments")
    .set({
      status: input.status,
      resolved_at: input.now,
      resolved_by_user_id: input.userId,
    })
    .where("id", "=", input.amendmentId)
    .where("status", "=", "proposed")
    .executeTakeFirst();

  if (answered.numUpdatedRows !== 1n) {
    throw new Error("Only an open proposal is answered");
  }
}

/**
 * PS-LOAN-010: the agreed change becomes the agreement's next version, a
 * copy of the current one with the new period, and the reservation moves to
 * that period. The proposal is marked accepted first, as the database
 * requires for the new version. The exclusion constraint refuses a period
 * another loan holds, also if the caller's checks were bypassed.
 */
export async function agreeLoanPeriod(
  db: Db,
  input: {
    readonly loanId: string;
    readonly amendmentId: string;
    readonly acceptedByUserId: string;
    readonly version: number;
    readonly period: LoanPeriodInterval;
    readonly now: Date;
  },
): Promise<void> {
  await answerAmendment(db, {
    amendmentId: input.amendmentId,
    status: "accepted",
    userId: input.acceptedByUserId,
    now: input.now,
  });

  await sql`
    insert into app.loan_agreements (
      loan_id, version, object_version, terms_version, title, category_id,
      description, loan_terms, period, lender_user_id,
      responsibility_declaration_version, recorded_at
    )
    select agreement.loan_id, agreement.version + 1, agreement.object_version,
      agreement.terms_version, agreement.title, agreement.category_id,
      agreement.description, agreement.loan_terms, ${rangeOf(input.period)},
      loan.responsible_lender_id, agreement.responsibility_declaration_version,
      ${input.now}
    from app.loan_agreements as agreement
    join app.loans as loan on loan.id = agreement.loan_id
    where agreement.loan_id = ${input.loanId}
      and agreement.version = ${input.version}
  `.execute(db);

  await db
    .updateTable("app.loan_reservations")
    .set({ period: rangeOf(input.period) })
    .where("loan_id", "=", input.loanId)
    .execute();
}

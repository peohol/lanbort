import type { LoanStatus } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type { AvailabilityBlockSource } from "../objects/blocks";
import type { ObjectCommitmentSource } from "../objects/commitments";
import type { ObjectState } from "../objects/state";
import type { LoanPeriodInterval } from "./model";

/**
 * Database access for approved loans (WP-31): the loan, its agreement
 * snapshot and the reservation of its period. Commands lock the object
 * before they reserve, so approvals of one object run one after another; the
 * database's exclusion constraint refuses overlapping reservations anyway.
 */
type Db = Kysely<Database>;

/** Loan statuses that hold the object: its period and its lender. */
export const committedLoanStatuses: readonly LoanStatus[] = ["reserved"];

const rangeOf = (period: LoanPeriodInterval) =>
  sql<string>`daterange(${period.from}::date, ${period.until}::date, '[)')`;

/**
 * PS-OBJ-004: a reservation blocks its period for new loans, globally for
 * the object (vision «Godkjenning og reservasjon»).
 */
export const loanReservationBlocks: AvailabilityBlockSource = {
  name: "loan_reservations",
  load: async (db, objectIds) => {
    if (objectIds.length === 0) {
      return [];
    }

    const rows = await db
      .selectFrom("app.loan_reservations")
      .select([
        "object_id",
        sql<string>`lower(period)::text`.as("from"),
        sql<string>`upper(period)::text`.as("until"),
      ])
      .where("object_id", "in", objectIds)
      .execute();

    return rows.map((row) => ({
      objectId: row.object_id,
      period: { from: row.from, until: row.until },
    }));
  },
};

/**
 * PS-OBJ-010/011: a reserved loan is a commitment of its responsible lender,
 * so they cannot leave the object, and nobody can delete it, while it lasts.
 */
export const loanCommitments: ObjectCommitmentSource = {
  name: "loans",
  load: async (db, objectId) => {
    const rows = await db
      .selectFrom("app.loans")
      .select("responsible_lender_id")
      .where("object_id", "=", objectId)
      .where("status", "in", [...committedLoanStatuses])
      .execute();

    return rows.map((row) => ({
      responsibleOwnerId: row.responsible_lender_id,
    }));
  },
};

/**
 * PS-LOAN-006/008: makes the request a loan, as one whole: the loan with the
 * approver as responsible lender, its agreement (version 1) copied from the
 * object as it is now, the reservation of `period`, and the request marked
 * approved. The caller has checked everything and holds the object's lock;
 * the database refuses the rest (WP-31 migration).
 */
export async function reserveLoan(
  db: Db,
  input: {
    readonly requestId: string;
    readonly object: ObjectState;
    readonly borrowerUserId: string;
    readonly lenderUserId: string;
    readonly termsVersion: number;
    readonly responsibilityDeclarationVersion: number | null;
    readonly period: LoanPeriodInterval;
    readonly now: Date;
  },
): Promise<string> {
  const { object, now } = input;
  const loan = await db
    .insertInto("app.loans")
    .values({
      request_id: input.requestId,
      object_id: object.objectId,
      borrower_user_id: input.borrowerUserId,
      responsible_lender_id: input.lenderUserId,
      approved_at: now,
      status_changed_at: now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("app.loan_agreements")
    .values({
      loan_id: loan.id,
      version: 1,
      object_version: object.version,
      terms_version: input.termsVersion,
      title: object.title,
      category_id: object.categoryId,
      description: object.description,
      loan_terms: object.loanTerms,
      period: rangeOf(input.period),
      lender_user_id: input.lenderUserId,
      responsibility_declaration_version:
        input.responsibilityDeclarationVersion,
      recorded_at: now,
    })
    .execute();

  await db
    .insertInto("app.loan_reservations")
    .values({
      loan_id: loan.id,
      object_id: object.objectId,
      period: rangeOf(input.period),
    })
    .execute();

  await db
    .updateTable("app.loan_requests")
    .set({ status: "approved", status_changed_at: now })
    .where("id", "=", input.requestId)
    .execute();

  return loan.id;
}

export interface LoanRecord {
  readonly id: string;
  readonly requestId: string;
  readonly objectId: string;
  readonly borrowerUserId: string;
  readonly responsibleLenderId: string;
  readonly status: LoanStatus;
  readonly approvedAt: Date;
  readonly agreement: {
    readonly version: number;
    readonly objectVersion: number;
    readonly title: string;
    readonly categoryId: string;
    readonly description: string;
    readonly loanTerms: string | null;
    readonly period: LoanPeriodInterval;
    readonly responsibilityDeclarationVersion: number | null;
  };
}

/** The loan with its current agreement, by its id or its request's. */
export async function findLoan(
  db: Db,
  by: { readonly loanId: string } | { readonly requestId: string },
): Promise<LoanRecord | null> {
  const row = await db
    .selectFrom("app.loans as loan")
    .innerJoin(
      "app.loan_agreements as agreement",
      "agreement.loan_id",
      "loan.id",
    )
    .select([
      "loan.id",
      "loan.request_id",
      "loan.object_id",
      "loan.borrower_user_id",
      "loan.responsible_lender_id",
      "loan.status",
      "loan.approved_at",
      "agreement.version",
      "agreement.object_version",
      "agreement.title",
      "agreement.category_id",
      "agreement.description",
      "agreement.loan_terms",
      sql<string>`lower(agreement.period)::text`.as("from"),
      sql<string>`upper(agreement.period)::text`.as("until"),
      "agreement.responsibility_declaration_version",
    ])
    .where(
      "loanId" in by ? "loan.id" : "loan.request_id",
      "=",
      "loanId" in by ? by.loanId : by.requestId,
    )
    .orderBy("agreement.version", "desc")
    .limit(1)
    .executeTakeFirst();

  return row
    ? {
        id: row.id,
        requestId: row.request_id,
        objectId: row.object_id,
        borrowerUserId: row.borrower_user_id,
        responsibleLenderId: row.responsible_lender_id,
        status: row.status as LoanStatus,
        approvedAt: row.approved_at,
        agreement: {
          version: row.version,
          objectVersion: row.object_version,
          title: row.title,
          categoryId: row.category_id,
          description: row.description,
          loanTerms: row.loan_terms,
          period: { from: row.from, until: row.until },
          responsibilityDeclarationVersion:
            row.responsibility_declaration_version,
        },
      }
    : null;
}

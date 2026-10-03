import type { ResponsibilityTransferKind } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";

/**
 * Database access for the transfer of the responsible lender and the narrow
 * receipt (WP-35, PS-LOAN-009, PS-LOAN-015). Who may step into the lender's
 * side is one rule in the database (`app.loan_co_owner_standing`,
 * `app.loan_receives_for_lender`), which also guards every row; the domain
 * reads the same rule rather than restating it.
 */
type Db = Kysely<Database>;

/**
 * How a co-owner could step into the lender's side: `circle` if they owned
 * the object when the loan was approved, `later` if they joined since and
 * so need the borrower's consent. Null when they cannot: a party, not an
 * owner now, or blocked with the borrower.
 */
export type CoOwnerStanding = "circle" | "later" | null;

const loanRow = (loanId: string) =>
  sql`(select loan from app.loans as loan where loan.id = ${loanId})`;

/** What `userId` could do for the loan's lender side, read in one go. */
export interface CoOwnerReach {
  readonly standing: CoOwnerStanding;
  /** The responsible lender is established as really unavailable. */
  readonly lenderUnavailable: boolean;
  /** May confirm the receipt for the lender's side (PS-LOAN-015). */
  readonly receivesForLender: boolean;
}

export async function loadCoOwnerReach(
  db: Db,
  loanId: string,
  userId: string,
): Promise<CoOwnerReach> {
  const { rows } = await sql<{
    standing: CoOwnerStanding;
    unavailable: boolean;
    receives: boolean;
  }>`
    select
      app.loan_co_owner_standing(${loanRow(loanId)}, ${userId}) as standing,
      app.loan_lender_unavailable(${loanRow(loanId)}) as unavailable,
      app.loan_receives_for_lender(${loanRow(loanId)}, ${userId}) as receives
  `.execute(db);
  const [row] = rows;

  return {
    standing: row?.standing ?? null,
    lenderUnavailable: row?.unavailable ?? false,
    receivesForLender: row?.receives ?? false,
  };
}

/**
 * Whether `userId` may still speak for `role` as `reportedAs`
 * (`app.loan_speaker_allowed`): a waiting confirmation of someone who no
 * longer may lapses instead of being made.
 */
export async function speakerAllowed(
  db: Db,
  input: {
    readonly loanId: string;
    readonly role: string;
    readonly userId: string;
    readonly reportedAs: string;
  },
): Promise<boolean> {
  const { rows } = await sql<{ allowed: boolean }>`
    select app.loan_speaker_allowed(
      ${loanRow(input.loanId)}, ${input.role}, ${input.userId}, ${input.reportedAs}
    ) as allowed
  `.execute(db);

  return rows[0]?.allowed ?? false;
}

/**
 * Records that the loan's responsible lender is established as really
 * unavailable for it (PS-LOAN-009/015). When that is the case is not
 * decided (OD-0016): only the process that decides it may call this, and
 * nothing in the product does yet.
 */
export async function recordLenderUnavailability(
  db: Db,
  input: {
    readonly loanId: string;
    readonly lenderUserId: string;
    readonly now: Date;
  },
): Promise<void> {
  await db
    .insertInto("app.loan_lender_unavailability")
    .values({
      loan_id: input.loanId,
      lender_user_id: input.lenderUserId,
      established_at: input.now,
    })
    .onConflict((conflict) =>
      conflict.columns(["loan_id", "lender_user_id"]).doNothing(),
    )
    .execute();
}

/** A change of the responsible lender (`app.loan_lender_transfers`). */
export interface TransferRecord {
  readonly id: string;
  readonly loanId: string;
  readonly kind: ResponsibilityTransferKind;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly needsBorrowerConsent: boolean;
  readonly proposedAt: Date;
  readonly recipientAcceptedAt: Date | null;
  readonly borrowerConsentedAt: Date | null;
  readonly status: string;
  /** Whether it can still complete now (`app.lender_transfer_possible`). */
  readonly possible: boolean;
}

/** Whether it has every answer it needs to complete. */
export const fullyAnswered = (transfer: TransferRecord) =>
  transfer.recipientAcceptedAt !== null &&
  (!transfer.needsBorrowerConsent || transfer.borrowerConsentedAt !== null);

function transferQuery(db: Db) {
  return db
    .selectFrom("app.loan_lender_transfers as transfer")
    .select([
      "transfer.id",
      "transfer.loan_id",
      "transfer.kind",
      "transfer.from_user_id",
      "transfer.to_user_id",
      "transfer.borrower_consent_required",
      "transfer.proposed_at",
      "transfer.recipient_accepted_at",
      "transfer.borrower_consented_at",
      "transfer.status",
      sql<boolean>`app.lender_transfer_possible(transfer)`.as("possible"),
    ]);
}

type TransferRow = Awaited<
  ReturnType<ReturnType<typeof transferQuery>["execute"]>
>[number];

function toTransfer(row: TransferRow): TransferRecord {
  return {
    id: row.id,
    loanId: row.loan_id,
    kind: row.kind as ResponsibilityTransferKind,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    needsBorrowerConsent: row.borrower_consent_required,
    proposedAt: row.proposed_at,
    recipientAcceptedAt: row.recipient_accepted_at,
    borrowerConsentedAt: row.borrower_consented_at,
    status: row.status,
    possible: row.possible,
  };
}

/**
 * The loan's open transfer, or with `transferId` that transfer whatever its
 * status. With `lock`, its row is locked for the rest of the transaction
 * (the caller has locked the object and the loan before).
 */
export async function findTransfer(
  db: Db,
  loanId: string,
  options: { transferId?: string; lock?: boolean } = {},
): Promise<TransferRecord | null> {
  let query = transferQuery(db).where("transfer.loan_id", "=", loanId);

  query =
    options.transferId === undefined
      ? query.where("transfer.status", "=", "proposed")
      : query.where("transfer.id", "=", options.transferId);

  if (options.lock) {
    query = query.forUpdate();
  }

  const row = await query.executeTakeFirst();

  return row ? toTransfer(row) : null;
}

/** The open transfers to `userId` among `loanIds`, by loan. */
export async function openTransfersTo(
  db: Db,
  userId: string,
  loanIds: readonly string[],
): Promise<Map<string, TransferRecord>> {
  if (loanIds.length === 0) {
    return new Map();
  }

  const rows = await transferQuery(db)
    .where("transfer.loan_id", "in", loanIds)
    .where("transfer.to_user_id", "=", userId)
    .where("transfer.status", "=", "proposed")
    .execute();

  return new Map(rows.map((row) => [row.loan_id, toTransfer(row)]));
}

export async function insertTransfer(
  db: Db,
  input: {
    readonly loanId: string;
    readonly kind: ResponsibilityTransferKind;
    readonly fromUserId: string;
    readonly toUserId: string;
    readonly needsBorrowerConsent: boolean;
    /** A takeover by a co-owner of the circle completes at once. */
    readonly completed: boolean;
    readonly now: Date;
  },
): Promise<string> {
  const takeover = input.kind === "takeover";
  const row = await db
    .insertInto("app.loan_lender_transfers")
    .values({
      loan_id: input.loanId,
      kind: input.kind,
      from_user_id: input.fromUserId,
      to_user_id: input.toUserId,
      borrower_consent_required: input.needsBorrowerConsent,
      proposed_at: input.now,
      recipient_accepted_at: takeover ? input.now : null,
      status: input.completed ? "completed" : "proposed",
      resolved_at: input.completed ? input.now : null,
      resolved_by_user_id: input.completed ? input.toUserId : null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return row.id;
}

/** Records the recipient's acceptance or the borrower's consent. */
export async function recordAnswer(
  db: Db,
  input: {
    readonly transferId: string;
    readonly answer: "recipient" | "borrower";
    readonly now: Date;
  },
): Promise<void> {
  const column =
    input.answer === "recipient"
      ? "recipient_accepted_at"
      : "borrower_consented_at";
  const answered = await db
    .updateTable("app.loan_lender_transfers")
    .set(
      input.answer === "recipient"
        ? { recipient_accepted_at: input.now }
        : { borrower_consented_at: input.now },
    )
    .where("id", "=", input.transferId)
    .where("status", "=", "proposed")
    .where(column, "is", null)
    .executeTakeFirst();

  if (answered.numUpdatedRows !== 1n) {
    throw new Error("Only an open transfer gets each answer once");
  }
}

/** Ends an open transfer as declined, withdrawn or lapsed. */
export async function resolveTransfer(
  db: Db,
  input: {
    readonly transferId: string;
    readonly status: "declined" | "withdrawn" | "lapsed";
    readonly byUserId: string | null;
    readonly now: Date;
  },
): Promise<void> {
  const resolved = await db
    .updateTable("app.loan_lender_transfers")
    .set({
      status: input.status,
      resolved_at: input.now,
      resolved_by_user_id: input.status === "lapsed" ? null : input.byUserId,
    })
    .where("id", "=", input.transferId)
    .where("status", "=", "proposed")
    .executeTakeFirst();

  if (resolved.numUpdatedRows !== 1n) {
    throw new Error("Only an open transfer is resolved");
  }
}

/**
 * Completes an answered transfer: the recipient is the loan's responsible
 * lender from now on. The transfer first, then the loan, which the database
 * lets change only to the latest completed transfer's recipient.
 */
export async function completeTransfer(
  db: Db,
  input: {
    readonly transfer: TransferRecord;
    readonly byUserId: string;
    readonly now: Date;
  },
): Promise<void> {
  const { transfer } = input;

  if (transfer.status === "proposed") {
    await db
      .updateTable("app.loan_lender_transfers")
      .set({
        status: "completed",
        resolved_at: input.now,
        resolved_by_user_id: input.byUserId,
      })
      .where("id", "=", transfer.id)
      .where("status", "=", "proposed")
      .execute();
  }

  const moved = await db
    .updateTable("app.loans")
    .set({ responsible_lender_id: transfer.toUserId })
    .where("id", "=", transfer.loanId)
    .where("responsible_lender_id", "=", transfer.fromUserId)
    .executeTakeFirst();

  if (moved.numUpdatedRows !== 1n) {
    throw new Error("The role moves only from its current holder");
  }
}

/**
 * The loans a co-owner who is not their party may act on now: an open
 * transfer to them, or a responsible lender established as unavailable
 * while they could step in. Only candidates: each is decided with the
 * same rules as the commands.
 */
export async function coOwnerLoanIds(
  db: Db,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom("app.loans as loan")
    .innerJoin(
      "app.object_owners as owner",
      "owner.object_id",
      "loan.object_id",
    )
    .select("loan.id")
    .where("owner.user_id", "=", userId)
    .where("loan.status", "<>", "ended")
    .where("loan.responsible_lender_id", "<>", userId)
    .where("loan.borrower_user_id", "<>", userId)
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom("app.loan_lender_transfers as transfer")
            .select("transfer.id")
            .whereRef("transfer.loan_id", "=", "loan.id")
            .where("transfer.to_user_id", "=", userId)
            .where("transfer.status", "=", "proposed"),
        ),
        sql<boolean>`app.loan_lender_unavailable(loan)`,
      ]),
    )
    .orderBy("loan.approved_at")
    .orderBy("loan.id")
    .execute();

  return rows.map((row) => row.id);
}
